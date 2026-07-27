// modules/ask/askRouter.ts
//
// POST /api/v1/ask         -> create a query record, return 202 immediately
// GET  /api/v1/ask/:id/stream -> SSE stream that actually runs the pipeline
// GET  /api/v1/ask/:id      -> fetch a completed (or in-progress) query
// GET  /api/v1/ask/history  -> cursor-paginated list of past queries
//
// ARCHITECTURE NOTE: per team decision, this uses the "simple" dispatch
// model — POST only creates the DB record; the actual pipeline execution
// happens inside the GET .../stream handler when the client connects to it.
// This means if a stream connection drops mid-answer, the pipeline stops
// entirely (no background continuation). See daily sync notes for the
// tradeoffs vs a true background-dispatch model.
//
// KNOWN GAP: X-Request-Id idempotency from the doc's spec is NOT implemented —
// the `queries` table has no column to store a request id against. Skipped
// for now rather than guessing a schema change unilaterally.

import { Router, Request, Response } from 'express';
import requireAuth from '../../middlewares/auth.js';
import rateLimit from '../../middlewares/rateLimit.js';
import { runAskPipeline } from './pipeline.js';
import {
  createQuery,
  getQueryById,
  completeQuery,
  markQueryFailed,
  insertQuerySources,
  getQuerySources,
  listQueryHistory,
  incrementUsage,
  getUsage,
} from './askRepository.js';

const askRouter = Router();

// ASSUMPTION: 50 questions/day per org. Not specified anywhere in the docs —
// adjust this to whatever your team actually wants for the quota limit.
const DAILY_QUOTA = 50;
const USAGE_METRIC = 'ask_queries';

askRouter.post('/', requireAuth, rateLimit, async (req: Request, res: Response) => {
  const { question } = req.body ?? {};

  if (typeof question !== 'string' || question.trim().length === 0) {
    return res.status(400).json({ error: 'question is required' });
  }
  if (question.length > 2000) {
    return res.status(400).json({ error: 'question is too long (max 2000 characters)' });
  }

  if (!req.user || !req.org_id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const orgId = req.org_id;
  const userId = req.user.id;

  const currentUsage = await getUsage(orgId, USAGE_METRIC);
  if (currentUsage >= DAILY_QUOTA) {
    return res.status(429).json({ error: 'QUOTA_EXCEEDED' });
  }

  const query = await createQuery(orgId, userId, question.trim());
  await incrementUsage(orgId, USAGE_METRIC);

  return res.status(202).json({ id: query.id });
});

askRouter.get('/history', requireAuth, async (req: Request, res: Response) => {
  if (!req.user || !req.org_id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const orgId = req.org_id;
  const userId = req.user.id;

  const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
  const cursorParam = req.query.cursor as string | undefined;

  let cursor: { createdAt: string; id: string } | undefined;
  if (cursorParam) {
    try {
      const decoded = JSON.parse(Buffer.from(cursorParam, 'base64').toString('utf-8'));
      cursor = { createdAt: decoded.createdAt, id: decoded.id };
    } catch {
      return res.status(400).json({ error: 'invalid cursor' });
    }
  }

  const rows = await listQueryHistory(orgId, userId, limit, cursor);

  const nextCursor =
    rows.length === limit
      ? Buffer.from(
          JSON.stringify({ createdAt: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id })
        ).toString('base64')
      : null;

  return res.status(200).json({ queries: rows, nextCursor });
});

askRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  if (!req.org_id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const orgId = req.org_id;
  const queryId = String(req.params.id);
  const query = await getQueryById(orgId, queryId);

  if (!query) {
    return res.status(404).json({ error: 'not found' });
  }

  const sources = await getQuerySources(orgId, query.id);
  return res.status(200).json({ ...query, sources });
});

askRouter.get('/:id/stream', requireAuth, async (req: Request, res: Response) => {
  if (!req.org_id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const orgId = req.org_id;
  const queryId = String(req.params.id);
  const query = await getQueryById(orgId, queryId);

  if (!query) {
    return res.status(404).json({ error: 'not found' });
  }
  if (query.status !== 'pending') {
    return res.status(409).json({ error: 'query already processed', status: query.status });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  function sendEvent(eventType: string, data: unknown) {
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  const startedAt = Date.now();
  let fullAnswer = '';
  let lastRewrittenQuery: unknown = null;
  let finalConfidence = 0;
  let finalSources: Array<{ chunkId: string; relevanceScore: number; citationIndex: number; snippet: string }> = [];

  try {
    for await (const event of runAskPipeline(orgId, query.question)) {
      switch (event.type) {
        case 'status':
          sendEvent('status', { status: event.status });
          break;

        case 'sources':
          finalSources = event.sources.map((s) => ({
            chunkId: s.chunkId,
            relevanceScore: s.relevanceScore,
            citationIndex: s.index,
            snippet: s.snippet,
          }));
          sendEvent('sources', { sources: event.sources });
          break;

        case 'token':
          fullAnswer += event.text;
          sendEvent('token', { text: event.text });
          break;

        case 'done': {
          finalConfidence = event.confidence;
          const latencyMs = Date.now() - startedAt;
          const status = fullAnswer.length > 0 ? 'completed' : 'insufficient_evidence';

          await completeQuery(query.id, {
            rewrittenQuery: lastRewrittenQuery,
            answer: fullAnswer,
            confidence: finalConfidence,
            latencyMs,
            status,
          });

          if (finalSources.length > 0) {
            await insertQuerySources(orgId, query.id, finalSources);
          }

          sendEvent('done', { confidence: finalConfidence });
          res.end();
          return;
        }

        case 'error': {
          const latencyMs = Date.now() - startedAt;
          await markQueryFailed(query.id, latencyMs);
          sendEvent('error', { message: event.message });
          res.end();
          return;
        }
      }
    }
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    await markQueryFailed(query.id, latencyMs);
    const message = err instanceof Error ? err.message : 'Unknown streaming error';
    sendEvent('error', { message });
    res.end();
  }
});

export default askRouter;