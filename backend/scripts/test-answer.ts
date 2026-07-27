// backend/scripts/test-answer.ts
//
// Full mini end-to-end test: question -> rewrite -> hybrid search -> rerank
// -> streamed cited answer. This previews what pipeline.ts will orchestrate
// in Stage 14, minus the confidence-check gate.
//
// Usage: npx tsx scripts/test-answer.ts "What time do deployments happen?"

import OpenAI from 'openai';
import { Client } from 'pg';
import config from '../config/config.js';
import { rewriteQuery } from '../modules/ask/rewrite.js';
import { hybridSearch } from '../modules/search/hybrid.js';
import { rerank } from '../modules/search/rerank.js';
import { streamAnswer, type AnswerSource } from '../modules/ask/answer.js';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
const ORG_ID = '00000000-0000-4000-a000-000000000000';

async function embedQuery(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

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
  const byId = new Map(
    rows.map((row) => [row.id, { ...row, embedding: JSON.parse(row.embedding) }])
  );
  return chunkIds.map((id) => byId.get(id)).filter(Boolean);
}

async function main() {
  const question = process.argv[2] ?? 'What time do deployments happen?';
  console.log(`\n=== "${question}" ===\n`);

  const client = new Client({ connectionString: config.DATABASE_URL });
  await client.connect();

  try {
    console.log('-- rewrite --');
    const rewritten = await rewriteQuery(question);
    console.log(`  searchTerms: [${rewritten.searchTerms.join(', ')}]`);
    console.log(`  intent: ${rewritten.intent}\n`);

    console.log('-- hybrid search + rerank --');
    const queryEmbedding = await embedQuery(question);
    const hybridResults = await hybridSearch(ORG_ID, queryEmbedding, rewritten.searchTerms, 10);
    const candidates = await fetchChunkRows(client, hybridResults.map((r) => r.chunkId));
    const reranked = await rerank(question, candidates as any, 6);

    for (const [i, r] of reranked.entries()) {
      console.log(`  [${i + 1}] relevance=${r.relevanceScore.toFixed(4)}  "${r.chunk.content.slice(0, 60)}..."`);
    }

    const sources: AnswerSource[] = reranked.map((r, i) => ({
      index: i + 1,
      content: r.chunk.content,
    }));

    console.log('\n-- streamed answer --');
    console.log('(connecting to Gemini...)');
    let fullAnswer = '';
    let tokenCount = 0;
    for await (const token of streamAnswer(question, sources)) {
      if (tokenCount === 0) process.stdout.write('(first token received)\n');
      process.stdout.write(token);
      fullAnswer += token;
      tokenCount++;
    }
    console.log(`\n\n(stream ended, ${tokenCount} tokens received)`);
    if (tokenCount === 0) {
      console.log('WARNING: stream produced zero tokens — likely a bug in streamAnswer, not a hang.');
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Test script error:', err);
  process.exit(1);
});