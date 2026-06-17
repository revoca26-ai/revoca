# Backend Setup

Express API server for ingestion, search, ask, and background jobs.

## Prerequisites

- Node.js 20 LTS
- PostgreSQL 15+ with [pgvector](https://github.com/pgvector/pgvector) extension
- API keys: Clerk, Google Cloud (OAuth), Slack, OpenAI, Anthropic

## First-time setup

```bash
cd backend
cp ../.env.example .env        # fill all values — see environment.md
npm install
```

### Enable pgvector

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Run migrations

```bash
npm run migrate                # applies migrations/ in order
```

Migration files live in `backend/migrations/`. Each file is numbered and idempotent.

### Start dev server

```bash
npm run dev                    # nodemon, default port 3000
```

Or from repo root:

```bash
npm run dev                    # starts backend + frontend concurrently
```

## Project structure (target)

```
backend/
├── index.js                   # Express app entry, middleware, route mounting
├── config/                    # env validation, constants
├── middleware/
│   ├── auth.js                # Clerk JWT verification
│   ├── rateLimit.js
│   └── errorHandler.js
├── routes/
│   ├── auth.js
│   ├── integrations.js
│   ├── ask.js
│   └── digest.js
├── modules/
│   ├── auth/
│   ├── ingest/
│   ├── search/
│   ├── ask/
│   ├── digest/
│   └── integrations/
│       ├── slack.js
│       ├── gmail.js
│       └── gdrive.js
├── jobs/
│   ├── syncScheduler.js
│   ├── digestScheduler.js
│   └── tokenRefresh.js
├── db/
│   ├── pool.js
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
| `extension "vector" does not exist` | Run `CREATE EXTENSION vector;` on your database |
| Clerk JWT rejected | Verify `CLERK_SECRET_KEY` and that frontend uses the matching Clerk instance |
| OAuth callback 404 | Ensure redirect URIs match Google/Slack app config exactly |
| Embedding errors | Check `OPENAI_API_KEY` quota and that model `text-embedding-ada-002` is accessible |

## Production notes

- Set `NODE_ENV=production`
- Use Railway-managed PostgreSQL with pgvector enabled
- Run `npm run migrate` as a deploy hook before starting the web process
- Never commit `backend/.env` — it is gitignored
