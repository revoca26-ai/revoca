# Ask Module

Handles natural-language question submission, query rewrite, retrieval orchestration, answer generation, and citation assembly.

## Flow

```
POST /api/v1/ask
  → validate input (question: 3–2000 chars)
  → auth middleware → org_id, user_id
  → rate limit check
  → askService.process(question, orgId, userId)
      1. rewriteQuery(question)        → Claude
      2. searchService.hybridSearch()  → top 20 chunks
      3. searchService.rerank()        → top 6 chunks
      4. confidenceCheck(topScore)     → pass or INSUFFICIENT_EVIDENCE
      5. generateAnswer(chunks)        → Claude
      6. buildCitations(chunks)        → source objects
      7. persist query + query_sources
  → return response
```

## Query rewrite

Claude receives the raw question and returns structured JSON:

```json
{
  "searchTerms": ["Acme Corp supplier", "vendor termination"],
  "intent": "decision_rationale",
  "filters": { "sourceTypes": [], "dateRange": null }
}
```

Search terms are embedded individually; results are merged and deduplicated.

## Answer generation

System prompt constraints:
- Answer **only** from provided chunks.
- Cite sources inline as `[1]`, `[2]`, etc.
- If chunks are contradictory, state the conflict explicitly.
- Never fabricate names, dates, or decisions not present in chunks.

Model: Claude Sonnet. Max output tokens: 1024. Temperature: 0.

## Confidence threshold

Default: `0.55` (configurable via `CONFIDENCE_THRESHOLD` env var).

Below threshold → status `insufficient_evidence`, no answer generated:

```json
{
  "status": "insufficient_evidence",
  "message": "I couldn't find enough relevant information in your connected sources to answer this.",
  "suggestion": "Try connecting more integrations or rephrasing your question."
}
```

## Timeouts

| Step | Budget |
|------|--------|
| Query rewrite | 5 s |
| Hybrid search + rerank | 8 s |
| Answer generation | 15 s |
| **Total** | **30 s** |

Exceeding total → status `timeout`, error code `QUERY_TIMEOUT`.

## Files (target)

```
modules/ask/
├── askService.js          Orchestrator
├── rewriteQuery.js        Claude query rewrite
├── generateAnswer.js      Claude answer + citation parsing
└── buildCitations.js      Map chunks → source response objects
```

## Dependencies

- [search.md](search.md) — retrieval
- [ingest.md](ingest.md) — chunks must exist before ask works
- [auth.md](auth.md) — org_id scoping
