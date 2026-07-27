// modules/ask/askRepository.ts
import { pool } from '../../db/pool.js';

export type QueryRow = {
  id: string;
  org_id: string;
  user_id: string;
  question: string;
  rewritten_query: unknown | null;
  answer: string | null;
  confidence: number | null;
  status: string;
  latency_ms: number | null;
  created_at: string;
};

export async function createQuery(
  orgId: string,
  userId: string,
  question: string
): Promise<QueryRow> {
  const { rows } = await pool.query<QueryRow>(
    `
    INSERT INTO queries (id, org_id, user_id, question, status, created_at)
    VALUES (uuid_generate_v4(), $1, $2, $3, 'pending', now())
    RETURNING *;
    `,
    [orgId, userId, question]
  );
  return rows[0];
}

export async function getQueryById(orgId: string, queryId: string): Promise<QueryRow | null> {
  const { rows } = await pool.query<QueryRow>(
    `SELECT * FROM queries WHERE id = $1 AND org_id = $2;`,
    [queryId, orgId]
  );
  return rows[0] ?? null;
}

export async function completeQuery(
  queryId: string,
  data: {
    rewrittenQuery: unknown;
    answer: string;
    confidence: number;
    latencyMs: number;
    status: 'completed' | 'insufficient_evidence' | 'error';
  }
): Promise<void> {
  await pool.query(
    `
    UPDATE queries
    SET rewritten_query = $2,
        answer = $3,
        confidence = $4,
        latency_ms = $5,
        status = $6
    WHERE id = $1;
    `,
    [
      queryId,
      JSON.stringify(data.rewrittenQuery),
      data.answer,
      data.confidence,
      data.latencyMs,
      data.status,
    ]
  );
}

export async function markQueryFailed(queryId: string, latencyMs: number): Promise<void> {
  await pool.query(
    `UPDATE queries SET status = 'error', latency_ms = $2 WHERE id = $1;`,
    [queryId, latencyMs]
  );
}

export async function insertQuerySources(
  orgId: string,
  queryId: string,
  sources: Array<{
    chunkId: string;
    relevanceScore: number;
    citationIndex: number;
    snippet: string;
  }>
): Promise<void> {
  if (sources.length === 0) return;

  const values: unknown[] = [];
  const placeholders: string[] = [];
  
  sources.forEach((s, i) => {
    const base = i * 6;
    placeholders.push(
      `(uuid_generate_v4(), $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, now())`
    );
    values.push(orgId, queryId, s.chunkId, s.relevanceScore, s.citationIndex, s.snippet);
  });

  await pool.query(
    `
    INSERT INTO query_sources (id, org_id, query_id, chunk_id, relevance_score, citation_index, snippet, created_at)
    VALUES ${placeholders.join(', ')};
    `,
    values
  );
}

export async function getQuerySources(orgId: string, queryId: string) {
  const { rows } = await pool.query(
    `SELECT * FROM query_sources WHERE org_id = $1 AND query_id = $2 ORDER BY citation_index;`,
    [orgId, queryId]
  );
  return rows;
}

export async function listQueryHistory(
  orgId: string,
  userId: string,
  limit: number,
  cursor?: { createdAt: string; id: string }
): Promise<QueryRow[]> {
  if (cursor) {
    const { rows } = await pool.query<QueryRow>(
      `
      SELECT * FROM queries
      WHERE org_id = $1 AND user_id = $2
        AND (created_at, id) < ($3, $4)
      ORDER BY created_at DESC, id DESC
      LIMIT $5;
      `,
      [orgId, userId, cursor.createdAt, cursor.id, limit]
    );
    return rows;
  }

  const { rows } = await pool.query<QueryRow>(
    `
    SELECT * FROM queries
    WHERE org_id = $1 AND user_id = $2
    ORDER BY created_at DESC, id DESC
    LIMIT $3;
    `,
    [orgId, userId, limit]
  );
  return rows;
}

export function currentPeriod(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function incrementUsage(orgId: string, metric: string): Promise<number> {
  const period = currentPeriod();
  const { rows } = await pool.query<{ count: number }>(
    `
    INSERT INTO usage_counters (org_id, period, metric, count)
    VALUES ($1, $2, $3, 1)
    ON CONFLICT (org_id, period, metric)
    DO UPDATE SET count = usage_counters.count + 1
    RETURNING count;
    `,
    [orgId, period, metric]
  );
  return rows[0].count;
}

export async function getUsage(orgId: string, metric: string): Promise<number> {
  const period = currentPeriod();
  const { rows } = await pool.query<{ count: number }>(
    `SELECT count FROM usage_counters WHERE org_id = $1 AND period = $2 AND metric = $3;`,
    [orgId, period, metric]
  );
  return rows[0]?.count ?? 0;
}