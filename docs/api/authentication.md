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

```javascript
// middleware/auth.js
1. Extract Bearer token from Authorization header
2. Decode JWT header → get kid
3. Fetch JWKS from https://<clerk-domain>/.well-known/jwks.json (cached 1h)
4. Verify RS256 signature
5. Validate exp (reject expired), iss (must match Clerk instance)
6. Look up user by clerk_user_id = sub
7. Verify user.org_id matches org_id claim
8. Attach { userId, orgId, role } to req.auth
```

Rejected tokens return `401 AUTH_INVALID`. Missing header returns `401 AUTH_REQUIRED`.

## Token expiry

| Token | Lifetime | Refresh |
|-------|----------|---------|
| Clerk session JWT | 60 seconds (short-lived) | Clerk SDK auto-refreshes via session cookie |
| Clerk session (overall) | 7 days default | Sliding window; refreshed on activity |

The frontend Clerk SDK (`@clerk/clerk-react`) handles token refresh transparently. The backend always receives a fresh JWT.

## Frontend integration

```javascript
import { useAuth } from '@clerk/clerk-react';

async function apiFetch(path, options = {}) {
  const { getToken } = useAuth();
  const token = await getToken();

  return fetch(`${import.meta.env.VITE_API_URL}/api/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
}
```

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
