# Search Module

Hybrid semantic + keyword retrieval with reranking. All queries scoped to `org_id`.

## Hybrid search

Two parallel retrieval paths, merged in application code:

| Path | Method | Weight |
|------|--------|--------|
| Semantic | pgvector cosine similarity (`<=>`) | 0.70 |
| Keyword | PostgreSQL `ts_rank` on `search_vector` | 0.30 |

### Steps

1. Embed query search terms via ada-002 (one vector per term; average for multi-term).
2. Run semantic query → top 20 by cosine distance.
3. Run keyword query → top 20 by `ts_rank`.
4. Normalize scores to [0, 1] per path.
5. Merge: `final_score = 0.7 × semantic + 0.3 × keyword`.
6. Deduplicate by `chunk_id`, keep highest score.
7. Return top 20 candidates.

Only chunks where `deleted_at IS NULL` and `embedding_status = 'ok'` are eligible.

## Reranking

Top 20 candidates passed to reranker → top 6 returned.

**Phase 1:** Claude-based reranker — send chunk snippets + question, ask for relevance ranking.

**Phase 2:** Dedicated cross-encoder model (Cohere Rerank or similar) for lower latency.

Reranker output: array of `{ chunkId, relevanceScore }` sorted descending.

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
| Semantic search (20 results) | < 200 ms |
| Keyword search (20 results) | < 100 ms |
| Rerank (20 → 6) | < 3 s |
| **Total search** | **< 4 s** |

IVFFlat index on `embedding` with `lists = 100`. Rebuild index when chunk count exceeds 100k per org.

## Files (target)

```
modules/search/
├── hybridSearch.js        Parallel semantic + keyword
├── rerank.js              Top-20 → top-6 reranker
├── embedQuery.js          Query term → vector
└── filters.js             Source type / date filtering
```

## API exposure

Search is internal — not exposed as a standalone endpoint. Consumed exclusively by the [ask module](ask.md).

Phase 2 may add `GET /api/v1/search?q=...` for raw chunk preview (admin/debug).
