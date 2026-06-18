# Deployment

Backend on Railway. Frontend on Vercel.

## Prerequisites

- Railway account with billing enabled
- Vercel account linked to GitHub repo
- Production Clerk instance
- Production Google Cloud + Slack OAuth apps
- Domain configured (e.g. `revoca.app`, `api.revoca.app`, `app.revoca.app`)

## Backend — Railway

### 1. Create project

```bash
railway login
railway init          # link to GitHub repo
```

### 2. Add PostgreSQL (Neon)

Create a production project at [console.neon.tech](https://console.neon.tech) (or use a separate branch on your dev project for staging).

In Neon **SQL Editor**:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
```

Copy the **pooled** connection string from **Connection details** and set it as `DATABASE_URL` in Railway.

> **Alternative:** Railway dashboard → New → Database → PostgreSQL, then enable pgvector the same way. Neon is preferred for serverless scale-to-zero and branching.

### 3. Configure environment

Set all variables from [environment.md](../backend/environment.md) in Railway service settings. Production values:

| Variable | Production value |
|----------|-----------------|
| `NODE_ENV` | `production` |
| `PORT` | `3000` (Railway sets `PORT` automatically) |
| `FRONTEND_URL` | `https://app.revoca.app` |
| `GOOGLE_REDIRECT_URI` | `https://api.revoca.app/api/v1/integrations/google/callback` |
| `SLACK_REDIRECT_URI` | `https://api.revoca.app/api/v1/integrations/slack/callback` |
| `DATABASE_URL` | Neon pooled connection string (`?sslmode=require`) |

Use Railway's secret management — never commit production secrets.

### 4. Deploy configuration

Railway service settings:

| Setting | Value |
|---------|-------|
| Root directory | `backend` |
| Build command | `npm install && npm run build` |
| Start command | `npm run migrate && npm start` |
| Health check path | `/api/v1/health` |

### 5. Custom domain

Railway → Settings → Domains → add `api.revoca.app`. Configure DNS CNAME.

### 6. OAuth redirect URIs

Update production redirect URIs in:
- Google Cloud Console → Credentials → Authorized redirect URIs
- Slack App → OAuth & Permissions → Redirect URLs
- Clerk → Allowed origins → `https://app.revoca.app`

---

## Frontend — Vercel

### 1. Import project

Vercel dashboard → Import Git Repository → select `revoca`.

| Setting | Value |
|---------|-------|
| Root directory | `frontend` |
| Framework | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |

### 2. Environment variables

| Variable | Value |
|----------|-------|
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_...` |
| `VITE_API_URL` | `https://api.revoca.app` |

### 3. Custom domain

Vercel → Settings → Domains → add `app.revoca.app`.

### 4. Deploy

Push to `main` triggers automatic deploy. Preview deploys created for PRs.

---

## Post-deploy checklist

- [ ] `GET https://api.revoca.app/api/v1/health` returns `{ "status": "ok" }`
- [ ] Frontend loads at `https://app.revoca.app`
- [ ] Sign up / sign in works (Clerk production instance)
- [ ] Connect Slack → OAuth callback succeeds
- [ ] Connect Google (Gmail + Drive) → OAuth callback succeeds
- [ ] Submit a question → answer returned with sources
- [ ] Digest email received next morning
- [ ] Clerk webhook delivering user sync events
- [ ] Slack Events API webhook verified

## Rollback

**Railway:** Dashboard → Deployments → select previous deployment → Redeploy.

**Vercel:** Dashboard → Deployments → select previous deployment → Promote to Production.

Database migrations are forward-only. Rollback code, not schema.

## Monitoring (Phase 1 minimum)

- Railway logs for backend errors
- Vercel analytics for frontend
- Uptime check on `/api/v1/health` (UptimeRobot or similar)
- Alert on 3 consecutive health check failures

Phase 2: structured logging (Axiom/Logtail), error tracking (Sentry), API latency dashboards.

## SSL

Both Railway and Vercel provision TLS certificates automatically. Enforce HTTPS — no HTTP endpoints in production.
