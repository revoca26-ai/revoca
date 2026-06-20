# Backend Setup

Express API server for ingestion, search, ask, and background jobs.

## Prerequisites

- Node.js 20 LTS
- [Neon](https://neon.tech) project with pgvector enabled (see [onboarding.md](../guides/onboarding.md#2-database--neon-5-min))
- API keys: Clerk, Google Cloud (OAuth), Slack, OpenAI, Gemini

## First-time setup

```bash
cd backend
cp ../.env.example .env        # fill all values — see environment.md
npm install
```

### Enable pgvector on Neon

In the Neon **SQL Editor** (or via your first migration):

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
```

### Run migrations

```bash
npm run migrate                # applies migrations/ in order
```

Migration files live in `backend/migrations/`. Each file is numbered and idempotent.

### Start dev server

```bash
npm run dev                    # tsx watch, default port 3000
```

Or from repo root:

```bash
npm run dev                    # starts backend + frontend concurrently
```

## Project structure (target)

```
backend/
├── index.ts                   # Entrypoint (validates env, starts DB, calls app.listen)
├── app.ts                     # Express app setup (cors, middleware, route mounting)
├── tsconfig.json
├── config/                    # env validation, constants
├── middleware/                # Global middlewares
│   ├── auth.ts                # Clerk JWT verification
│   ├── rateLimit.ts
│   └── errorHandler.ts
├── modules/                   # Self-contained domain feature modules
│   ├── auth/                  # Clerk identity, webhook, /me routes
│   │   ├── authRouter.ts
│   │   └── authService.ts
│   ├── ingest/
│   ├── search/
│   ├── ask/                   # Query rewrite, answers, and routes
│   │   ├── askRouter.ts
│   │   ├── askService.ts
│   │   └── ...
│   ├── digest/                # Summarization, settings, and routes
│   │   ├── digestRouter.ts
│   │   └── ...
│   └── integrations/          # OAuth connect, sync, and routes
│       ├── integrationsRouter.ts
│       ├── slack.ts
│       ├── gmail.ts
│       └── gdrive.ts
├── jobs/
│   ├── syncScheduler.ts
│   ├── digestScheduler.ts
│   └── tokenRefresh.ts
├── db/
│   ├── pool.ts
│   └── repositories/
└── migrations/
```

## Health check

```bash
curl http://localhost:3000/api/v1/health
# → { "status": "ok", "version": "1.0.0", "db": "connected" }
```

## Common issues

| Symptom | Fix |
|---------|-----|
| `extension "vector" does not exist` | Run `CREATE EXTENSION vector;` in Neon SQL Editor |
| `Connection terminated` / SSL errors | Use Neon pooled `DATABASE_URL` with `?sslmode=require` |
| Clerk JWT rejected | Verify `CLERK_SECRET_KEY` and that frontend uses the matching Clerk instance |
| OAuth callback 404 | Ensure redirect URIs match Google/Slack app config exactly |
| Embedding errors | Check `OPENAI_API_KEY` quota and that model `text-embedding-3-small` is accessible |

## Production notes

- Set `NODE_ENV=production`
- Use AWS RDS PostgreSQL (recommended) or Neon with pgvector enabled
- Run `npm run migrate` as a deploy hook or container startup step before starting the web process
- Never commit `backend/.env` — it is gitignored
