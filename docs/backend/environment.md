# Environment Variables

All backend env vars. Copy `.env.example` to `backend/.env` for local dev.

| Variable | Required | Description | Where to get it |
|----------|----------|-------------|-----------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (`postgresql://user:pass@host:5432/revoca`) | Local: Docker or Postgres.app. Prod: Railway Postgres dashboard |
| `OPENAI_API_KEY` | Yes | Embeddings via `text-embedding-ada-002` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `ANTHROPIC_API_KEY` | Yes | Claude for query rewrite + answer generation | [console.anthropic.com](https://console.anthropic.com) |
| `CLERK_SECRET_KEY` | Yes | Backend JWT verification + webhook signing | Clerk dashboard → API Keys → Secret key |
| `CLERK_WEBHOOK_SECRET` | Yes | Verify Clerk webhook signatures (`whsec_...`) | Clerk dashboard → Webhooks → signing secret |
| `GOOGLE_CLIENT_ID` | Yes | OAuth for Gmail + Google Drive | Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth client secret | Same as above |
| `GOOGLE_REDIRECT_URI` | Yes | OAuth callback URL (e.g. `http://localhost:3000/api/v1/integrations/google/callback`) | Must match Google Cloud redirect URI list exactly |
| `SLACK_CLIENT_ID` | Yes | Slack OAuth app ID | [api.slack.com/apps](https://api.slack.com/apps) |
| `SLACK_CLIENT_SECRET` | Yes | Slack OAuth app secret | Same app → Basic Information |
| `SLACK_SIGNING_SECRET` | Yes | Verify Slack Events API webhook payloads | Same app → Basic Information |
| `SLACK_REDIRECT_URI` | Yes | OAuth callback (e.g. `http://localhost:3000/api/v1/integrations/slack/callback`) | Slack app → OAuth & Permissions |
| `TOKEN_ENCRYPTION_KEY` | Yes | 32-byte hex key for AES-256-GCM encryption of OAuth tokens at rest | Generate: `openssl rand -hex 32` |
| `PORT` | No | HTTP port (default `3000`) | — |
| `NODE_ENV` | No | `development` or `production` | — |
| `FRONTEND_URL` | Yes | Frontend origin for OAuth redirects and CORS (e.g. `http://localhost:5173`) | — |
| `CORS_ORIGINS` | No | Comma-separated allowed origins (defaults to `FRONTEND_URL`) | — |
| `EMAIL_API_KEY` | Yes& | Transactional email for digest (Resend or SendGrid) | Resend/SendGrid dashboard |
| `EMAIL_FROM` | Prod | Sender address (e.g. `digest@revoca.app`) | Your domain DNS (SPF/DKIM) |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` (default `info`) | — |
| `SYNC_INTERVAL_MINUTES` | No | Poll interval for integration sync (default `15`) | — |
| `ASK_RATE_LIMIT_PER_MIN` | No | Max ask requests per user per minute (default `10`) | — |
| `CONFIDENCE_THRESHOLD` | No | Min rerank score to generate answer (default `0.55`) | — |

## Frontend env vars (for reference)

Set in `frontend/.env.local` (not committed):

| Variable | Description |
|----------|-------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_...`) |
| `VITE_API_URL` | Backend URL (e.g. `http://localhost:3000`) |

## Validation

The backend validates all required vars on startup. Missing vars cause a hard exit with a clear error listing what's absent — no silent defaults for secrets.

## Security rules

- Never log secret values.
- Rotate `TOKEN_ENCRYPTION_KEY` only with a migration plan — existing encrypted tokens become unreadable.
- Use separate Clerk/Google/Slack apps for development and production.
- Production `DATABASE_URL` must use SSL (`?sslmode=require`).
