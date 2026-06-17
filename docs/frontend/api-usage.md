# Frontend API Usage

How the frontend communicates with the backend.

## API client

All requests go through a single authenticated client:

```javascript
// src/api/client.js
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

Token is obtained from Clerk via `getToken()` in each hook/component.

## Endpoints used

| Page/Hook | Method | Path | Purpose |
|-----------|--------|------|---------|
| `useAsk` | POST | `/ask` | Submit question |
| `useAsk` | GET | `/ask/:id` | Fetch query result |
| History | GET | `/ask/history?limit=20&cursor=...` | Paginated history |
| `useIntegrations` | GET | `/integrations` | List integrations |
| Integrations | GET | `/integrations/:provider/connect` | Start OAuth (browser redirect) |
| Integrations | DELETE | `/integrations/:provider` | Disconnect |
| Integrations | POST | `/integrations/:provider/sync` | Manual sync |
| Integrations | GET | `/integrations/:provider/sync/:id` | Poll sync status |
| DigestSettings | GET | `/digest/settings` | Read settings |
| DigestSettings | PATCH | `/digest/settings` | Update settings |
| App init | GET | `/me` | User + org profile |

## Auth headers

Every request to a protected endpoint includes:

```
Authorization: Bearer <clerk_session_jwt>
Content-Type: application/json
```

The Clerk SDK's `getToken()` returns a fresh JWT on each call. Do not cache tokens manually.

OAuth connect flows are browser redirects — no Authorization header. The backend OAuth callback handles token exchange server-side.

## Error handling

```javascript
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
| `QUERY_TIMEOUT` | Show "Query took too long, try again" with retry button |
| `INSUFFICIENT_EVIDENCE` | Not an error — render `AnswerCard` with empty answer + suggestion |
| `SYNC_ALREADY_RUNNING` | Show "Sync in progress" info toast |
| `502`, `500` | Show generic error with retry button |

## Loading states

| Action | Loading UX |
|--------|-----------|
| Submit question | Disable input, show skeleton in answer area (expect 3–8 s) |
| Load history | Skeleton list items |
| Connect integration | Button spinner → browser redirect |
| Manual sync | Button spinner → poll sync status every 2 s until complete |
| Save digest settings | Debounced save indicator ("Saving..." → "Saved") |

## Polling pattern (sync status)

```javascript
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
