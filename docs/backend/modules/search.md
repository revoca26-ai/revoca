# Search Module

Hybrid semantic + keyword retrieval with reranking. All queries scoped to `org_id`.

## Hybrid search

Two parallel retrieval paths, fused on **rank** (not raw score) via Reciprocal Rank Fusion — see [ADR-002](../../architecture/decisions.md).

| Path | Method |
|------|--------|
| Semantic | pgvector cosine distance (`<=>`) over `text-embedding-3-small` vectors, HNSW index |
| Keyword | PostgreSQL `ts_rank` over the `search_vector` tsvector, GIN index |

### Query embedding strategy

The query rewrite ([ask.md](ask.md)) returns `searchTerms`. Rather than averaging per-term vectors (which dilutes signal), embed **one consolidated query string** (the rewritten question joined with its key terms) into a single vector. If a rewrite yields genuinely distinct sub-questions, run multi-query retrieval — one semantic leg per sub-query — and fold every leg into the same RRF pool.

### Steps

1. Embed the consolidated query via `text-embedding-3-small` (1536-dim).
2. Semantic leg → top 20 by cosine distance (with `hnsw.ef_search = 150` so per-org filtering still yields a full set; see [ADR-011](../../architecture/decisions.md)).
3. Keyword leg → top 20 by `ts_rank`.
4. **RRF fuse:** `score(chunk) = Σ_legs 1 / (60 + rank_leg(chunk))`. No normalization, no hand-tuned weights.
5. Deduplicate by `chunk_id` (summing contributions).
6. Return the top 20 fused candidates.

Only chunks where `deleted_at IS NULL` and `embedding_status = 'ok'` are eligible (enforced by the partial indexes). See the full SQL in [database.md](../database.md#query-patterns).

## Reranking

Top 20 candidates passed to the reranker → top 6 returned.

**Phase 1 uses Cohere Rerank (`rerank-english-v3.0`)**, not a Claude-based reranker (revised — see [ADR-004](../../architecture/decisions.md)). Reasons:
- **Latency:** ~100 ms vs. multiple seconds for a Claude rerank call, and it removes one LLM round-trip from the ask budget.
- **Calibrated scores:** Cohere returns relevance scores in a stable [0,1] range, which is what makes the `0.55` confidence threshold ([ADR-007](../../architecture/decisions.md)) meaningful. A Claude-generated ranking produces arbitrary, uncalibrated numbers that the threshold can't reason about.
- **Cost:** materially cheaper per query than a Sonnet rerank, which matters at SMB pricing.

Reranker output: array of `{ chunkId, relevanceScore }` sorted descending. The top score becomes the query's `confidence`.

**Phase 2:** evaluate a self-hosted cross-encoder if Cohere latency or cost becomes a constraint.

## Filters (Phase 1 basic)

Optional filters applied before search (from query rewrite):

| Filter | Applied to |
|--------|-----------|
| `sourceTypes` | `documents.source_type IN (...)` |
| `dateRange` | `documents.metadata->>'date' BETWEEN ...` |
| `integrationId` | Specific integration scope |

## Performance

| Operation | Target latency |
|-----------|---------------|
| Query embedding (`text-embedding-3-small`) | < 150 ms |
| Semantic search (20 results, HNSW) | < 150 ms |
| Keyword search (20 results) | < 100 ms |
| Rerank (20 → 6, Cohere) | < 300 ms |
| **Total search** | **< 1 s** |

HNSW index on `embedding` (`m = 16`, `ef_construction = 64`), partial on live + embedded chunks (see [ADR-011](../../architecture/decisions.md) and [database.md](../database.md)). Tune `hnsw.ef_search` for the recall/latency trade-off; partition `chunks` by `org_id` before any single tenant's live-chunk count makes a shared index slow.

## Files (target)

```
modules/search/
├── hybridSearch.ts        Parallel semantic + keyword
├── rerank.ts              Top-20 → top-6 reranker
├── embedQuery.ts          Query term → vector
└── filters.ts             Source type / date filtering
```

## API exposure

Search is internal — not exposed as a standalone endpoint. Consumed exclusively by the [ask module](ask.md).

Phase 2 may add `GET /api/v1/search?q=...` for raw chunk preview (admin/debug).
