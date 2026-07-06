// modules/search/rerank.ts

// Inline for now — replace with a shared import once the real ChunkRow
// type is agreed on with Track A (see docs/backend-work-split.md).
type ChunkRow = {
  id: string;
  org_id: string;
  document_id: string;
  content: string;
  embedding: number[];
  search_vector: string;
  metadata: Record<string, unknown>;
  embedding_status: 'pending' | 'completed' | 'failed';
  deleted_at: Date | null;
};

const COHERE_RERANK_URL = 'https://api.cohere.com/v2/rerank';
const COHERE_MODEL = 'rerank-english-v3.0';

type CohereRerankResult = {
  index: number;
  relevance_score: number;
};

type CohereRerankResponse = {
  results: CohereRerankResult[];
};

export async function rerank(
  question: string,
  candidates: ChunkRow[],
  topN: number = 6
): Promise<Array<{ chunk: ChunkRow; relevanceScore: number }>> {
  if (candidates.length === 0) {
    return [];
  }

  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) {
    throw new Error('COHERE_API_KEY is not set — add it to your .env and config/env.ts');
  }

  const response = await fetch(COHERE_RERANK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: COHERE_MODEL,
      query: question,
      documents: candidates.map((c) => c.content),
      top_n: Math.min(topN, candidates.length),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Cohere rerank failed (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as CohereRerankResponse;

  return data.results.map((result) => ({
    chunk: candidates[result.index],
    relevanceScore: result.relevance_score,
  }));
}