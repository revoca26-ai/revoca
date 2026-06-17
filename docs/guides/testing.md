# Testing

Testing strategy for each module. Test framework: Node.js built-in test runner (backend), Vitest (frontend).

## Backend

Run: `cd backend && npm test`

### Auth module

| Test | What to verify |
|------|---------------|
| Valid JWT | Request passes with correct user/org context |
| Expired JWT | Returns `401 AUTH_INVALID` |
| Missing header | Returns `401 AUTH_REQUIRED` |
| Wrong org | Returns `403 AUTH_ORG_MISMATCH` |
| JIT provisioning | Valid JWT for a not-yet-synced user provisions the record instead of 401 |
| Webhook signature | Valid signature accepted (over raw body); invalid rejected |
| Token encryption | Round-trip encrypt/decrypt produces original token; ciphertext carries a key id |

### Ingest module

| Test | What to verify |
|------|---------------|
| Chunk boundaries | 500-token paragraph splits at sentence boundaries, not mid-word |
| Slack thread | Thread replies grouped; split at reply boundaries for long threads |
| Dedup | Same content_hash skips re-chunking |
| Content change | Changed hash soft-deletes old chunks, creates new ones |
| Empty content | Skipped, no chunks created |
| Embed failure | Chunk marked `embedding_status = failed` |

Use fixture files: `tests/fixtures/slack_message.json`, `gmail_mime.txt`, `gdrive_doc.txt`.

### Search module

| Test | What to verify |
|------|---------------|
| Hybrid merge | Semantic-only and keyword-only ranks fuse via RRF (k=60); a chunk ranked highly by both wins |
| Org isolation | Search for org A never returns org B chunks |
| Deleted chunks | Chunks with `deleted_at` excluded |
| Empty index | Returns empty array, no error |

Seed test DB with known chunks and embeddings for deterministic results.

### Ask module

| Test | What to verify |
|------|---------------|
| Full pipeline | Question → answer with citations (mock Haiku + OpenAI + Cohere + Sonnet) |
| Accept + dispatch | `POST /ask` returns `202 { id }` and persists `status: processing` |
| Streaming | `/ask/:id/stream` emits status → token* → sources → done |
| Insufficient evidence | Low-confidence ends with `done`, `status: insufficient_evidence`, no Sonnet call |
| Timeout | Pipeline exceeding 25 s budget sets `status: timeout` and emits a `QUERY_TIMEOUT` stream error |
| Validation | Question < 3 chars returns `VALIDATION_ERROR` |
| Rate limit | 11th request in 1 min returns `429 RATE_LIMITED` |
| Quota | Ask past the monthly plan allowance returns `429 QUOTA_EXCEEDED`; only `completed` queries count |

Mock external APIs in tests. Never call OpenAI/Anthropic in CI.

### Integration connectors

| Test | What to verify |
|------|---------------|
| Normalize | Raw provider payload → standard document shape |
| OAuth URL | `getAuthorizeUrl(state)` returns a valid auth URL with correct scopes and the `state` param |
| OAuth state | Callback rejects missing/expired/replayed `state` with `OAUTH_STATE_INVALID`; org/user derived from the stored row |
| Sync-job isolation | Polling a sync job id from another org returns `404 SYNC_JOB_NOT_FOUND` |
| Idempotent ingest | Same `(org_id, integration_id, external_id)` from poll + webhook upserts once |
| Error handling | Provider 429/500 handled gracefully, integration status updated |

Use recorded HTTP fixtures (nock/msw) — no live API calls in CI.

### Digest module

| Test | What to verify |
|------|---------------|
| Content selection | Only last 24h chunks included |
| Empty day | No digest sent when zero new chunks |
| Settings respect | Disabled digest skipped; delivery hour matched against timezone |

## Frontend

Run: `cd frontend && npm test`

| Test | What to verify |
|------|---------------|
| QueryInput validation | Submit disabled for < 3 chars |
| AnswerCard states | Renders completed, insufficient_evidence, and error states |
| SourceChips | Correct number of chips, links open in new tab |
| IntegrationCard | Shows connect/disconnect based on status and role |
| API error handling | AUTH_INVALID redirects; RATE_LIMITED shows countdown |
| Route protection | Unauthenticated users redirected to sign-in |

## End-to-end (Phase 2)

Playwright tests against staging environment:

1. Sign up → create org → connect Slack (test workspace)
2. Wait for sync → submit question → verify answer + sources
3. Disconnect integration → verify documents removed

## CI pipeline (target)

```yaml
# .github/workflows/ci.yml
- lint (frontend + backend)
- unit tests (frontend + backend)
- migration check (apply migrations to ephemeral Postgres)
```

## What not to test

- Clerk UI flows (tested by Clerk)
- OAuth provider consent screens
- Exact Claude/OpenAI response content (non-deterministic; test structure, not content)

## Coverage targets

| Area | Target |
|------|--------|
| Ingest pipeline | 90% |
| Search merge logic | 95% |
| Auth middleware | 95% |
| API route handlers | 80% |
| Frontend components | 70% |
