// modules/ask/pipeline.ts
//
// Orchestrates the full ask flow: rewrite -> embed -> hybrid search -> rerank
// -> confidence check -> streamed answer. Yields events matching the SSE
// contract from Stage 15 (status, token, sources, done, error), so
// askRouter.ts can just forward whatever this yields straight to the client.

import OpenAI from 'openai';
import { pool } from '../../db/pool.js';
import config from '../../config/config.js';
import { rewriteQuery } from './rewrite.js';
import { hybridSearch } from '../search/hybrid.js';
import { rerank } from '../search/rerank.js';
import { streamAnswer, type AnswerSource } from './answer.js';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

// Below this rerank relevance score, we don't trust the top result enough
// to answer confidently — per the doc's Stage 14 spec (0.55 threshold).


// KNOWN LIMITATION (as of Stage 14 testing, confirmed against seeded data):
// Cohere rerank relevance scores are not calibrated to be comparable across
// different questions — a correct top result can score anywhere from ~0.0001
// to ~0.99 depending on how lexically/semantically close the question phrasing
// is to the source text, even when the ranking itself is correct. This means
// CONFIDENCE_THRESHOLD can produce false "insufficient_evidence" rejections
// on legitimately answerable questions (confirmed case: "What does the
// roadmap say about search?" scored 0.0001 despite correctly ranking the
// right chunk #1).
//
// Not fixed yet. Options considered: lower the absolute threshold, switch to
// a relative gap between rank #1 and #2 scores, or treat this threshold as a
// secondary check rather than the primary gate. Revisit before relying on
// insufficient_evidence responses in the real product — for now this is a
// known gap, not a blocker for Stage 15 development.

const CONFIDENCE_THRESHOLD = 0.55;
const PIPELINE_TIMEOUT_MS = 25_000;

export type AskEvent =
  | { type: 'status'; status: string }
  | { type: 'token'; text: string }
  | { type: 'sources'; sources: Array<{ index: number; chunkId: string; documentId: string }> }
  | { type: 'done' }
  | { type: 'error'; message: string };

// TODO: swap this for Track A's shared embed() from modules/ingest/embedder.ts
// once it's confirmed to exist (see integration contract in the team doc).
async function embedQuestion(question: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: question,
  });
  return response.data[0].embedding;
}

export async function* runAskPipeline(
  orgId: string,
  question: string
): AsyncGenerator<AskEvent, void, unknown> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), PIPELINE_TIMEOUT_MS);

  try {
    yield { type: 'status', status: 'rewriting' };
    const rewritten = await rewriteQuery(question);

    yield { type: 'status', status: 'searching' };
    const queryEmbedding = await embedQuestion(question);
    const hybridResults = await hybridSearch(orgId, queryEmbedding, rewritten.searchTerms, 10);

    if (hybridResults.length === 0) {
      yield { type: 'status', status: 'insufficient_evidence' };
      yield { type: 'done' };
      return;
    }

    yield { type: 'status', status: 'reranking' };
    // NOTE: rerank() needs full ChunkRow objects, not just chunkId + score.
    // pipeline.ts's caller (or a repository function) is responsible for
    // fetching full rows — see fetchChunkRows() in test-answer.ts for the
    // pattern this expects. Swap this for a real chunksRepository call.
    const candidates = await fetchChunkRowsForPipeline(hybridResults.map((r) => r.chunkId));
    const reranked = await rerank(question, candidates, 6);

    const topScore = reranked[0]?.relevanceScore ?? 0;
    if (topScore < CONFIDENCE_THRESHOLD) {
      yield { type: 'status', status: 'insufficient_evidence' };
      yield { type: 'done' };
      return;
    }

    yield { type: 'status', status: 'answering' };

    const sources: AnswerSource[] = reranked.map((r, i) => ({
      index: i + 1,
      content: r.chunk.content,
    }));

    yield {
      type: 'sources',
      sources: reranked.map((r, i) => ({
        index: i + 1,
        chunkId: r.chunk.id,
        documentId: r.chunk.document_id,
      })),
    };

    for await (const token of streamAnswer(question, sources)) {
      if (timeoutController.signal.aborted) {
        yield { type: 'error', message: 'timeout' };
        return;
      }
      yield { type: 'token', text: token };
    }

    yield { type: 'done' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown pipeline error';
    yield { type: 'error', message };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Fetches full chunk rows for the given IDs, in the same order they were
// passed in (SQL's ANY() doesn't guarantee order, so we re-sort by hand).
// Uses the shared pool (same one hybrid.ts uses) rather than opening its
// own connection per call.
async function fetchChunkRowsForPipeline(chunkIds: string[]): Promise<any[]> {
  if (chunkIds.length === 0) return [];

  const { rows } = await pool.query(
    `
    SELECT id, org_id, document_id, content, embedding::text AS embedding,
           metadata, embedding_status, deleted_at
    FROM chunks
    WHERE id = ANY($1::uuid[]);
    `,
    [chunkIds]
  );

  const byId = new Map(
    rows.map((row) => [
      row.id,
      { ...row, embedding: JSON.parse(row.embedding) },
    ])
  );

  return chunkIds.map((id) => byId.get(id)).filter(Boolean);
}