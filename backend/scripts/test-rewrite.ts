// backend/scripts/test-rewrite.ts
//
// Quick manual test for rewriteQuery() — checks that Gemini produces clean
// search terms, especially on questions where naive keyword extraction
// failed before (e.g. "time" matching "time-to-live").
//
// Usage: npx tsx scripts/test-rewrite.ts

import { rewriteQuery } from '../modules/ask/rewrite.js';

const TEST_QUESTIONS = [
  'What time do deployments happen?',
  'How are tokens encrypted?',
  'What does the roadmap say about search?',
  'What happens during code freeze?',
];

async function main() {
  for (const question of TEST_QUESTIONS) {
    console.log(`\n=== "${question}" ===`);
    try {
      const result = await rewriteQuery(question);
      console.log(`  searchTerms: [${result.searchTerms.join(', ')}]`);
      console.log(`  intent: ${result.intent}`);
    } catch (err) {
      console.error('  Error:', err);
    }
  }
}

main().catch((err) => {
  console.error('Test script error:', err);
  process.exit(1);
});