# Ingest Module

Transforms raw content from integrations into searchable, embedded chunks. Runs in the **Worker process** ([ADR-008](../../architecture/decisions.md)) — tokenization and chunking are CPU-bound and must not block the API event loop.

## Pipeline stages

```
fetchDelta() → normalize() → dedup() → chunk() → embed() → persist()
```

Each stage is a pure function accepting `(item, orgId, integrationId)` and returning the next stage's input.

## normalize()

| Source | Input | Output |
|--------|-------|--------|
| Slack | Message event JSON | Plain text + metadata (channel, author, thread_ts, permalink) |
| Gmail | MIME message | Plain text body (HTML stripped) + metadata (from, to, subject, date, thread_id) |
| GDrive | Doc/PDF/Sheet export | Plain text + metadata (title, mime_type, modified_time, web_view_link) |

Rules:
- Strip HTML tags, decode entities, collapse whitespace.
- Preserve thread/conversation grouping metadata for chunk boundaries.
- Skip empty content, automated notifications (configurable filter list).

## dedup()

Upsert into `documents` on `(org_id, integration_id, external_id)`.

- If `content_hash` unchanged → skip re-chunking.
- If changed → soft-delete old chunks, re-run chunk → embed → persist.

## chunk()

| Parameter | Value |
|-----------|-------|
| Target size | 300 tokens |
| Min / max | 200 / 400 tokens |
| Split boundaries | Paragraph → sentence → thread reply (never mid-sentence) |

Uses a `cl100k_base` tokenizer (compatible with `text-embedding-3-small`). Each chunk inherits document metadata plus `chunk_index` and character offsets.

## embed()

- Model: `text-embedding-3-small` (configurable via `EMBEDDING_MODEL`)
- Dimensions: 1536
- Batch size: 100 chunks per API call
- On failure: mark `embedding_status = 'failed'`, retried by `embeddingRetry` job (every 5 min)

## persist()

```sql
INSERT INTO chunks (org_id, document_id, chunk_index, content, token_count, embedding, metadata)
-- search_vector is a generated column: to_tsvector('english', content)
```

Transaction wraps soft-delete of old chunks + insert of new chunks per document.

## Connector interface

Every integration implements:

```typescript
interface Connector {
  provider: 'slack' | 'gmail' | 'gdrive';
  // `state` is the signed, single-use CSRF nonce (ADR-014)
  getAuthorizeUrl(state: string): string;
  exchangeCode(code: string): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: Date; externalAccountId: string }>;
  fetchDelta(cursor: SyncCursor | null): Promise<{ items: RawItem[]; nextCursor: SyncCursor }>;
  normalize(rawItem: RawItem): NormalizedDocument; // { externalId, sourceType, title, url, content, metadata }
}
```

Connectors live in `modules/integrations/`. No cross-imports between connectors.

## Files (target)

```
modules/ingest/
├── pipeline.ts            Stage orchestrator
├── normalize.ts           Source-type normalizers
├── chunk.ts               Token-aware chunking
├── embed.ts               OpenAI batch embedding
├── persist.ts             DB writes
└── dedup.ts               Content hash comparison
```

## Metrics logged per sync

- `items_fetched`, `items_skipped` (unchanged), `items_ingested`, `chunks_created`, `embed_failures`
- Duration ms per stage
