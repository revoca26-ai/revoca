# Architecture Overview

## What Revoca is

Revoca is a multi-tenant SaaS that ingests business content from third-party integrations, indexes it for hybrid search, and answers natural-language questions with cited sources. Each organization owns an isolated data partition; no cross-tenant reads are permitted at any layer.

## System diagram

```
┌─────────────┐   HTTPS + SSE   ┌──────────────────┐      ┌──────────────────┐
│  React SPA  │ ───────────────▶│  Express API     │      │  Worker          │
│  (Vercel)   │ ◀───────────────│  (Railway, ×N)   │      │  (Railway, ×1)   │
└─────────────┘   Clerk JWT     └────────┬─────────┘      │  cron + ingest   │
                                         │                └────────┬─────────┘
                                         │   shared store          │
                                         ▼  (Redis: rate limit)    │
                    ┌────────────────────┼─────────────────────────┘
                    ▼                    ▼            ▼            ▼
             ┌────────────┐     ┌─────────────┐ ┌──────────┐ ┌──────────────┐
             │ PostgreSQL │     │  OpenAI     │ │  Cohere  │ │  Anthropic   │
             │ + pgvector │     │  Embeddings │ │  Rerank  │ │  Claude      │
             └────────────┘     └─────────────┘ └──────────┘ └──────────────┘
                    ▲
                    │ OAuth pull + webhooks (handled by Worker)
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   Google Drive   Gmail      Slack
```

The API replicas are stateless and run **no** scheduled work. A single Worker process (same image, `ROLE=worker`) owns cron jobs and the ingestion pipeline so jobs never double-fire and CPU-heavy ingestion never blocks API latency ([ADR-008](decisions.md)).

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

Ask is asynchronous and streamed ([ADR-012](decisions.md)) — no 30 s synchronous request.

1. User submits a question in the web UI.
2. Frontend sends `POST /api/v1/ask` with Clerk session JWT.
3. API verifies JWT, resolves `org_id`, checks rate limit + monthly quota, persists the query (`status: processing`), and returns `202 { id }`.
4. Frontend opens `GET /api/v1/ask/:id/stream` (SSE).
5. Worker pipeline: Claude **Haiku** rewrites the question → consolidated embedding (`text-embedding-3-small`).
6. Hybrid search (RRF fusion) returns top 20; **Cohere** reranker narrows to top 6 with calibrated scores.
7. If top relevance < confidence threshold → `status: insufficient_evidence` (no answer generated).
8. Claude **Sonnet** streams the answer from the 6 chunks only; tokens forwarded over SSE; citations attached.
9. Query + answer + sources persisted; `done` event closes the stream. Result remains retrievable via `GET /api/v1/ask/:id`.

## Multi-tenancy

Every table carries an `org_id`. All queries include `WHERE org_id = $1`. Row-level isolation is enforced in the repository layer — never in individual route handlers ad hoc.

## Security boundaries

- **Claude never sees the full database.** Only pre-filtered chunks (max 6) are sent per request.
- **OAuth tokens** are AES-256-GCM encrypted at rest; decrypted only inside the Worker's connectors.
- **OAuth connect** is CSRF-protected with a signed, single-use `state` nonce bound to the initiating org/user ([ADR-014](decisions.md)).
- **Clerk** is the sole identity provider; the backend never stores passwords.
- **Webhook endpoints** (Clerk, Slack Events) verify signatures over the raw request body before processing.
- **Tenant isolation** is enforced in the repository layer — every tenant-scoped table carries `org_id` and every query filters on it.

## Deployment topology

| Service | Host | Notes |
|---------|------|-------|
| Frontend | Vercel | Static SPA, env vars for Clerk publishable key + API URL |
| Backend API | Railway | Stateless web process (`ROLE=api`); horizontal scale via replicas; runs no cron |
| Worker | Railway | Single instance (`ROLE=worker`); owns cron + ingestion; advisory-locked jobs |
| PostgreSQL | Railway managed | pgvector extension enabled |
| Redis | Railway managed | Shared store for distributed rate limiting ([ADR-013](decisions.md)) |

Scheduled jobs live in the Worker, and each one takes a PostgreSQL advisory lock before running so a deploy overlap can't double-fire it. Phase 2 moves ingestion to a BullMQ queue with multiple workers.

## Phase boundaries

- **Phase 1:** Google Drive, Gmail, Slack + email digest + web UI.
- **Phase 2:** WhatsApp Business, Zoom/Meet transcripts, GitHub, Notion, CSV/file upload.
- **Phase 3:** Team analytics, admin console, SSO, usage-based billing, WhatsApp digest delivery.

See [flow.md](flow.md) for front-to-back arrow diagrams of every flow, [data-flow.md](data-flow.md) for step-by-step data movement, and [decisions.md](decisions.md) for ADRs.
