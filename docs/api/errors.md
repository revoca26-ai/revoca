# API Errors

All errors follow the standard envelope:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": {}
  },
  "meta": { "requestId": "uuid" }
}
```

## HTTP status codes

| Status | Usage |
|--------|-------|
| 400 | Invalid request body, bad parameters |
| 401 | Missing or invalid authentication |
| 403 | Authenticated but insufficient permissions |
| 404 | Resource not found |
| 409 | Conflict (already connected, sync running) |
| 422 | Valid syntax but semantic validation failure |
| 429 | Rate limit or monthly quota exceeded |
| 500 | Unexpected server error |
| 502 | Upstream provider error (Google, Slack, OpenAI, Gemini, Cohere) |

Note: the ask pipeline is asynchronous ([ADR-012](../../architecture/decisions.md)), so a slow query is **not** an HTTP `504`. `POST /ask` returns `202` immediately; a processing timeout surfaces as a `QUERY_TIMEOUT` `error` event on the SSE stream and sets the query's `status` to `timeout`.

## Error codes

### Authentication

| Code | Status | Message | When |
|------|--------|---------|------|
| `AUTH_REQUIRED` | 401 | Authentication required | Missing `Authorization` header |
| `AUTH_INVALID` | 401 | Invalid or expired token | JWT verification failed |
| `AUTH_ORG_MISMATCH` | 403 | User does not belong to this organization | org_id claim doesn't match DB record |

### Authorization

| Code | Status | Message | When |
|------|--------|---------|------|
| `FORBIDDEN` | 403 | Insufficient permissions | Member role accessing admin-only endpoint |
| `FORBIDDEN` | 403 | Insufficient permissions | Non-owner attempting org deletion |

### Validation

| Code | Status | Message | When |
|------|--------|---------|------|
| `VALIDATION_ERROR` | 400 | Validation failed | Request body fails Zod schema validation |
| `INVALID_PROVIDER` | 400 | Unknown integration provider | `:provider` not in `slack`, `gmail`, `gdrive` |
| `INVALID_CURSOR` | 400 | Invalid pagination cursor | Malformed or expired cursor token |
| `OAUTH_STATE_INVALID` | 400 | Invalid or expired OAuth state | Callback `state` missing, expired, replayed, or not found (CSRF protection — [ADR-014](../../architecture/decisions.md)) |

**Example with details:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "fields": [
        { "path": "question", "message": "Must be between 3 and 2000 characters" }
      ]
    }
  }
}
```

### Integrations

| Code | Status | Message | When |
|------|--------|---------|------|
| `ALREADY_CONNECTED` | 409 | Integration already connected | Connect called for active provider |
| `INTEGRATION_NOT_FOUND` | 404 | Integration not found | Disconnect/sync for unconnected provider |
| `SYNC_JOB_NOT_FOUND` | 404 | Sync job not found | Poll for a job id not owned by the caller's org |
| `OAUTH_EXCHANGE_FAILED` | 400 | OAuth token exchange failed | Provider rejected authorization code |
| `SYNC_ALREADY_RUNNING` | 409 | Sync already in progress | Manual sync while job is running |
| `SYNC_RATE_LIMITED` | 429 | Sync rate limit exceeded | Manual sync within 5-min cooldown |
| `INTEGRATION_ERROR` | 502 | Integration provider error | Upstream API failure during sync |

### Ask

| Code | Status | Message | When |
|------|--------|---------|------|
| `QUERY_TIMEOUT` | — (stream `error`) | Query processing timed out | Pipeline exceeded its 25 s budget; delivered as an SSE `error` event, `status = timeout` |
| `QUERY_NOT_FOUND` | 404 | Query not found | GET /ask/:id or /ask/:id/stream for nonexistent or other-org query |
| `QUOTA_EXCEEDED` | 429 | Monthly query limit reached | Org has used its plan's monthly `ask` allowance |
| `EMBEDDING_FAILED` | — (stream `error`) | Embedding service unavailable | OpenAI API error during search |
| `LLM_FAILED` | — (stream `error`) | Answer generation failed | Google Gemini API error |
| `RERANK_FAILED` | — (stream `error`) | Reranking service unavailable | Cohere API error |

`POST /ask` itself only fails synchronously with `VALIDATION_ERROR`, `RATE_LIMITED`, or `QUOTA_EXCEEDED`. Failures *during* processing (`QUERY_TIMEOUT`, `EMBEDDING_FAILED`, `LLM_FAILED`, `RERANK_FAILED`) arrive as `error` events on `GET /ask/:id/stream` and set the query's terminal `status`.

Note: `insufficient_evidence` is **not** an error — the stream completes with a normal `done` event whose `status` is `insufficient_evidence`.

### Rate limiting

| Code | Status | Message | When |
|------|--------|---------|------|
| `RATE_LIMITED` | 429 | Rate limit exceeded | Any endpoint exceeding its per-minute limit |
| `QUOTA_EXCEEDED` | 429 | Monthly query limit reached | Org exhausted its plan's monthly `ask` allowance |

`RATE_LIMITED` includes a `Retry-After: 45` header (seconds until reset). `QUOTA_EXCEEDED` includes `details.usage` (`{ used, limit, period }`) so the client can prompt an upgrade rather than a retry.

### Server

| Code | Status | Message | When |
|------|--------|---------|------|
| `INTERNAL_ERROR` | 500 | An unexpected error occurred | Unhandled exception |
| `DB_UNAVAILABLE` | 500 | Database unavailable | PostgreSQL connection failure |

**Production rule:** `500` responses never expose stack traces or internal details. Full error logged server-side with `requestId`.

## Client handling guide

```typescript
const res = await fetch('/api/v1/ask', { method: 'POST', /* ... */ });
const body = await res.json();

if (!res.ok) {
  switch (body.error.code) {
    case 'AUTH_REQUIRED':
    case 'AUTH_INVALID':
      redirectToLogin();
      break;
    case 'RATE_LIMITED':
      showRetryAfter(res.headers.get('Retry-After'));
      break;
    case 'QUOTA_EXCEEDED':
      showUpgradePrompt(body.error.details.usage);
      break;
    case 'VALIDATION_ERROR':
      showFieldErrors(body.error.details.fields);
      break;
    default:
      showGenericError(body.error.message);
  }
}
```

## Webhook errors

Webhook endpoints (Clerk, Slack) return `401` for invalid signatures without a JSON body. Do not retry signature failures.
