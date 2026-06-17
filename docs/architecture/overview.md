# Architecture Overview

## What Revoca is

Revoca is a multi-tenant SaaS that ingests business content from third-party integrations, indexes it for hybrid search, and answers natural-language questions with cited sources. Each organization owns an isolated data partition; no cross-tenant reads are permitted at any layer.

## System diagram

```
┌─────────────┐     HTTPS      ┌──────────────────┐
│  React SPA  │ ──────────────▶│  Express API     │
│  (Vercel)   │ ◀──────────────│  (Railway)       │
└─────────────┘   Clerk JWT    └────────┬─────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
             ┌────────────┐     ┌─────────────┐     ┌──────────────┐
             │ PostgreSQL │     │  OpenAI     │     │  Anthropic   │
             │ + pgvector │     │  Embeddings │     │  Claude      │
             └────────────┘     └─────────────┘     └──────────────┘
                    ▲
                    │ OAuth pull + webhooks
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   Google Drive   Gmail      Slack
```

## Core subsystems

| Subsystem | Responsibility | Module doc |
|-----------|---------------|------------|
| Auth | Clerk identity, org membership, JWT verification | [auth.md](../backend/modules/auth.md) |
| Integrations | OAuth 2.0 connect/disconnect, token storage | [integrations/](../backend/modules/integrations/) |
| Ingest | Fetch, clean, chunk, embed, persist | [ingest.md](../backend/modules/ingest.md) |
| Search | Hybrid retrieval + reranking | [search.md](../backend/modules/search.md) |
| Ask | Query rewrite, answer generation, citations | [ask.md](../backend/modules/ask.md) |
| Digest | Nightly summary + email delivery | [digest.md](../backend/modules/digest.md) |
| Jobs | Scheduled sync, digest, token refresh | [jobs.md](../backend/jobs.md) |

## Request lifecycle (ask)

1. User submits a question in the web UI.
2. Frontend sends `POST /api/v1/ask` with Clerk session JWT.
3. API verifies JWT, resolves `org_id`, rate-limits the request.
4. Claude rewrites the question into optimized search terms.
5. Hybrid search returns top 20 chunks; reranker narrows to top 6.
6. If max rerank score < confidence threshold → return `INSUFFICIENT_EVIDENCE`.
7. Claude generates an answer from the 6 chunks only; citations attached.
8. Query + answer + sources persisted; response returned to client.

## Multi-tenancy

Every table carries an `org_id`. All queries include `WHERE org_id = $1`. Row-level isolation is enforced in the repository layer — never in individual route handlers ad hoc.

## Security boundaries

- **Claude never sees the full database.** Only pre-filtered chunks (max 6) are sent per request.
- **OAuth tokens** are AES-256-GCM encrypted at rest; decrypted only inside connector workers.
- **Clerk** is the sole identity provider; the backend never stores passwords.
- **Webhook endpoints** (Clerk, Slack Events) verify signatures before processing.

## Deployment topology

| Service | Host | Notes |
|---------|------|-------|
| Frontend | Vercel | Static SPA, env vars for Clerk publishable key + API URL |
| Backend API | Railway | Single web process; horizontal scale via replicas |
| PostgreSQL | Railway managed | pgvector extension enabled |
| Cron jobs | Same Railway service | node-cron in-process (Phase 1); move to Railway cron/queue at scale |

## Phase boundaries

- **Phase 1:** Google Drive, Gmail, Slack + email digest + web UI.
- **Phase 2:** WhatsApp Business, Zoom/Meet transcripts, GitHub, Notion, CSV/file upload.
- **Phase 3:** Team analytics, admin console, SSO, usage-based billing, WhatsApp digest delivery.

See [data-flow.md](data-flow.md) for step-by-step data movement and [decisions.md](decisions.md) for ADRs.
