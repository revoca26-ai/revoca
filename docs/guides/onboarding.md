# Onboarding

New developer setup: zero to running locally in 30 minutes.

## 0. Access (5 min)

Request from team lead:
- [ ] GitHub repo access
- [ ] Clerk dev instance invite
- [ ] Google Cloud project viewer access (for OAuth credentials)
- [ ] Slack app collaborator access
- [ ] OpenAI + Anthropic API keys (shared dev keys)

## 1. Clone and install (3 min)

```bash
git clone git@github.com:revoca/revoca.git
cd revoca
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

## 2. Database (5 min)

**Option A — Docker:**
```bash
docker run -d \
  --name revoca-db \
  -e POSTGRES_PASSWORD=revoca \
  -e POSTGRES_DB=revoca \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

**Option B — Local Postgres + pgvector:**
```bash
brew install pgvector
createdb revoca
psql revoca -c "CREATE EXTENSION vector;"
```

## 3. Environment (5 min)

```bash
cp .env.example backend/.env
```

Fill in `backend/.env`:

| Variable | Dev value |
|----------|-----------|
| `DATABASE_URL` | `postgresql://postgres:revoca@localhost:5432/revoca` |
| `OPENAI_API_KEY` | From team lead |
| `ANTHROPIC_API_KEY` | From team lead |
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
| `extension "vector" does not exist` | Run `CREATE EXTENSION vector;` on your database |
| Frontend shows blank page | Check browser console; verify `VITE_CLERK_PUBLISHABLE_KEY` is set |
| OAuth redirect fails | Redirect URI must match exactly in provider app settings |
| Clerk =401 on all API calls | Verify Clerk keys match between frontend and backend |
| No data in search results | Connect an integration and wait for sync (or trigger manual sync) |

## Done

You should now be able to sign in, connect a test Slack workspace, and submit a question. Welcome to Revoca.
