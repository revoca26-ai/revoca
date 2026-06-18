# Environment Variables

All backend env vars. Copy `.env.example` to `backend/.env` for local dev.

| Variable | Required | Description | Where to get it |
|----------|----------|-------------|-----------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | **Dev:** [Neon](https://neon.tech) pooled URL (`?sslmode=require`). **Prod:** Neon or Railway Postgres |
| `REDIS_URL` | Prod | Shared store for distributed rate limiting across API replicas ([ADR-013](../architecture/decisions.md)). Dev falls back to in-memory | Railway Redis dashboard |
| `OPENAI_API_KEY` | Yes | Embeddings via `text-embedding-3-small` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `ANTHROPIC_API_KEY` | Yes | Claude Haiku (query rewrite) + Sonnet (answer generation) | [console.anthropic.com](https://console.anthropic.com) |
| `COHERE_API_KEY` | Yes | Reranking via `rerank-english-v3.0` ([ADR-004](../architecture/decisions.md)) | [dashboard.cohere.com](https://dashboard.cohere.com) |
| `CLERK_SECRET_KEY` | Yes | Backend JWT verification + webhook signing | Clerk dashboard → API Keys → Secret key |
| `CLERK_WEBHOOK_SECRET` | Yes | Verify Clerk webhook signatures (`whsec_...`) | Clerk dashboard → Webhooks → signing secret |
| `GOOGLE_CLIENT_ID` | Yes | OAuth for Gmail + Google Drive | Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth client secret | Same as above |
| `GOOGLE_REDIRECT_URI` | Yes | OAuth callback URL (e.g. `http://localhost:3000/api/v1/integrations/google/callback`) | Must match Google Cloud redirect URI list exactly |
| `SLACK_CLIENT_ID` | Yes | Slack OAuth app ID | [api.slack.com/apps](https://api.slack.com/apps) |
| `SLACK_CLIENT_SECRET` | Yes | Slack OAuth app secret | Same app → Basic Information |
| `SLACK_SIGNING_SECRET` | Yes | Verify Slack Events API webhook payloads | Same app → Basic Information |
| `SLACK_REDIRECT_URI` | Yes | OAuth callback (e.g. `http://localhost:3000/api/v1/integrations/slack/callback`) | Slack app → OAuth & Permissions |
| `TOKEN_ENCRYPTION_KEY` | Yes | Active AES-256-GCM key for OAuth-token encryption at rest. Format `v1:<64-hex>` so keys can be rotated by id without orphaning existing ciphertext | Generate: `openssl rand -hex 32` |
| `OAUTH_STATE_SECRET` | Yes | Secret for signing OAuth `state` nonces (CSRF — [ADR-014](../architecture/decisions.md)) | `openssl rand -hex 32` |
| `ROLE` | No | `api` (default) or `worker`. Selects HTTP server vs. cron/ingestion process ([ADR-008](../architecture/decisions.md)) | — |
| `PORT` | No | HTTP port (default `3000`) | — |
| `NODE_ENV` | No | `development` or `production` | — |
| `FRONTEND_URL` | Yes | Frontend origin for OAuth redirects and CORS (e.g. `http://localhost:5173`) | — |
| `CORS_ORIGINS` | No | Comma-separated allowed origins (defaults to `FRONTEND_URL`) | — |
| `EMBEDDING_MODEL` | No | OpenAI embedding model (default `text-embedding-3-small`). Changing it requires a re-embed migration | — |
| `EMAIL_API_KEY` | Digest | Transactional email for digest (Resend or SendGrid). Required if the digest feature is enabled | Resend/SendGrid dashboard |
| `EMAIL_FROM` | Digest | Sender address (e.g. `digest@revoca.app`); required if digest enabled | Your domain DNS (SPF/DKIM) |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` (default `info`) | — |
| `SYNC_INTERVAL_MINUTES` | No | Poll interval for integration sync (default `15`) | — |
| `ASK_RATE_LIMIT_PER_MIN` | No | Max ask requests per user per minute (default `10`) | — |
| `CONFIDENCE_THRESHOLD` | No | Min reranker relevance score to generate an answer (default `0.55`) | — |

## Frontend env vars (for reference)

Set in `frontend/.env.local` (not committed):

| Variable | Description |
|----------|-------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_...`) |
| `VITE_API_URL` | Backend URL (e.g. `http://localhost:3000`) |

## Validation

The backend validates all required vars on startup. Missing vars cause a hard exit with a clear error listing what's absent — no silent defaults for secrets.

## Security rules

- Never log secret values or decrypted tokens.
- `TOKEN_ENCRYPTION_KEY` is **versioned** (`v1:...`). To rotate, add `v2:...` as the active key while keeping `v1` available for decryption; a background re-encrypt pass upgrades existing ciphertext, after which `v1` can be retired. Ciphertext stores its key id so old and new keys coexist without downtime.
- Use separate Clerk/Google/Slack/Cohere apps and keys for development and production.
- Production `DATABASE_URL` must use SSL (`?sslmode=require`). Neon includes this by default.
- Neon pooled connections (hostname contains `-pooler`) are recommended for the API and worker. Use the direct (non-pooled) URL only if migrations fail through the pooler.
