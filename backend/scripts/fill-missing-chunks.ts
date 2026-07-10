// backend/scripts/backfill-missing-chunk.ts
//
// One-off fix: "Engineering Onboarding & Architecture" got its documents row
// inserted in an earlier partial run, but its chunk never got created because
// that run failed on chunk_index before reaching the chunks insert. Later
// reruns skipped it (ON CONFLICT DO NOTHING) since the document already existed.
// This script finds that document by external_id and inserts its missing chunk.

import { Client } from 'pg';
import OpenAI from 'openai';
import config from '../config/config.js';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

const ORG_ID = '00000000-0000-4000-a000-000000000000';
const EXTERNAL_ID = 'seed-gdrive-onboarding-arch';
const TEXT =
  "Revoca deployments happen every Tuesday morning at 10 AM UTC. All code must clear staging freeze by Monday 6 PM. Production infrastructure is built entirely using AWS ECS containers orchestrated by Terraform scripts.";

async function main() {
  const client = new Client({ connectionString: config.DATABASE_URL });
  await client.connect();

  try {
    const { rows } = await client.query(
      `SELECT id FROM documents WHERE org_id = $1 AND external_id = $2;`,
      [ORG_ID, EXTERNAL_ID]
    );

    if (rows.length === 0) {
      console.error('No document found with that external_id — nothing to backfill.');
      return;
    }

    const documentId = rows[0].id;

    const { rows: existingChunks } = await client.query(
      `SELECT id FROM chunks WHERE document_id = $1;`,
      [documentId]
    );

    if (existingChunks.length > 0) {
      console.log('This document already has chunks — nothing to do.');
      return;
    }

    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: TEXT,
    });
    const vectorArray = embeddingResponse.data[0].embedding;
    const formattedVector = `[${vectorArray.join(',')}]`;

    await client.query(
      `
      INSERT INTO chunks (id, org_id, document_id, chunk_index, content, embedding, embedding_status)
      VALUES (uuid_generate_v4(), $1, $2, 0, $3, $4, 'completed');
      `,
      [ORG_ID, documentId, TEXT, formattedVector]
    );

    console.log('Backfilled missing chunk for "Engineering Onboarding & Architecture".');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Backfill error:', err);
  process.exit(1);
});