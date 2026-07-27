// modules/search/hybrid.ts
import { pool } from '../../db/pool.js';

const RRF_K = 60;

export async function hybridSearch(
  orgId: string,
  queryEmbedding: number[],
  searchTerms: string[],
  limit: number = 20
): Promise<Array<{ chunkId: string; rrfScore: number }>> {
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  // Build a valid tsquery from possibly multi-word phrases.
  // Within a phrase, words are ANDed ("deployment schedule" -> "deployment & schedule").
  // Across phrases, they're ORed ("deployment schedule" | "code freeze").
  // to_tsquery requires an explicit operator between every lexeme, so a bare
  // space (which is what searchTerms.join(' | ') used to produce for
  // multi-word phrases) is invalid syntax.
  const tsQuery = searchTerms
    .map((term) =>
      term
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .join(' & ')
    )
    .filter(Boolean)
    .join(' | ');

  // Semantic leg — pgvector cosine distance, ranked ascending (closer = smaller distance)
  const semanticResult = await pool.query(
    `
    SELECT id AS chunk_id,
           ROW_NUMBER() OVER (ORDER BY embedding <=> $2) AS rank
    FROM chunks
    WHERE org_id = $1 AND deleted_at IS NULL
    ORDER BY embedding <=> $2
    LIMIT $3;
    `,
    [orgId, vectorLiteral, limit]
  );

  // Keyword leg — full-text search against generated tsvector column.
  // Skip entirely if we ended up with an empty tsQuery (e.g. searchTerms was empty),
  // since to_tsquery('') throws rather than matching nothing.
  let keywordResult: { rows: any[] } = { rows: [] };
  if (tsQuery.length > 0) {
    keywordResult = await pool.query(
      `
      SELECT id AS chunk_id,
             ROW_NUMBER() OVER (ORDER BY ts_rank(search_vector, to_tsquery('english', $2)) DESC) AS rank
      FROM chunks
      WHERE org_id = $1
        AND deleted_at IS NULL
        AND search_vector @@ to_tsquery('english', $2)
      ORDER BY ts_rank(search_vector, to_tsquery('english', $2)) DESC
      LIMIT $3;
      `,
      [orgId, tsQuery, limit]
    );
  }

  // Reciprocal Rank Fusion: score = sum of 1/(k + rank) across both legs
  const scores = new Map<string, number>();

  for (const row of semanticResult.rows) {
    const current = scores.get(row.chunk_id) ?? 0;
    scores.set(row.chunk_id, current + 1 / (RRF_K + Number(row.rank)));
  }

  for (const row of keywordResult.rows) {
    const current = scores.get(row.chunk_id) ?? 0;
    scores.set(row.chunk_id, current + 1 / (RRF_K + Number(row.rank)));
  }

  return Array.from(scores.entries())
    .map(([chunkId, rrfScore]) => ({ chunkId, rrfScore }))
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit);
}