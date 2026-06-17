# Ask Module

Handles natural-language question submission, query rewrite, retrieval orchestration, answer generation, and citation assembly.

## Flow (asynchronous + streamed — see [ADR-012](../../architecture/decisions.md))

Ask is **not** a single 30 s synchronous request. Acceptance is instant; the answer streams.

```
POST /api/v1/ask
  → validate input (question: 3–2000 chars)         [Zod schema, shared package]
  → auth middleware → org_id, user_id
  → rate-limit check (per-user/min, shared store)    → 429 RATE_LIMITED
  → monthly quota check (usage < plan allowance)     → 429 QUOTA_EXCEEDED
  → INSERT queries row (status = 'processing')
  → dispatch askService.process(queryId) (non-blocking)
  → 202 { id, status: "processing" }

GET /api/v1/ask/:id/stream  (Server-Sent Events)
  → emits: status → token* → sources → done | error

askService.process(queryId):
  1. rewriteQuery(question)        → Claude Haiku
  2. searchService.hybridSearch()  → top 20 (RRF)
  3. searchService.rerank()        → top 6 (Cohere, calibrated scores)
  4. confidenceCheck(topScore)     → pass or status = insufficient_evidence
  5. generateAnswer(chunks)        → Claude Sonnet, streamed token-by-token
  6. buildCitations(chunks)        → source objects
  7. UPDATE query (answer, confidence, status, latency_ms) + INSERT query_sources
```

The pipeline writes progress to the `queries` row and pushes events to any connected SSE subscriber. If the client disconnects, processing still completes and the result is retrievable via `GET /ask/:id`.

## Query rewrite

Claude receives the raw question and returns structured JSON:

```json
{
  "searchTerms": ["Acme Corp supplier", "vendor termination"],
  "intent": "decision_rationale",
  "filters": { "sourceTypes": [], "dateRange": null }
}
```

Model: **Claude Haiku** (cheap, fast — rewrite is a light transformation). The consolidated query string is embedded once for retrieval; see [search.md](search.md#query-embedding-strategy).

## Answer generation

System prompt constraints:
- Answer **only** from provided chunks.
- Cite sources inline as `[1]`, `[2]`, etc.
- If chunks are contradictory, state the conflict explicitly.
- Never fabricate names, dates, or decisions not present in chunks.

Model: **Claude Sonnet**, **streamed**. Max output tokens: 1024. Temperature: 0. Tokens are forwarded to the SSE stream as they arrive (`token` events) and concatenated into the persisted `answer`.

## Confidence threshold

Default: `0.55` (configurable via `CONFIDENCE_THRESHOLD` env var). `confidence` is the **top Cohere reranker relevance score** and is only meaningful because that score is calibrated (see [ADR-007](../../architecture/decisions.md)).

Below threshold → status `insufficient_evidence`, no answer generated (and no Sonnet call — saving cost). This is a normal `200`/`done` outcome, never an error:

```json
{
  "status": "insufficient_evidence",
  "message": "I couldn't find enough relevant information in your connected sources to answer this.",
  "suggestion": "Try connecting more integrations or rephrasing your question."
}
```

## Timeouts

Because ask is asynchronous, these are **processing budgets** enforced by the worker, not HTTP request timeouts.

| Step | Budget |
|------|--------|
| Query rewrite (Haiku) | 3 s |
| Hybrid search + rerank (Cohere) | 2 s |
| Answer generation (Sonnet, streamed) | 20 s |
| **Total** | **25 s** |

Exceeding the total flips the `queries` row to `status = 'timeout'` and emits an `error` event (`QUERY_TIMEOUT`) on the stream. Typical time-to-first-token is < 2 s thanks to streaming.

## Quotas and limits

- **Rate limit:** per-user/minute via the shared store (`ASK_RATE_LIMIT_PER_MIN`, default 10) → `429 RATE_LIMITED`.
- **Monthly quota:** plan allowance per org. Checked against `usage_counters` before dispatch → `429 QUOTA_EXCEEDED`. The counter is incremented atomically only when a query reaches `status = 'completed'`, so `insufficient_evidence`, `failed`, and `timeout` results don't consume allowance. See [ADR-013](../../architecture/decisions.md).

## Files (target)

```
modules/ask/
├── askService.ts          Orchestrator (async pipeline + status transitions)
├── rewriteQuery.ts        Claude Haiku query rewrite
├── generateAnswer.ts      Claude Sonnet streamed answer + citation parsing
├── buildCitations.ts      Map chunks → source response objects
└── stream.ts              SSE event publisher (status/token/sources/done/error)
routes/ask.ts              POST /ask, GET /ask/:id, GET /ask/:id/stream, GET /ask/history
```

## Dependencies

- [search.md](search.md) — retrieval
- [ingest.md](ingest.md) — chunks must exist before ask works
- [auth.md](auth.md) — org_id scoping
