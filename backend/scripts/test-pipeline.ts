// backend/scripts/test-pipeline.ts
//
// Tests runAskPipeline() end-to-end — the real orchestrator, not a
// hand-simulated version like test-answer.ts was. Prints every AskEvent
// as it comes through so we can see status transitions, sources, and
// streamed tokens exactly as askRouter.ts (Stage 15) will eventually see them.
//
// Usage: npx tsx scripts/test-pipeline.ts "What time do deployments happen?"

import { runAskPipeline } from '../modules/ask/pipeline.js';

const ORG_ID = '00000000-0000-4000-a000-000000000000';

async function main() {
  const question = process.argv[2] ?? 'What time do deployments happen?';
  console.log(`\n=== "${question}" ===\n`);

  let answerText = '';

  for await (const event of runAskPipeline(ORG_ID, question)) {
    switch (event.type) {
      case 'status':
        console.log(`[status] ${event.status}`);
        break;
      case 'sources':
        console.log('[sources]', JSON.stringify(event.sources, null, 2));
        break;
      case 'token':
        process.stdout.write(event.text);
        answerText += event.text;
        break;
      case 'done':
        console.log('\n\n[done]');
        break;
      case 'error':
        console.error(`\n[error] ${event.message}`);
        break;
    }
  }

  if (!answerText) {
    console.log('(no answer text was streamed — check status/error events above)');
  }
}

main().catch((err) => {
  console.error('Test script error:', err);
  process.exit(1);
});