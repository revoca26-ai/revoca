# Authentication

Revoca uses [Clerk](https://clerk.com) for identity. The backend verifies Clerk-issued JWTs — it does not issue its own tokens.

## Flow

```
1. User signs up/in via Clerk hosted UI (frontend)
2. Clerk issues a session JWT
3. Frontend attaches JWT to every API request:
     Authorization: Bearer <session_jwt>
4. Backend verifies JWT via Clerk JWKS endpoint
5. Backend extracts user_id + org_id from claims
6. Request proceeds with authenticated context
```

## Token format

Clerk session JWTs are standard RS256-signed JWTs.

**Header:**
```json
{ "alg": "RS256", "typ": "JWT", "kid": "ins_..." }
```

**Payload (relevant claims):**
```json
{
  "sub": "user_2abc...",           // Clerk user ID
  "org_id": "org_2xyz...",         // Active organization
  "org_role": "org:admin",         // Role within org
  "iss": "https://clerk.revoca.app",
  "exp": 1718553600,               // Unix timestamp
  "iat": 1718550000,
  "azp": "pk_live_..."             // Frontend publishable key
}
```

## Verification (backend)

```typescript
// middleware/auth.ts
1. Extract Bearer token from Authorization header
2. Decode JWT header → get kid
3. Fetch JWKS from https://<clerk-domain>/.well-known/jwks.json (cached 1h)
4. Verify RS256 signature
5. Validate exp (reject expired), iss (must match Clerk instance)
6. Look up user by clerk_user_id = sub
7. If not found → just-in-time provision from claims (see below), don't 401
8. Verify user.org_id matches org_id claim
9. Attach { userId, orgId, role } to req.auth
```

Rejected tokens return `401 AUTH_INVALID`. Missing header returns `401 AUTH_REQUIRED`.

### Just-in-time provisioning ([ADR-015](../architecture/decisions.md))

Clerk webhooks sync users/orgs asynchronously and can lag a few seconds behind signup. To avoid a `401`/`404` on a brand-new user's very first request, if a **verified** JWT references a user or org not yet in the database, the backend provisions the record on the fly (idempotent upsert on `clerk_user_id` / `clerk_org_id`) inside the request, then proceeds. Webhooks remain authoritative for updates and deletes.

## Token expiry

| Token | Lifetime | Refresh |
|-------|----------|---------|
| Clerk session JWT | 60 seconds (short-lived) | Clerk SDK auto-refreshes via session cookie |
| Clerk session (overall) | 7 days default | Sliding window; refreshed on activity |

The frontend Clerk SDK (`@clerk/clerk-react`) handles token refresh transparently. The backend always receives a fresh JWT.

## Frontend integration

`useAuth()` is a hook, so it must be called inside a component/hook — not inside a plain function. Build the authenticated client from the `getToken` obtained in a hook:

```typescript
import { useAuth } from '@clerk/clerk-react';

export function useApi() {
  const { getToken } = useAuth();

  return async function api(path: string, options: RequestInit = {}) {
    const token = await getToken(); // fresh JWT per call; never cache
    return fetch(`${import.meta.env.VITE_API_URL}/api/v1${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
  };
}
```

### OAuth connect is a `fetch`, not a navigation

Because a top-level browser redirect cannot attach the `Authorization` header, the OAuth connect endpoint is an authenticated `POST` that returns a URL; the SPA then navigates to it ([ADR-014](../architecture/decisions.md)):

```typescript
const { authorizeUrl } = await api(`/integrations/${provider}/connect`, { method: 'POST' })
  .then(r => r.json()).then(b => b.data);
window.location.assign(authorizeUrl);
```

## OAuth `state` (CSRF protection)

The connect endpoint mints a random, single-use `state` nonce stored in `oauth_states` bound to `{ org_id, user_id, provider }` with a 10-minute TTL. The callback:
1. Looks up the nonce; rejects if missing, expired, or already consumed → `400 OAUTH_STATE_INVALID`.
2. Marks it consumed (single-use).
3. Derives `org_id`/`user_id` **from the stored row**, never from any client-supplied parameter.

This prevents login-CSRF (an attacker tricking a victim into connecting the attacker's account) and cross-org connection.

## Webhook authentication

Clerk webhooks are verified separately from JWT auth:

```
POST /api/v1/auth/webhook
Headers:
  svix-id: msg_...
  svix-timestamp: 1718550000
  svix-signature: v1,base64signature
```

Verified using `CLERK_WEBHOOK_SECRET` via the Svix library. Rejects requests older than 5 minutes (replay protection).

> **Raw body required.** Signature verification (Svix for Clerk, HMAC for Slack) runs over the **exact raw request bytes**. The global `express.json()` parser consumes and reshapes the body, breaking verification. Mount webhook routes with a raw-body parser (`express.raw({ type: '*/*' })`) *before* — and instead of — the JSON parser, and parse JSON yourself after the signature check. This is a common, easy-to-miss production bug.

## Slack webhook authentication

```
POST /api/v1/webhooks/slack
Headers:
  X-Slack-Request-Timestamp: 1718550000
  X-Slack-Signature: v0=abc123...
```

Verified using `SLACK_SIGNING_SECRET`:
```
sig_basestring = "v0:" + timestamp + ":" + raw_body
expected = "v0=" + HMAC-SHA256(signing_secret, sig_basestring)
```

Reject if timestamp is older than 5 minutes.

## Roles and permissions

| Role | Clerk claim | API access |
|------|-------------|------------|
| Owner | `org:admin` (first member) | Full access |
| Admin | `org:admin` | Manage integrations, digest, invite members |
| Member | `org:member` | Ask questions, view integrations, read history |

Role is synced from Clerk on membership webhook events and stored in `users.role`.

## Security requirements

- All API traffic over HTTPS in production (TLS 1.2+).
- JWTs never stored in localStorage — Clerk SDK uses httpOnly session cookies.
- CORS restricted to `FRONTEND_URL` / `CORS_ORIGINS`.
- No API keys in frontend code — only Clerk publishable key (`pk_...`).
- Backend secrets (`CLERK_SECRET_KEY`, etc.) never exposed to client.

## Local development

Use Clerk development instance:
- Publishable key: `pk_test_...`
- Secret key: `sk_test_...`
- Frontend: `VITE_CLERK_PUBLISHABLE_KEY=pk_test_...`
- Backend: `CLERK_SECRET_KEY=sk_test_...`

Clerk dev instance allows `localhost` origins by default.
