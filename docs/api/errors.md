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
| 429 | Rate limit exceeded |
| 500 | Unexpected server error |
| 502 | Upstream provider error (Google, Slack, OpenAI) |
| 504 | Request timeout (ask pipeline) |

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
| `VALIDATION_ERROR` | 400 | Validation failed | Request body fails schema validation |
| `INVALID_PROVIDER` | 400 | Unknown integration provider | `:provider` not in `slack`, `gmail`, `gdrive` |
| `INVALID_CURSOR` | 400 | Invalid pagination cursor | Malformed or expired cursor token |

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
| `OAUTH_EXCHANGE_FAILED` | 400 | OAuth token exchange failed | Provider rejected authorization code |
| `SYNC_ALREADY_RUNNING` | 409 | Sync already in progress | Manual sync while job is running |
| `SYNC_RATE_LIMITED` | 429 | Sync rate limit exceeded | Manual sync within 5-min cooldown |
| `INTEGRATION_ERROR` | 502 | Integration provider error | Upstream API failure during sync |

### Ask

| Code | Status | Message | When |
|------|--------|---------|------|
| `QUERY_TIMEOUT` | 504 | Query processing timed out | Ask pipeline exceeded 30 s |
| `QUERY_NOT_FOUND` | 404 | Query not found | GET /ask/:id for nonexistent or other-org query |
| `EMBEDDING_FAILED` | 502 | Embedding service unavailable | OpenAI API error during search |
| `LLM_FAILED` | 502 | Answer generation failed | Anthropic API error |

Note: `insufficient_evidence` is **not** an error — it returns HTTP 200 with `status: "insufficient_evidence"`.

### Rate limiting

| Code | Status | Message | When |
|------|--------|---------|------|
| `RATE_LIMITED` | 429 | Rate limit exceeded | Any endpoint exceeding its limit |

Response includes header: `Retry-After: 45` (seconds until reset).

### Server

| Code | Status | Message | When |
|------|--------|---------|------|
| `INTERNAL_ERROR` | 500 | An unexpected error occurred | Unhandled exception |
| `DB_UNAVAILABLE` | 500 | Database unavailable | PostgreSQL connection failure |

**Production rule:** `500` responses never expose stack traces or internal details. Full error logged server-side with `requestId`.

## Client handling guide

```javascript
const res = await fetch('/api/v1/ask', { method: 'POST', ... });
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
