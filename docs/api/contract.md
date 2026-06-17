# API Contract

Base URL: `https://api.revoca.app/api/v1` (production) · `http://localhost:3000/api/v1` (local)

All responses are JSON. All timestamps are ISO 8601 UTC. All IDs are UUID v4.

## Global conventions

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Protected routes | `Bearer <clerk_session_jwt>` |
| `Content-Type` | POST/PATCH | `application/json` |
| `X-Request-Id` | Optional | Client-generated UUID for tracing; echoed in response |

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

### `GET /health`

No auth required.

**Response 200:**
```json
{
  "data": {
    "status": "ok",
    "version": "1.0.0",
    "db": "connected"
  }
}
```

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
    }
  }
}
```

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
        "lastSyncedAt": "2026-06-16T08:05:00Z",
        "documentCount": 890,
        "errorMessage": null
      }
    ]
  }
}
```

### `GET /integrations/:provider/connect`

Start OAuth flow. `:provider` is one of `slack`, `gmail`, `gdrive`.

**Response 302:** Redirect to provider OAuth consent screen.

**Errors:** `400 INVALID_PROVIDER`, `409 ALREADY_CONNECTED`

### `GET /integrations/google/callback`

Google OAuth callback (shared for Gmail + GDrive). Query params: `code`, `state`.

**Response 302:** Redirect to `{FRONTEND_URL}/settings/integrations?connected={provider}`

**Errors:** `400 OAUTH_EXCHANGE_FAILED`

### `GET /integrations/slack/callback`

Slack OAuth callback. Query params: `code`, `state`.

**Response 302:** Redirect to frontend.

### `DELETE /integrations/:provider`

Disconnect an integration. Requires `admin` or `owner` role.

**Response 200:**
```json
{
  "data": {
    "provider": "slack",
    "status": "disconnected",
    "documentsRemoved": 1240
  }
}
```

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

Poll sync job status.

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "status": "completed",
    "itemsFetched": 45,
    "itemsIngested": 42,
    "startedAt": "2026-06-16T08:00:00Z",
    "finishedAt": "2026-06-16T08:02:30Z"
  }
}
```

---

## Ask

### `POST /ask`

Submit a natural-language question.

**Request:**
```json
{
  "question": "Why did we stop using Acme Corp as a supplier?"
}
```

| Field | Type | Rules |
|-------|------|-------|
| `question` | string | Required. 3–2000 characters. Trimmed. |

**Response 200 (answer found):**
```json
{
  "data": {
    "id": "uuid",
    "status": "completed",
    "question": "Why did we stop using Acme Corp as a supplier?",
    "answer": "Based on internal discussions, Acme Corp was dropped in March 2026 due to repeated delivery delays [1] and a 15% price increase [2].",
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
    "latencyMs": 4200,
    "createdAt": "2026-06-16T14:30:00Z"
  }
}
```

**Response 200 (insufficient evidence):**
```json
{
  "data": {
    "id": "uuid",
    "status": "insufficient_evidence",
    "question": "Why did we stop using Acme Corp as a supplier?",
    "answer": null,
    "confidence": 0.31,
    "sources": [],
    "message": "I couldn't find enough relevant information in your connected sources.",
    "suggestion": "Try connecting more integrations or rephrasing your question.",
    "createdAt": "2026-06-16T14:30:00Z"
  }
}
```

**Errors:** `400 VALIDATION_ERROR`, `429 RATE_LIMITED`, `504 QUERY_TIMEOUT`

### `GET /ask/history`

Paginated query history for the org.

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
    "pagination": {
      "nextCursor": "eyJpZCI6...",
      "hasMore": true
    }
  }
}
```

### `GET /ask/:id`

Retrieve a previous query with full answer and sources.

**Response 200:** Same shape as `POST /ask` success response.

**Errors:** `404 QUERY_NOT_FOUND`

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

## Rate limits

| Endpoint | Limit |
|----------|-------|
| `POST /ask` | 10 req/min per user |
| `POST /integrations/:provider/sync` | 1 req/5 min per provider |
| All other endpoints | 60 req/min per user |

Exceeded → `429 RATE_LIMITED` with `Retry-After` header (seconds).

## Versioning

Current version: `v1`. Breaking changes will ship under `/api/v2` with 6-month deprecation notice for `v1`.
