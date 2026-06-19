# Database Schema

PostgreSQL 15 + pgvector on **[Neon](https://neon.tech)** (hosted). **Every tenant-scoped table carries `org_id`** for isolation, and the repository layer always filters on it (see the rule at the bottom of this doc). Embeddings are 1536-dimensional vectors from OpenAI `text-embedding-3-small` (see [ADR-004](../architecture/decisions.md)).

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
| embedding | vector(1536) | `text-embedding-3-small` embedding |
| search_vector | tsvector | `GENERATED ALWAYS AS (to_tsvector('english', content)) STORED` |
| metadata | JSONB | Inherited + chunk-specific offsets |
| embedding_status | TEXT DEFAULT 'ok' | `ok`, `failed`, `pending` |
| created_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ | |

**Indexes:**
```sql
CREATE INDEX idx_chunks_org_id ON chunks (org_id) WHERE deleted_at IS NULL;

-- HNSW (ADR-011): better recall + incremental inserts than IVFFlat, no training step.
-- Partial index so soft-deleted chunks never enter the ANN graph.
CREATE INDEX idx_chunks_embedding ON chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE deleted_at IS NULL AND embedding_status = 'ok';

-- Keyword leg, also partial.
CREATE INDEX idx_chunks_search_vector ON chunks
  USING gin (search_vector) WHERE deleted_at IS NULL;

CREATE INDEX idx_chunks_document_id ON chunks (document_id);
```

> **Multi-tenant ANN recall (ADR-011):** because HNSW returns the global top-N *before* `org_id` filtering, set `ef_search` (e.g. `SET LOCAL hnsw.ef_search = 150;`) high enough that a small tenant still gets a full candidate set after filtering. Partition `chunks` by `org_id` once any single tenant's live-chunk count makes this expensive.
>
> **Garbage collection:** soft-deleted chunks/documents are hard-deleted by the `purgeDeleted` job (see [jobs.md](jobs.md)) so the partial indexes and table stay lean.

### queries

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK | |
| user_id | UUID FK | |
| question | TEXT NOT NULL | Original user question |
| rewritten_query | JSONB | Gemini rewrite output |
| answer | TEXT | Generated answer (null if insufficient evidence) |
| confidence | FLOAT | Top rerank score |
| status | TEXT | `processing`, `completed`, `insufficient_evidence`, `failed`, `timeout` |
| latency_ms | INT | End-to-end processing time (null until finished) |
| created_at | TIMESTAMPTZ | |

**Index:** `CREATE INDEX idx_queries_org_created ON queries (org_id, created_at DESC, id);` — backs cursor pagination of `GET /ask/history`.

### query_sources

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK | Denormalized for tenant isolation in the repository layer |
| query_id | UUID FK → queries | |
| chunk_id | UUID FK → chunks | |
| relevance_score | FLOAT | Reranker (Cohere) calibrated score |
| citation_index | INT | 1-based citation number in answer |
| snippet | TEXT | Highlighted excerpt |

### sync_jobs

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK | Required for tenant isolation — the sync-status endpoint must filter on it |
| integration_id | UUID FK | |
| trigger | TEXT | `scheduled`, `manual`, `initial` |
| status | TEXT | `running`, `completed`, `failed` |
| items_fetched | INT | |
| items_ingested | INT | |
| items_skipped | INT | Unchanged (dedup) items |
| error_message | TEXT | |
| started_at | TIMESTAMPTZ | |
| finished_at | TIMESTAMPTZ | |

**Index:** partial unique index to enforce "one running sync per integration":
`CREATE UNIQUE INDEX uniq_sync_running ON sync_jobs (integration_id) WHERE status = 'running';`

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

### oauth_states

Single-use CSRF tokens binding an OAuth callback back to the initiating org/user (see [ADR-014](../architecture/decisions.md)).

| Column | Type | Notes |
|--------|------|-------|
| state | TEXT PK | Random 32-byte URL-safe nonce sent as the OAuth `state` param |
| org_id | UUID FK | Initiating org |
| user_id | UUID FK | Initiating user |
| provider | TEXT NOT NULL | `slack`, `gmail`, `gdrive` |
| redirect_path | TEXT | Frontend path to return to after callback |
| consumed_at | TIMESTAMPTZ | Set when the callback redeems it; redemption is single-use |
| expires_at | TIMESTAMPTZ NOT NULL | 10-minute TTL |
| created_at | TIMESTAMPTZ | |

### usage_counters

Per-org, per-period counters backing monthly plan quotas (see [ADR-013](../architecture/decisions.md)).

| Column | Type | Notes |
|--------|------|-------|
| org_id | UUID FK | |
| period | TEXT | Billing month, `YYYY-MM` in org timezone |
| metric | TEXT | `ask` (extensible: `ingest_tokens`, etc.) |
| count | INT DEFAULT 0 | Incremented atomically when a unit is consumed |

**Index:** `PRIMARY KEY (org_id, period, metric)`. Increment via `INSERT … ON CONFLICT … DO UPDATE SET count = usage_counters.count + 1 RETURNING count` so the quota check and increment are one atomic statement.

## Migrations

Migrations live in `backend/migrations/` as numbered SQL files:

```
001_enable_extensions.sql
002_create_organizations_users.sql
003_create_integrations.sql
004_create_documents_chunks.sql
005_create_queries.sql
006_create_digest_sync_jobs.sql
007_create_oauth_states.sql
008_create_usage_counters.sql
009_create_indexes.sql
```

Run with `npm run migrate`. Each migration runs in a transaction. Never edit a migration after it has been applied in production — add a new one instead.

## Query patterns

**Hybrid search with Reciprocal Rank Fusion ([ADR-002](../architecture/decisions.md)):** rank within each leg, then fuse on rank — no score normalization.

```sql
SET LOCAL hnsw.ef_search = 150;  -- protect recall after org_id filtering (ADR-011)

WITH semantic AS (
  SELECT id,
         row_number() OVER (ORDER BY embedding <=> $1::vector) AS rank
  FROM chunks
  WHERE org_id = $2 AND deleted_at IS NULL AND embedding_status = 'ok'
  ORDER BY embedding <=> $1::vector
  LIMIT 20
),
keyword AS (
  SELECT id,
         row_number() OVER (ORDER BY ts_rank(search_vector, q) DESC) AS rank
  FROM chunks, plainto_tsquery('english', $3) q
  WHERE org_id = $2 AND deleted_at IS NULL
    AND search_vector @@ q
  ORDER BY ts_rank(search_vector, q) DESC
  LIMIT 20
)
SELECT id, SUM(1.0 / (60 + rank)) AS rrf_score   -- k = 60
FROM (
  SELECT id, rank FROM semantic
  UNION ALL
  SELECT id, rank FROM keyword
) fused
GROUP BY id
ORDER BY rrf_score DESC
LIMIT 20;
```

The 20 fused candidates then go to the Cohere reranker (see [search.md](modules/search.md)).

**Repository rule:** every tenant-scoped repository method accepts `org_id` as its first parameter and includes `WHERE org_id = $1`. No exceptions — including `sync_jobs`, `query_sources`, `oauth_states`, and `usage_counters`.
