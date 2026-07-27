// backend/scripts/seed-chunks.ts
import { Client } from 'pg';
import OpenAI from 'openai';
import config from '../config/config.js';
import crypto from 'crypto';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

const seedData = [
  {
    title: "Engineering Onboarding & Architecture",
    provider: "google_drive",
    externalId: "seed-gdrive-onboarding-arch",
    text: "Revoca deployments happen every Tuesday morning at 10 AM UTC. All code must clear staging freeze by Monday 6 PM. Production infrastructure is built entirely using AWS ECS containers orchestrated by Terraform scripts.",
    keywords: "deployment schedule infrastructure staging freeze terraform aws ecs"
  },
  {
    title: "#announcements - Slack",
    provider: "slack",
    externalId: "seed-slack-announcements",
    text: "Hey engineering team! Reminder that code freeze for Q3 release starts tomorrow night. No manual hotfixes are allowed without explicit approval from the CTO. Check out wiki for standard operating procedures.",
    keywords: "slack announcements code freeze cto hotfixes wiki qa release"
  },
  {
    title: "Re: Security Audit Compliance Query",
    provider: "gmail",
    externalId: "seed-gmail-security-audit",
    text: "Regarding the compliance audit, our AES-256-GCM token encryption keys are automatically rotated every 90 days. State tokens use an explicit 10-minute time-to-live parameter to securely prevent cross-site request forgery.",
    keywords: "gmail security token encryption rotation aes-256-gcm csrf ttl"
  },
  {
    title: "Product Roadmap 2026",
    provider: "google_drive",
    externalId: "seed-gdrive-roadmap-2026",
    text: "The main focus of the Query Platform (Track B) includes hybrid search optimization using Reciprocal Rank Fusion (RRF), real-time answer streaming via Server-Sent Events (SSE), and historical usage quota limiting metrics.",
    keywords: "roadmap product query platform track b hybrid search rrf sse streaming counters"
  }
];

async function seed() {
  const client = new Client({ connectionString: config.DATABASE_URL });
  await client.connect();
  console.log('Starting Data Platform seeding matrix...');

  try {
    const orgId = '00000000-0000-4000-a000-000000000000';
    const userId = '11111111-1111-4000-a000-000000000000';
    const integrationId = '22222222-2222-4000-a000-000000000000'; 
    const mockClerkOrgId = 'org_clerk_test_12345';
    const mockClerkUserId = 'user_3H6ID7t90OaDlO7GsEMFgZbKcsL'; // Real Clerk User ID

    // 1. Insert into organizations
    await client.query(`
      INSERT INTO organizations (id, clerk_org_id, name, plan, timezone)
      VALUES ($1, $2, 'Test Operations Org', 'trial', 'UTC')
      ON CONFLICT (id) DO NOTHING;
    `, [orgId, mockClerkOrgId]);

    // 2. Insert into users
    await client.query(`
      INSERT INTO users (id, clerk_user_id, org_id, email, role)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO NOTHING;
    `, [userId, mockClerkUserId, orgId, 'revoca26@gmail.com', 'admin']);

    // 3. Insert mock integration to satisfy document dependency
    await client.query(`
      INSERT INTO integrations (id, org_id, provider, status)
      VALUES ($1, $2, 'google_drive', 'active')
      ON CONFLICT (id) DO NOTHING;
    `, [integrationId, orgId]);

    // 4. Process and insert document entities + chunk vector arrays
    for (const item of seedData) {
      const docId = crypto.randomUUID();

      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: item.text,
      });
      const vectorArray = embeddingResponse.data[0].embedding;

      const contentHash = crypto.createHash('sha256').update(item.text).digest('hex');

      const insertResult = await client.query(`
        INSERT INTO documents (id, org_id, integration_id, external_id, source_type, content_hash, title, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (org_id, integration_id, external_id) DO NOTHING
        RETURNING id;
      `, [
        docId,
        orgId,
        integrationId,
        item.externalId,
        item.provider,
        contentHash,
        item.title,
        JSON.stringify({
          provider: item.provider,
          keywords: item.keywords
        })
      ]);

      if (insertResult.rowCount === 0) {
        console.log(`Skipping "${item.title}" — already seeded (external_id: ${item.externalId}).`);
        continue;
      }

      const formattedVector = `[${vectorArray.join(',')}]`;

      await client.query(`
        INSERT INTO chunks (id, org_id, document_id, chunk_index, content, embedding, embedding_status)
        VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, 'completed');
      `, [orgId, docId, 0, item.text, formattedVector]);

      console.log(`Successfully seeded chunk vector for document: "${item.title}"`);
    }

    console.log('\nDatabase seeding completed successfully.');
  } catch (err) {
    console.error('Critical seeding error:', err);
  } finally {
    await client.end();
  }
}

seed();