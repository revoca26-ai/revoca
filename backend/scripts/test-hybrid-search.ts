import { logger } from '../utils/logger.js';
// backend/scripts/test-hybrid-search.ts
//
// Quick manual test for hybridSearch() + rerank() against your seeded chunks.
// Run with the same command you use for seed-chunks.ts (e.g. tsx or ts-node).
//
// Usage: pass a question as a CLI arg, or edit TEST_QUESTIONS below.
//   npx tsx scripts/test-hybrid-search.ts "What time do deployments happen?"

import OpenAI from 'openai';
import { Client } from 'pg';
import config from '../config/config.js';
import { hybridSearch } from '../modules/search/hybrid.js';
import { rerank } from '../modules/search/rerank.js';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

const ORG_ID = '00000000-0000-4000-a000-000000000000'; // same test org from seed-chunks.ts

const TEST_QUESTIONS = [
  'What time do deployments happen?',
  'How are tokens encrypted?',
  'What does the roadmap say about search?',
  'What happens during code freeze?',
];

// naive keyword extraction — good enough for a manual test;
// Stage 14's rewrite.ts will do this properly via Gemini later
function extractSearchTerms(question: string): string[] {
  const stopwords = new Set([
    'what', 'when', 'where', 'how', 'does', 'do', 'is', 'are', 'the', 'a', 'an',
    'about', 'says', 'say', 'happen', 'happens', 'during'
  ]);
  return question
    .toLowerCase()
    .replace(/[?.,!]/g, '')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopwords.has(word));
}

async function embedQuery(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

// Fetch full chunk rows (hybridSearch only returns id + score) so rerank()
// has the actual content to compare against the question.
async function fetchChunkRows(client: Client, chunkIds: string[]) {
  if (chunkIds.length === 0) return [];
  const { rows } = await client.query(
    `
    SELECT id, org_id, document_id, content, embedding::text AS embedding,
           metadata, embedding_status, deleted_at
    FROM chunks
    WHERE id = ANY($1::uuid[]);
    `,
    [chunkIds]
  );

  // Preserve embedding as a parsed number array to match the ChunkRow shape,
  // and re-order rows to match the original chunkIds order (SQL ANY() doesn't guarantee order).
  const byId = new Map(
    rows.map((row) => [
      row.id,
      {
        ...row,
        embedding: JSON.parse(row.embedding),
      },
    ])
  );
  return chunkIds.map((id) => byId.get(id)).filter(Boolean);
}

async function main() {
  const cliQuestion = process.argv[2];
  const questions = cliQuestion ? [cliQuestion] : TEST_QUESTIONS;

  const client = new Client({ connectionString: config.DATABASE_URL });
  await client.connect();

  try {
    for (const question of questions) {
      logger.info(`\n=== "${question}" ===`);

      const searchTerms = extractSearchTerms(question);
      logger.info(`  search terms: [${searchTerms.join(', ')}]`);

      const queryEmbedding = await embedQuery(question);
      const hybridResults = await hybridSearch(ORG_ID, queryEmbedding, searchTerms, 10);

      if (hybridResults.length === 0) {
        logger.info('  (no hybrid results)');
        continue;
      }

      logger.info('  -- hybrid (pre-rerank) --');
      for (const [i, result] of hybridResults.entries()) {
        const { rows } = await client.query(`SELECT content FROM chunks WHERE id = $1;`, [result.chunkId]);
        const preview = rows[0]?.content?.slice(0, 60) ?? '(not found)';
        logger.info(`  ${i + 1}. rrf=${result.rrfScore.toFixed(4)}  "${preview}..."`);
      }

      const candidates = await fetchChunkRows(client, hybridResults.map((r) => r.chunkId));
      const reranked = await rerank(question, candidates as any, 6);

      logger.info('  -- after rerank --');
      for (const [i, result] of reranked.entries()) {
        const preview = result.chunk.content.slice(0, 60);
        logger.info(`  ${i + 1}. relevance=${result.relevanceScore.toFixed(4)}  "${preview}..."`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  logger.error('Test script error:', err);
  process.exit(1);
});