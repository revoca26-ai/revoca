# API Contract

Base URL: `https://api.revoca.app/api/v1` (production) · `http://localhost:3000/api/v1` (local)

All responses are JSON. All timestamps are ISO 8601 UTC. All IDs are UUID v4.

## Global conventions

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Protected routes | `Bearer <clerk_session_jwt>` |
| `Content-Type` | POST/PATCH | `application/json` |
| `X-Request-Id` | Optional | Client-generated UUID; echoed in `meta.requestId` for tracing. On `POST /ask` it also acts as an idempotency key. |

### Standard response envelope

Success:
```json
{ "data": { ... }, "meta": { "requestId": "uuid" } }
```

Error:
```json
{ "error": { "code": "ERROR_CODE", "message": "Human-readable message", "details": {} }, "meta": { "requestId": "uuid" } }
```

---

## Health

Health probes live **outside** the `/api/v1` prefix so infra checks never depend on an API version ([ADR-010](../../architecture/decisions.md)).

### `GET /healthz` (liveness)

Process is up. No dependency checks. No auth.

**Response 200:** `{ "status": "ok" }`

### `GET /health` (readiness)

Process can serve traffic — checks DB connectivity (and Redis if configured). No auth.

**Response 200:**
```json
{ "data": { "status": "ok", "version": "1.0.0", "db": "connected", "redis": "connected" } }
```

**Response 503:** same envelope with `"status": "degraded"` and the failing dependency, so load balancers can pull the instance.

---

## Auth

### `GET /me`

Returns the authenticated user and org.

**Response 200:**
```json
{
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@company.com",
      "role": "owner",
      "createdAt": "2026-01-15T10:00:00Z"
    },
    "organization": {
      "id": "uuid",
      "name": "Acme Corp",
      "plan": "starter",
      "timezone": "America/New_York"
    },
    "usage": {
      "period": "2026-06",
      "ask": { "used": 73, "limit": 100 }
    }
  }
}
```

`usage` reflects the current billing month so the UI can show remaining quota and prompt upgrades. `limit` is `null` for unlimited plans.

### `PATCH /organization`

Update org-level settings. Requires `admin` or `owner` role. Notably, `timezone` drives digest delivery time — there was previously no way to set it.

**Request (all fields optional):**
```json
{ "name": "Acme Corporation", "timezone": "America/Chicago" }
```

`timezone` must be a valid IANA zone. **Response 200:** the updated organization object.

**Errors:** `400 VALIDATION_ERROR`, `403 FORBIDDEN`

### `POST /auth/webhook`

Clerk webhook. Verified via `svix-signature` header. Not called by frontend.

**Response 200:** `{ "data": { "received": true } }`

---

## Integrations

### `GET /integrations`

List all integrations for the org.

**Response 200:**
```json
{
  "data": {
    "integrations": [
      {
        "id": "uuid",
        "provider": "slack",
        "status": "active",
        "externalAccountId": "T01234567",
        "lastSyncedAt": "2026-06-16T08:00:00Z",
        "documentCount": 1240,
        "errorMessage": null
      },
      {
        "id": "uuid",
        "provider": "gmail",
        "status": "active",
        "externalAccountId": "google-sub-12345",
        "lastSyncedAt": "2026-06-16T08:05:00Z",
        "documentCount": 890,
        "errorMessage": null
      }
    ]
  }
}
```

### `POST /integrations/:provider/connect`

Start an OAuth flow. **Authenticated** (Bearer JWT) — this is a `fetch`, not a navigation, because a top-level browser redirect can't carry the Authorization header ([ADR-014](../../architecture/decisions.md)). `:provider` is one of `slack`, `gmail`, `gdrive`.

The backend mints a single-use `state` nonce bound to the caller's org/user and returns the provider's consent URL. The frontend then navigates: `window.location = authorizeUrl`.

**Response 200:**
```json
{ "data": { "authorizeUrl": "https://slack.com/oauth/v2/authorize?client_id=...&state=..." } }
```

**Errors:** `400 INVALID_PROVIDER`, `409 ALREADY_CONNECTED`

### `GET /integrations/google/callback`

Google OAuth callback (shared for Gmail + GDrive). Query params: `code`, `state`. **No Authorization header** — identity is recovered from the validated `state` nonce, never from a client-supplied value.

**Response 302:** Redirect to `{FRONTEND_URL}/integrations?connected={provider}` (or `?error=oauth_failed`).

**Errors:** `400 OAUTH_STATE_INVALID` (missing/expired/replayed state), `400 OAUTH_EXCHANGE_FAILED`

### `GET /integrations/slack/callback`

Slack OAuth callback. Query params: `code`, `state`. Same `state` validation as above.

**Response 302:** Redirect to frontend.

### `DELETE /integrations/:provider`

Disconnect an integration. Requires `admin` or `owner` role. Token revocation and soft-deleting potentially thousands of documents/chunks happen in the background, so this returns immediately.

**Response 202:**
```json
{
  "data": {
    "provider": "slack",
    "status": "disconnecting"
  }
}
```

The integration transitions `disconnecting → disconnected` once the purge completes; clients can confirm via `GET /integrations`.

**Errors:** `404 INTEGRATION_NOT_FOUND`

### `POST /integrations/:provider/sync`

Trigger manual sync. Requires `admin` or `owner` role. Rate-limited to 1 per provider per 5 minutes.

**Response 202:**
```json
{
  "data": {
    "syncJobId": "uuid",
    "status": "running"
  }
}
```

**Errors:** `409 SYNC_ALREADY_RUNNING`, `429 SYNC_RATE_LIMITED`

### `GET /integrations/:provider/sync/:syncJobId`

Poll sync job status. The job is looked up by `(org_id, id)` — a job belonging to another org returns `404`, never another tenant's data.

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "status": "completed",
    "itemsFetched": 45,
    "itemsIngested": 42,
    "itemsSkipped": 3,
    "startedAt": "2026-06-16T08:00:00Z",
    "finishedAt": "2026-06-16T08:02:30Z"
  }
}
```

**Errors:** `404 SYNC_JOB_NOT_FOUND`

---

## Ask

Ask is asynchronous and streamed ([ADR-012](../../architecture/decisions.md)): `POST` accepts the question instantly, the answer streams over SSE, and the final result is always retrievable by id.

### The `Query` object (canonical shape)

Every ask endpoint returns this one shape. Fields are always present; unfinished/empty values are `null` or `[]`. Typed clients import it from the shared package ([ADR-009](../../architecture/decisions.md)).

```json
{
  "id": "uuid",
  "question": "Why did we stop using Acme Corp as a supplier?",
  "status": "completed",
  "answer": "Acme Corp was dropped in March 2026 due to repeated delivery delays [1] and a 15% price increase [2].",
  "confidence": 0.82,
  "sources": [
    {
      "citationIndex": 1,
      "title": "#vendor-decisions — Sarah Chen",
      "url": "https://acme.slack.com/archives/C123/p1234567890",
      "sourceType": "slack_message",
      "snippet": "Acme has missed 3 of the last 5 delivery windows...",
      "relevanceScore": 0.91
    },
    {
      "citationIndex": 2,
      "title": "Re: Acme Corp pricing update",
      "url": "https://mail.google.com/mail/u/0/#inbox/thread123",
      "sourceType": "gmail_thread",
      "snippet": "Effective April 1, all pricing will increase by 15%...",
      "relevanceScore": 0.87
    }
  ],
  "message": null,
  "suggestion": null,
  "latencyMs": 4200,
  "createdAt": "2026-06-16T14:30:00Z"
}
```

`status` ∈ `processing | completed | insufficient_evidence | failed | timeout`. For `insufficient_evidence`, `answer` is `null`, `sources` is `[]`, and `message`/`suggestion` are populated.

### `POST /ask`

Submit a question. Validates, applies rate limit + monthly quota, persists the query, and dispatches background processing.

**Request:**
```json
{ "question": "Why did we stop using Acme Corp as a supplier?" }
```

| Field | Type | Rules |
|-------|------|-------|
| `question` | string | Required. 3–2000 characters. Trimmed. |

Send a client-generated `X-Request-Id` to make submission idempotent — a retry with the same id returns the same query instead of creating a duplicate (and re-spending LLM cost).

**Response 202:**
```json
{ "data": { "id": "uuid", "status": "processing" } }
```

**Errors:** `400 VALIDATION_ERROR`, `429 RATE_LIMITED`, `429 QUOTA_EXCEEDED`

### `GET /ask/:id/stream`

Server-Sent Events stream of a query's progress. `Content-Type: text/event-stream`. EventSource reconnects automatically; on reconnect after completion the server immediately emits the final `done` event.

```
event: status   data: {"status":"processing"}
event: token    data: {"text":"Acme Corp was dropped"}
event: token    data: {"text":" in March 2026..."}
event: sources  data: {"sources":[ ... ]}
event: done     data: { <full Query object> }
```

On failure: `event: error  data: {"code":"QUERY_TIMEOUT","message":"..."}`.

**Errors:** `404 QUERY_NOT_FOUND`

### `GET /ask/:id`

Retrieve a query by id (history, reconnect, or non-streaming clients).

**Response 200:** `{ "data": <Query object> }`

**Errors:** `404 QUERY_NOT_FOUND` (also returned for another org's query — no cross-tenant existence leak)

### `GET /ask/history`

Paginated query history for the org, newest first (backed by `idx_queries_org_created`).

**Query params:** `limit` (default 20, max 100), `cursor` (opaque pagination token)

**Response 200:**
```json
{
  "data": {
    "queries": [
      {
        "id": "uuid",
        "question": "Why did we stop using Acme Corp?",
        "status": "completed",
        "confidence": 0.82,
        "createdAt": "2026-06-16T14:30:00Z"
      }
    ],
    "pagination": { "nextCursor": "eyJpZCI6...", "hasMore": true }
  }
}
```

History items are a trimmed projection (no `answer`/`sources`); fetch a full `Query` via `GET /ask/:id`.

---

## Digest

### `GET /digest/settings`

**Response 200:**
```json
{
  "data": {
    "enabled": true,
    "deliveryHour": 6,
    "emailRecipients": ["owner@company.com"],
    "lastSentAt": "2026-06-16T06:00:00Z"
  }
}
```

### `PATCH /digest/settings`

Requires `admin` or `owner` role.

**Request:**
```json
{
  "enabled": true,
  "deliveryHour": 7,
  "emailRecipients": ["team@company.com", "owner@company.com"]
}
```

All fields optional. Validates `deliveryHour` (0–23), `emailRecipients` (valid emails, max 10).

**Response 200:** Updated settings object.

---

## Webhooks (external → Revoca)

### `POST /webhooks/slack`

Slack Events API. Verified via `X-Slack-Signature`.

**Response 200:** `{ "data": { "ok": true } }` or challenge response for `url_verification`.

---

## Rate limits and quotas

Per-minute limits are enforced in a **shared store** (Redis) so they hold across API replicas ([ADR-013](../../architecture/decisions.md)).

| Endpoint | Limit |
|----------|-------|
| `POST /ask` | 10 req/min per user |
| `POST /integrations/:provider/sync` | 1 req/5 min per provider |
| All other endpoints | 60 req/min per user |

Exceeded → `429 RATE_LIMITED` with `Retry-After` header (seconds).

**Monthly quota** (separate from rate limits): each plan grants a monthly `ask` allowance (Starter 100, Pro 500). Only `completed` queries count. Exceeded → `429 QUOTA_EXCEEDED`; current usage is on `GET /me`.

## Versioning

Current version: `v1`. Breaking changes will ship under `/api/v2` with 6-month deprecation notice for `v1`.
