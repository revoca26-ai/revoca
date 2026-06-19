# Onboarding

New developer setup: zero to running locally in 30 minutes.

## 0. Access (5 min)

Request from team lead:
- [ ] GitHub repo access
- [ ] Neon project invite (or shared `DATABASE_URL` for dev)
- [ ] Clerk dev instance invite
- [ ] Google Cloud project viewer access (for OAuth credentials)
- [ ] Slack app collaborator access
- [ ] OpenAI + Google Gemini API keys (shared dev keys)

## 1. Clone and install (3 min)

```bash
git clone git@github.com:revoca/revoca.git
cd revoca
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

## 2. Database — Neon (5 min)

We use **[Neon](https://neon.tech)** for PostgreSQL — a hosted, always-on database with pgvector. No local Postgres or Docker required. Both developers can point at the same dev branch or use separate Neon projects.

### Create a Neon project

1. Sign up at [console.neon.tech](https://console.neon.tech)
2. **New project** → name it `revoca` (PostgreSQL 16 is fine)
3. Open **SQL Editor** and run:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
```

4. Go to **Dashboard → Connection details** and copy the connection string
5. Use the **pooled** connection string for the app (`-pooler` in the hostname)

Example `DATABASE_URL`:

```
postgresql://user:password@ep-xxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
```

> **Tip:** Neon free tier pauses after inactivity but wakes on connect (~1 s cold start). For shared dev, create one Neon project and share credentials via your team lead (never commit them).

### Optional — local Postgres (fallback)

Only if you need fully offline dev:

```bash
docker run -d --name revoca-db -e POSTGRES_PASSWORD=revoca -e POSTGRES_DB=revoca -p 5432:5432 pgvector/pgvector:pg16
```

Then use `postgresql://postgres:revoca@localhost:5432/revoca` as `DATABASE_URL`.

## 3. Environment (5 min)

```bash
cp .env.example backend/.env
```

Fill in `backend/.env`:

| Variable | Dev value |
|----------|-----------|
| `DATABASE_URL` | Neon pooled connection string (see step 2) |
| `OPENAI_API_KEY` | From team lead |
| `GEMINI_API_KEY` | From team lead |
| `CLERK_SECRET_KEY` | Clerk dashboard → dev instance → Secret key |
| `CLERK_WEBHOOK_SECRET` | Clerk dashboard → Webhooks → dev endpoint |
| `GOOGLE_CLIENT_ID` | Google Cloud → dev OAuth client |
| `GOOGLE_CLIENT_SECRET` | Same |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3000/api/v1/integrations/google/callback` |
| `SLACK_CLIENT_ID` | Slack dev app |
| `SLACK_CLIENT_SECRET` | Slack dev app |
| `SLACK_SIGNING_SECRET` | Slack dev app |
| `SLACK_REDIRECT_URI` | `http://localhost:3000/api/v1/integrations/slack/callback` |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `FRONTEND_URL` | `http://localhost:5173` |
| `PORT` | `3000` |
| `NODE_ENV` | `development` |

Create `frontend/.env.local`:
```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_URL=http://localhost:3000
```

## 4. Migrations (2 min)

```bash
cd backend
npm run migrate
```

## 5. Start (1 min)

From repo root:
```bash
npm run dev
```

- Backend: http://localhost:3000
- Frontend: http://localhost:5173

Verify: `curl http://localhost:3000/api/v1/health`

## 6. Clerk webhook (local dev, 5 min)

For user sync to work locally, expose backend to Clerk:

```bash
ngrok http 3000
```

Add webhook in Clerk dashboard:
- URL: `https://<ngrok-id>.ngrok.io/api/v1/auth/webhook`
- Events: `user.*`, `organization.*`, `organizationMembership.*`

## 7. Read these docs (5 min)

| Priority | Doc | Why |
|----------|-----|-----|
| 1 | [architecture/overview.md](../architecture/overview.md) | System mental model |
| 2 | [api/contract.md](../api/contract.md) | API surface |
| 3 | [architecture/data-flow.md](../architecture/data-flow.md) | How a query flows |
| 4 | [guides/contributing.md](contributing.md) | Git workflow |

## Common first-day tasks

| Task | Start here |
|------|-----------|
| Add an API endpoint | [contract.md](../api/contract.md) → implement in `backend/routes/` |
| Fix a search issue | [search.md](../backend/modules/search.md) |
| Add a UI page | [pages.md](../frontend/pages.md) |
| Debug OAuth | [integrations/slack.md](../backend/modules/integrations/slack.md) or gmail/gdrive |
| Understand a design choice | [decisions.md](../architecture/decisions.md) |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `extension "vector" does not exist` | Run `CREATE EXTENSION vector;` in Neon SQL Editor |
| `Connection refused` / SSL errors | Use Neon pooled URL with `?sslmode=require`; don't use `localhost` unless running local Docker |
| Frontend shows blank page | Check browser console; verify `VITE_CLERK_PUBLISHABLE_KEY` is set |
| OAuth redirect fails | Redirect URI must match exactly in provider app settings |
| Clerk =401 on all API calls | Verify Clerk keys match between frontend and backend |
| No data in search results | Connect an integration and wait for sync (or trigger manual sync) |

## Done

You should now be able to sign in, connect a test Slack workspace, and submit a question. Welcome to Revoca.
