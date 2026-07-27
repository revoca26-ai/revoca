// backend/scripts/test-pipeline.ts
import { pool } from '../db/pool.js';
import { runAskPipeline } from '../modules/ask/pipeline.js';

async function runTestOnLiveOAuthData() {
  console.log('--- Running RAG Pipeline Test on OAuth Ingested Data ---\n');

  try {
    // 1. Fetch your user's org_id
    const userRes = await pool.query(
      `SELECT org_id FROM users WHERE clerk_user_id = 'user_3H6ID7t90OaDlO7GsEMFgZbKcsL' LIMIT 1;`
    );

    if (userRes.rows.length === 0) {
      console.error('Error: Could not find user in database.');
      return;
    }

    const orgId = userRes.rows[0].org_id;

    // 2. Fetch the most recent chunk ingested from your frontend/OAuth connectors
    const chunkRes = await pool.query(
      `SELECT c.content, d.title 
       FROM chunks c
       JOIN documents d ON c.document_id = d.id
       WHERE c.org_id = $1
       ORDER BY c.created_at DESC 
       LIMIT 1;`,
      [orgId]
    );

    if (chunkRes.rows.length === 0) {
      console.error('No ingested chunks found for this organization. Sync a document via frontend OAuth first.');
      return;
    }

    const latestDocument = chunkRes.rows[0].title;
    const latestContentSnippet = chunkRes.rows[0].content.slice(0, 150);

    console.log(`Document Ingested via OAuth: "${latestDocument}"`);
    console.log(`Chunk Snippet: "${latestContentSnippet}..."\n`);

    // 3. Ask your target question regarding your OAuth data (e.g. ngrok)
    const question = 'What are the latest PR request?';

    console.log(`Question: "${question}"\n`);
    process.stdout.write('Answer: ');

    // 4. Run the pipeline
    for await (const event of runAskPipeline(orgId, question)) {
      if (event.type === 'sources') {
        console.log(`\n\nFound ${event.sources.length} matching chunk(s) in database.\n`);
      } else if (event.type === 'token') {
        process.stdout.write(event.text);
      } else if (event.type === 'done') {
        console.log(`\n\nDone! Confidence score: ${event.confidence}`);
      } else if (event.type === 'error') {
        console.error(`\nError during execution: ${event.message}`);
      }
    }

  } catch (error) {
    console.error('\nPipeline Test Failed:', error);
  } finally {
    await pool.end();
  }
}

runTestOnLiveOAuthData();