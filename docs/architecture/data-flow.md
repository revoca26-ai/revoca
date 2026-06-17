# Data Flow

## 1. User authentication

```
Browser → Clerk hosted UI → Clerk session JWT
Browser → API (Authorization: Bearer <jwt>)
API → Clerk JWKS verify → extract user_id, org_id
```

Clerk webhooks sync user/org records to PostgreSQL on create/update/delete. See [authentication.md](../api/authentication.md).

## 2. Integration connect (OAuth)

```
User clicks "Connect Slack"
  → GET /api/v1/integrations/slack/connect
  → 302 redirect to provider OAuth consent
  → Provider redirects to GET /api/v1/integrations/slack/callback?code=...
  → Backend exchanges code for access + refresh tokens
  → Tokens encrypted and stored in integrations table
  → Initial full sync job enqueued
  → 302 redirect to frontend /settings/integrations?connected=slack
```

Google Drive and Gmail share a single Google OAuth app with combined scopes. Slack uses a separate OAuth app.

## 3. Scheduled ingestion (poll)

```
node-cron (every 15 min per integration)
  → Load integrations WHERE status = 'active' AND last_synced_at < now() - interval
  → For each integration:
      1. Connector fetches delta since last cursor/page token
      2. Raw items passed to ingest pipeline
      3. Update last_synced_at + sync cursor
      4. Log sync_jobs row (success | failed)
```

Slack additionally receives real-time events via Events API webhook for message create/edit (Phase 1: messages only).

## 4. Ingestion pipeline

```
Raw item (email, doc, message)
  │
  ├─ Normalize: strip HTML, decode entities, extract plain text + metadata
  │
  ├─ Dedup: upsert documents on (org_id, source, external_id)
  │
  ├─ Chunk:
  │    • Target 200–400 tokens per chunk
  │    • Split on paragraph/sentence boundaries — never mid-sentence or mid-thread
  │    • Slack: one thread = one logical unit; long threads split at reply boundaries
  │    • Gmail: one email = base unit; long bodies split at paragraph boundaries
  │    • GDrive: split by heading/paragraph for Docs; page boundary for PDFs
  │
  ├─ Embed: OpenAI text-embedding-ada-002 → 1536-dim vector
  │
  └─ Persist:
       INSERT chunks (content, embedding, search_vector, metadata, org_id, document_id)
       search_vector = to_tsvector('english', content)
```

Old chunks for updated documents are soft-deleted (`deleted_at`) before new chunks are inserted.

## 5. Query flow

```
POST /api/v1/ask  { "question": "Why did we stop using Acme Corp?" }
  │
  ├─ {
  ├─ Claude rewrite → { "searchTerms": ["Acme Corp supplier", "vendor change"], "intent": "decision_rationale" }
  │
  ├─ Embed search terms (ada-002)
  │
  ├─ Hybrid search (parallel):
  │    • Semantic: cosine similarity on embedding, top 20
  │    • Keyword: ts_rank on search_vector, top 20
  │    • Merge: score = 0.7 × semantic_norm + 0.3 × keyword_norm
  │
  ├─ Rerank top 20 → top 6 (cross-encoder or Claude-based reranker)
  │
  ├─ Confidence check: if top rerank score < 0.55 → INSUFFICIENT_EVIDENCE
  │
  ├─ Claude answer generation (system prompt: answer ONLY from provided chunks)
  │
  └─ Response:
       {
         "answer": "...",
         "confidence": 0.82,
         "sources": [{ "title", "url", "snippet", "sourceType", "relevanceScore" }]
       }
```

## 6. Digest flow

```
node-cron (daily 06:00 UTC per org timezone setting)
  → SELECT chunks WHERE ingested_at > now() - interval '24 hours' AND org_id = $1
  → Claude summarizes key activity (decisions, blockers, new docs, notable threads)
  → Render HTML email template
  → Send via transactional email provider (Resend/SendGrid)
  → Log digest_deliveries row
```

Phase 2 adds WhatsApp Business delivery on the same summary payload.

## Data retention

| Data | Retention |
|------|-----------|
| Raw document content | Until user disconnects integration or deletes org |
| Chunks + embeddings | Same as parent document |
| Query history | 90 days (configurable per org, Phase 2) |
| OAuth tokens | Until integration disconnected; refresh tokens rotated on use |
| Sync job logs | 30 days |

## Failure handling

- **Connector failure:** Integration status → `error`; retry with exponential backoff (max 5 attempts); alert after 3 consecutive failures.
- **Embedding failure:** Chunk marked `embedding_status = failed`; retried on next sync pass.
- **Ask timeout:** 30 s hard limit; return `QUERY_TIMEOUT` if Claude or search exceeds budget.
