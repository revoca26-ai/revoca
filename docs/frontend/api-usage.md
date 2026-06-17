# Frontend API Usage

How the frontend communicates with the backend.

## API client

All requests go through a single authenticated client:

```typescript
// src/api/client.ts
const BASE = import.meta.env.VITE_API_URL;

export async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();

  if (!res.ok) {
    throw new ApiError(json.error.code, json.error.message, json.error.details, res.status);
  }

  return json.data;
}
```

Token is obtained from Clerk via `getToken()` in each hook/component (see [authentication.md](../api/authentication.md#frontend-integration) for the correct hook-based pattern).

## Asking a question (async + SSE)

`POST /ask` returns immediately with an `id`; the answer streams over Server-Sent Events:

```typescript
// useAsk (simplified)
const { id } = await api('/ask', { method: 'POST', body: { question } })
  .then(r => r.json()).then(b => b.data);

const es = new EventSource(`${BASE}/api/v1/ask/${id}/stream`, { withCredentials: false });
es.addEventListener('token',   e => appendToAnswer(JSON.parse(e.data).text));
es.addEventListener('sources', e => setSources(JSON.parse(e.data).sources));
es.addEventListener('done',    e => { setQuery(JSON.parse(e.data)); es.close(); });
es.addEventListener('error',   e => { showError(JSON.parse((e as MessageEvent).data)); es.close(); });
```

> EventSource only sends the `Authorization` header if your transport supports it; pass the Clerk JWT as a short-lived query param or use a `fetch`-based SSE reader with headers. If the socket drops, reconnect to the same `/ask/:id/stream` or fall back to `GET /ask/:id` — processing continues server-side regardless.

## Connecting an integration

```typescript
const { authorizeUrl } = await api(`/integrations/${provider}/connect`, { method: 'POST' })
  .then(r => r.json()).then(b => b.data);
window.location.assign(authorizeUrl); // full-page redirect to provider consent
```

## Endpoints used

| Page/Hook | Method | Path | Purpose |
|-----------|--------|------|---------|
| `useAsk` | POST | `/ask` | Submit question → `202 { id }` |
| `useAsk` | GET (SSE) | `/ask/:id/stream` | Stream status/tokens/sources/done |
| `useAsk` | GET | `/ask/:id` | Fetch final query result (reconnect/history) |
| History | GET | `/ask/history?limit=20&cursor=...` | Paginated history |
| `useIntegrations` | GET | `/integrations` | List integrations |
| Integrations | POST | `/integrations/:provider/connect` | Get `authorizeUrl`, then `window.location` |
| Integrations | DELETE | `/integrations/:provider` | Disconnect (`202`, background purge) |
| Integrations | POST | `/integrations/:provider/sync` | Manual sync |
| Integrations | GET | `/integrations/:provider/sync/:id` | Poll sync status |
| DigestSettings | GET | `/digest/settings` | Read settings |
| DigestSettings | PATCH | `/digest/settings` | Update settings |
| Settings | PATCH | `/organization` | Update org name / timezone |
| App init | GET | `/me` | User + org profile + monthly usage |

## Auth headers

Every request to a protected endpoint includes:

```
Authorization: Bearer <clerk_session_jwt>
Content-Type: application/json
```

The Clerk SDK's `getToken()` returns a fresh JWT on each call. Do not cache tokens manually.

OAuth connect flows are browser redirects — no Authorization header. The backend OAuth callback handles token exchange server-side.

## Error handling

```typescript
class ApiError extends Error {
  constructor(code, message, details, status) {
    super(message);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}
```

| Error code | Frontend action |
|------------|----------------|
| `AUTH_REQUIRED`, `AUTH_INVALID` | Redirect to `/sign-in` |
| `FORBIDDEN` | Show "You don't have permission" toast |
| `VALIDATION_ERROR` | Show field-level errors from `details.fields` |
| `RATE_LIMITED` | Disable submit button, show countdown from `Retry-After` |
| `QUOTA_EXCEEDED` | Show "Monthly query limit reached" with an upgrade CTA (use `details.usage`) |
| `OAUTH_STATE_INVALID` | Toast "Connection expired, please try again" and restart connect |
| `SYNC_ALREADY_RUNNING` | Show "Sync in progress" info toast |
| `502`, `500` | Show generic error with retry button |

> `insufficient_evidence` is **not** an error. It arrives as a normal `done` event on the ask stream (and as a `status` on `GET /ask/:id`); render `AnswerCard` with the empty-answer + suggestion state. Processing failures (`QUERY_TIMEOUT`, `EMBEDDING_FAILED`, `LLM_FAILED`, `RERANK_FAILED`) arrive as `error` events on the stream, not as `POST /ask` HTTP errors.

## Loading states

| Action | Loading UX |
|--------|-----------|
| Submit question | Disable input; show skeleton until the first `token` event (< 2 s), then render the answer as it streams |
| Load history | Skeleton list items |
| Connect integration | Button spinner → browser redirect |
| Manual sync | Button spinner → poll sync status every 2 s until complete |
| Save digest settings | Debounced save indicator ("Saving..." → "Saved") |

## Polling pattern (sync status)

```typescript
async function pollSyncStatus(provider, syncJobId, token) {
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    const data = await api(`/integrations/${provider}/sync/${syncJobId}`, { token });
    if (data.status === 'completed' || data.status === 'failed') return data;
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new ApiError('QUERY_TIMEOUT', 'Sync timed out');
}
```

## CORS

Backend allows requests from `FRONTEND_URL`. In development: `http://localhost:5173`. In production: `https://app.revoca.app`.

Credentials mode is not used — auth is via Bearer token, not cookies (Clerk session cookie is separate, scoped to Clerk domain).
