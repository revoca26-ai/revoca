# Auth Module

Clerk-based authentication. The backend never stores passwords — it verifies Clerk-issued JWTs and syncs user/org records via webhooks.

## Components

| Component | Role |
|-----------|------|
| Clerk (hosted) | Sign-up, sign-in, session management, org creation |
| `middleware/auth.ts` | Verify JWT on every protected route |
| `routes/auth.ts` | Webhook handler + `/me` endpoint |
| `modules/auth/` | User/org sync, token encryption utilities |

## JWT verification

Every protected request requires:

```
Authorization: Bearer <clerk_session_jwt>
```

Verification steps:
1. Fetch Clerk JWKS (cached 1 hour).
2. Verify signature, `exp`, and `iss`.
3. Extract `sub` (user ID) and `org_id` from claims.
4. Look up user in DB; reject if not found or org mismatch.

Unauthenticated requests to protected routes → `401 AUTH_REQUIRED`.

## Webhook: user/org sync

```
POST /api/v1/auth/webhook
Header: svix-signature (Clerk webhook signature)
```

Handled events:

| Event | Action |
|-------|--------|
| `user.created` | Insert user row |
| `user.updated` | Update email |
| `user.deleted` | Soft-delete user |
| `organization.created` | Insert org row |
| `organizationMembership.created` | Link user to org, set role |

Webhook signature verified with `CLERK_WEBHOOK_SECRET` before processing.

## Token encryption

OAuth tokens for integrations are encrypted at rest:

- Algorithm: AES-256-GCM
- Key: `TOKEN_ENCRYPTION_KEY` (32-byte hex)
- Stored as `{ iv, ciphertext, authTag }` base64-encoded in `integrations.access_token_enc`

Encrypt/decrypt functions live in `modules/auth/crypto.ts`. Never log decrypted tokens.

## Roles

| Role | Permissions |
|------|-------------|
| `owner` | All actions, billing, delete org |
| `admin` | Manage integrations, invite members, configure digest |
| `member` | Ask questions, view integrations (read-only) |

Role checked in route middleware for admin-only endpoints (connect/disconnect integrations, digest settings).

## Files (target)

```
modules/auth/
├── clerkVerify.ts         JWKS fetch + JWT validation
├── syncUser.ts            Webhook event handlers
├── crypto.ts              AES-256-GCM encrypt/decrypt
└── roles.ts               Role-based access helpers
middleware/auth.ts          requireAuth, requireRole('admin')
routes/auth.ts              webhook + GET /me
```

## Endpoints

See [authentication.md](../../api/authentication.md) and [contract.md](../../api/contract.md#auth).
