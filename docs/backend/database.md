# Database Schema

PostgreSQL 15 + pgvector. All tables include `org_id` for tenant isolation.

## Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- optional: fuzzy title search
```

## Tables

### organizations

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| clerk_org_id | TEXT UNIQUE | Clerk organization ID |
| name | TEXT NOT NULL | |
| plan | TEXT DEFAULT 'trial' | `trial`, `starter`, `pro` |
| timezone | TEXT DEFAULT 'UTC' | IANA timezone for digest delivery |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### users

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| clerk_user_id | TEXT UNIQUE | |
| org_id | UUID FK → organizations | |
| email | TEXT NOT NULL | |
| role | TEXT DEFAULT 'member' | `owner`, `admin`, `member` |
| created_at | TIMESTAMPTZ | |

### integrations

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK | |
| provider | TEXT NOT NULL | `slack`, `gmail`, `gdrive` |
| status | TEXT DEFAULT 'pending' | `pending`, `active`, `error`, `disconnected` |
| access_token_enc | TEXT | AES-256-GCM ciphertext |
| refresh_token_enc | TEXT | Nullable (Slack uses long-lived tokens) |
| token_expires_at | TIMESTAMPTZ | |
| scopes | TEXT[] | Granted OAuth scopes |
| external_account_id | TEXT | Workspace ID, Google sub, etc. |
| sync_cursor | JSONB | Provider-specific pagination cursor |
| last_synced_at | TIMESTAMPTZ | |
| error_message | TEXT | Last failure reason |
| created_at | TIMESTAMPTZ | |

**Index:** `UNIQUE (org_id, provider)` — one connection per provider per org.

### documents

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK | |
| integration_id | UUID FK | |
| external_id | TEXT NOT NULL | Provider-native ID |
| source_type | TEXT NOT NULL | `slack_message`, `gmail_thread`, `gdrive_doc`, etc. |
| title | TEXT | |
| url | TEXT | Deep link to source |
| raw_content | TEXT | Full normalized text |
| metadata | JSONB | Author, channel, date, thread_id, mime_type, etc. |
| content_hash | TEXT | SHA-256 of raw_content for change detection |
| ingested_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ | Soft delete |

**Index:** `UNIQUE (org_id, integration_id, external_id)`

### chunks

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK | |
| document_id | UUID FK | |
| chunk_index | INT NOT NULL | Order within document |
| content | TEXT NOT NULL | 200–400 token segment |
| token_count | INT | |
| embedding | vector(1536) | ada-002 embedding |
| search_vector | tsvector | Generated column for keyword search |
| metadata | JSONB | Inherited + chunk-specific offsets |
| embedding_status | TEXT DEFAULT 'ok' | `ok`, `failed`, `pending` |
| created_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ | |

**Indexes:**
```sql
CREATE INDEX idx_chunks_org_id ON chunks (org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_chunks_search_vector ON chunks USING gin (search_vector);
CREATE INDEX idx_chunks_document_id ON chunks (document_id);
```

### queries

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK | |
| user_id | UUID FK | |
| question | TEXT NOT NULL | Original user question |
| rewritten_query | JSONB | Claude rewrite output |
| answer | TEXT | Generated answer (null if insufficient evidence) |
| confidence | FLOAT | Top rerank score |
| status | TEXT | `completed`, `insufficient_evidence`, `failed`, `timeout` |
| latency_ms | INT | End-to-end processing time |
| created_at | TIMESTAMPTZ | |

### query_sources

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| query_id | UUID FK → queries | |
| chunk_id | UUID FK → chunks | |
| relevance_score | FLOAT | Reranker score |
| citation_index | INT | 1-based citation number in answer |
| snippet | TEXT | Highlighted excerpt |

### sync_jobs

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| integration_id | UUID FK | |
| status | TEXT | `running`, `completed`, `failed` |
| items_fetched | INT | |
| items_ingested | INT | |
| error_message | TEXT | |
| started_at | TIMESTAMPTZ | |
| finished_at | TIMESTAMPTZ | |

### digest_settings

| Column | Type | Notes |
|--------|------|-------|
| org_id | UUID PK FK | |
| enabled | BOOLEAN DEFAULT true | |
| delivery_hour | INT DEFAULT 6 | 0–23 in org timezone |
| email_recipients | TEXT[] | Defaults to org owner emails |
| last_sent_at | TIMESTAMPTZ | |

### digest_deliveries

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK | |
| summary | TEXT | Generated digest content |
| recipient_count | INT | |
| status | TEXT | `sent`, `failed` |
| sent_at | TIMESTAMPTZ | |

## Migrations

Migrations live in `backend/migrations/` as numbered SQL files:

```
001_enable_extensions.sql
002_create_organizations_users.sql
003_create_integrations.sql
004_create_documents_chunks.sql
005_create_queries.sql
006_create_digest_sync_jobs.sql
007_create_indexes.sql
```

Run with `npm run migrate`. Each migration runs in a transaction. Never edit a migration after it has been applied in production — add a new one instead.

## Query patterns

**Hybrid search (simplified):**
```sql
WITH semantic AS (
  SELECT id, 1 - (embedding <=> $1::vector) AS score
  FROM chunks
  WHERE org_id = $2 AND deleted_at IS NULL
  ORDER BY embedding <=> $1::vector
  LIMIT 20
),
keyword AS (
  SELECT id, ts_rank(search_vector, plainto_tsquery('english', $3)) AS score
  FROM chunks
  WHERE org_id = $2 AND deleted_at IS NULL
    AND search_vector @@ plainto_tsquery('english', $3)
  ORDER BY score DESC
  LIMIT 20
)
-- merge with 0.7/0.3 weighting in application layer
SELECT * FROM semantic UNION ALL SELECT * FROM keyword;
```

All repository methods accept `org_id` as the first parameter. No exceptions.
