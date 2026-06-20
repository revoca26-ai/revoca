# End-to-End Flow

A visual, arrow-by-arrow walkthrough of how data moves through Revoca — from the React frontend, through the API and worker, out to the model/provider APIs, and back to the user.

This is the "see the whole thing at once" companion to [overview.md](overview.md) (subsystems) and [data-flow.md](data-flow.md) (step lists). Where they disagree, the [ADRs](decisions.md) win.

Legend:

```
──▶   request / data moving forward
◀──   response / data coming back
···▶  asynchronous / background (no one waiting on the response)
≈≈▶   streamed (many messages over one open connection, e.g. SSE)
```

---

## 1. The big picture (everything at once)

```
                                   BROWSER (Vercel SPA - MVP)
        ┌──────────────────────────────────────────────────────────────────┐
        │  React 19 + Vite                                                   │
        │  Clerk SDK  ·  useApi()  ·  useAsk()  ·  useIntegrations()         │
        └───────────────┬───────────────────────────────────┬──────────────┘
                        │ 1. Authorization: Bearer <JWT>     │ EventSource (SSE)
                        │    (fresh from Clerk each call)    │
                        ▼                                    ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │                 API  (AWS ECS Fargate, N stateless replicas)     │
        │                                                                    │
        │   middleware:  verifyJWT ─▶ resolveOrg ─▶ rateLimit ─▶ quota       │
        │   routes:      /me  /organization  /ask  /integrations  /digest    │
        │   webhooks:    /auth/webhook  /webhooks/slack   (raw-body verify)  │
        └───┬───────────────┬───────────────┬───────────────┬───────────────┘
            │               │               │               │
            │ SQL           │ rate-limit     │ enqueue       │ read/write
            ▼               ▼  counters      ▼  work         ▼
    ┌────────────────┐  ┌──────────┐   ┌───────────────────────────────┐
    │  PostgreSQL    │  │  Redis   │   │  WORKER (AWS ECS Fargate, 1)  │
    │  (AWS RDS)     │◀─┤(Elasti-  │   │  ROLE=worker                   │
    │  (HNSW + GIN)  │  │ Cache)   │   │   • node-cron (advisory-locked)│
    │                │  └──────────┘   │   • ingestion pipeline         │
    └────────────────┘   read/write    │   • ask pipeline processing    │
            ▲                          └───┬───────────┬───────────┬────┘
            │ persist chunks/queries        │           │           │
            │                               ▼           ▼           ▼
            │                        ┌──────────┐ ┌──────────┐ ┌──────────┐
            │                        │  OpenAI  │ │  Cohere  │ │  Google  │
            │                        │  embed   │ │  rerank  │ │  Gemini  │
            │                        └──────────┘ └──────────┘ └──────────┘
            │
            │ OAuth pull + webhooks (handled by the WORKER's connectors)
    ┌────────┴─────────┬──────────────┐
    ▼                  ▼              ▼
Google Drive        Gmail         Slack
```

Key idea: **API replicas are stateless and never run scheduled work.** All cron + ingestion + ask processing happens in the single **worker** so jobs never double-fire and heavy CPU work never blocks API latency ([ADR-008](decisions.md)).

---

## 2. Authentication (every protected request)

```
React (useApi hook)
   │  token = await getToken()          ← Clerk SDK, fresh short-lived JWT
   │
   │  fetch(/api/v1/..., Authorization: Bearer <token>)
   ▼
API middleware
   ├─▶ verify JWT signature against Clerk JWKS (cached 1h)
   ├─▶ validate exp + iss
   ├─▶ look up user by clerk_user_id (= sub)
   │       └─ not found? ··▶ just-in-time provision from claims (ADR-015)
   ├─▶ check user.org_id == org_id claim
   └─▶ attach { userId, orgId, role } to req.auth
        │
        ▼
   route handler runs with a guaranteed org context
```

If the header is missing → `401 AUTH_REQUIRED`. If the token is bad → `401 AUTH_INVALID`. See [authentication.md](../api/authentication.md).

---

## 3. Ask — the core loop (asynchronous + streamed)

This is the most important flow. It is **not** one long request — submission returns instantly, then the answer streams.

### 3a. Submit (fast, synchronous part)

```
USER types question, hits submit
   │
React useAsk ──▶ POST /api/v1/ask  { question }      (Authorization: Bearer)
                      │
                      ▼
                 API replica
                   ├─▶ validate (Zod: 3–2000 chars)        ─ fail ▶ 400 VALIDATION_ERROR
                   ├─▶ rate limit (Redis, per-user/min)     ─ over ▶ 429 RATE_LIMITED
                   ├─▶ monthly quota (usage_counters)       ─ over ▶ 429 QUOTA_EXCEEDED
                   ├─▶ INSERT queries (status = 'processing')
                   └─▶ hand work to worker pipeline ···▶ (background)
                      │
                   ◀──┘  202  { id, status: "processing" }
   │
React stores id, opens the stream  ▼
```

### 3b. Stream (the answer arrives token-by-token)

```
React ──▶ GET /api/v1/ask/:id/stream            (Server-Sent Events)
              │
              ≈≈▶  event: status   { "status": "processing" }
              │
   WORKER pipeline runs:
      1. rewriteQuery(question) ──▶ Gemini 1.5 Flash ──◀ { searchTerms, intent }
      2. embed(consolidated query) ──▶ OpenAI 3-small ──◀ vector(1536)
      3. hybrid search (PostgreSQL):
            semantic leg  (HNSW, top 20) ─┐
            keyword leg   (GIN,  top 20) ─┴─▶ Reciprocal Rank Fusion ──▶ top 20
      4. rerank(top 20) ──▶ Cohere ──◀ top 6 with calibrated scores
      5. confidence = top score
            └─ if < 0.55 ─▶ status = insufficient_evidence ─▶ (skip step 6)
      6. generateAnswer(6 chunks) ──▶ Gemini 1.5 Flash (streaming)
              │
              ≈≈▶  event: token   { "text": "Acme Corp was dropped" }
              ≈≈▶  event: token   { "text": " in March 2026..." }
              ≈≈▶  ...
      7. buildCitations ─▶ persist answer + query_sources, set status
              │
              ≈≈▶  event: sources { [ {citationIndex, title, url, snippet, ...} ] }
              ≈≈▶  event: done    { <full Query object> }
              │
            (on failure ≈≈▶ event: error { code: "QUERY_TIMEOUT" | "LLM_FAILED" | ... })
   ◀──────────┘  stream closes
   │
React renders AnswerCard (fills as tokens arrive) + SourceChips (on `sources`)
```

If the socket drops, the worker keeps going — the client reconnects to the same
`/ask/:id/stream`, or just reads the finished result:

```
React ──▶ GET /api/v1/ask/:id ──◀ 200 { <full Query object> }   (history / reconnect)
```

See [ask.md](../backend/modules/ask.md) and [ADR-012](decisions.md).

---

## 4. Integration connect (OAuth)

Connect is a `fetch` (not a redirect) so it can carry the auth header; the SPA then navigates to the URL the API returns.

```
USER clicks "Connect Slack"
   │
React ──▶ POST /api/v1/integrations/slack/connect   (Authorization: Bearer)
                 │
                 ▼
            API replica
              ├─▶ mint single-use `state` nonce  ──▶ INSERT oauth_states {org,user,provider, ttl 10m}
              └─◀ 200 { authorizeUrl: "https://slack.com/oauth/...&state=<nonce>" }
   │
React ──▶ window.location = authorizeUrl
   │
   ▼
Slack consent screen ──(user approves)──▶ redirect with ?code=...&state=<nonce>
   │
   ▼
GET /api/v1/integrations/slack/callback?code&state      (no auth header — recovered from state)
   │
   API replica
     ├─▶ look up + consume oauth_states by state  ─ missing/expired/used ▶ 400 OAUTH_STATE_INVALID
     ├─▶ derive {org, user} FROM THE STORED ROW (never from the query string)
     ├─▶ exchange code ──▶ provider token endpoint ──◀ access/refresh tokens
     ├─▶ encrypt tokens (AES-256-GCM) ──▶ INSERT integrations
     ├─▶ enqueue initial full sync ···▶ WORKER
     └─◀ 302 redirect ▶ {FRONTEND_URL}/integrations?connected=slack
   │
React shows success toast, refreshes useIntegrations()
```

Google (Gmail + Drive) uses one shared callback `/integrations/google/callback`; the provider is read from the stored `oauth_states` row. See [ADR-014](decisions.md) and [authentication.md](../api/authentication.md).

---

## 5. Ingestion (how content becomes searchable)

Runs entirely in the **worker** — triggered by the scheduler, a manual sync, or an initial connect.

```
TRIGGER:  cron (every 15m)   |   POST /integrations/:p/sync   |   initial connect
   │              (all converge on the worker pipeline)
   ▼
WORKER · integrationSync  (advisory-locked; one run per integration)
   │
   ├─▶ connector.fetchDelta(cursor) ──▶ Slack / Gmail / Drive API ──◀ raw items + nextCursor
   │
   ▼  for each raw item:
   ┌─────────────────────────────────────────────────────────────┐
   │ normalize  ─▶ strip HTML, extract text + metadata            │
   │     ▼                                                         │
   │ dedup      ─▶ upsert documents on (org_id, integration_id,   │
   │               external_id); unchanged content_hash ▶ skip    │
   │     ▼                                                         │
   │ chunk      ─▶ 200–400 tokens, split on sentence/paragraph/    │
   │               thread boundaries (never mid-sentence)         │
   │     ▼                                                         │
   │ embed      ─▶ OpenAI text-embedding-3-small (batch 100)      │
   │               fail ▶ mark embedding_status='failed' (retry)  │
   │     ▼                                                         │
   │ persist    ─▶ INSERT chunks (embedding + generated           │
   │               search_vector); soft-delete superseded chunks  │
   └─────────────────────────────────────────────────────────────┘
   │
   ├─▶ UPDATE integration.sync_cursor + last_synced_at
   └─▶ write sync_jobs row (completed | failed)
```

Slack also pushes real-time `message` events to `POST /webhooks/slack`; poll + webhook
are idempotent via the `(org_id, integration_id, external_id)` upsert. See [ingest.md](../backend/modules/ingest.md).

---

## 6. Background jobs (worker scheduler)

```
WORKER · node-cron        (each job: pg_try_advisory_lock ─ skip if not acquired)
   │
   ├─ every 15m ─▶ integrationSync   ─▶ poll active integrations (section 5)
   ├─ hourly    ─▶ digestDelivery    ─▶ orgs whose local hour == delivery_hour (section 7)
   ├─ every 30m ─▶ tokenRefresh      ─▶ refresh Google tokens near expiry
   ├─ every 5m  ─▶ embeddingRetry    ─▶ re-embed chunks where status='failed'
   ├─ hourly    ─▶ oauthStateCleanup ─▶ delete expired/consumed oauth_states
   ├─ daily     ─▶ purgeDeleted      ─▶ hard-delete soft-deleted rows past grace
   └─ daily     ─▶ syncJobCleanup    ─▶ delete sync_jobs older than 30 days
```

See [jobs.md](../backend/jobs.md).

---

## 7. Digest (proactive daily email)

```
WORKER · digestDelivery (hourly, advisory-locked)
   │
   ▼  for each org where now()@org.timezone == delivery_hour AND not sent today:
   ├─▶ SELECT chunks ingested in last 24h            ─ zero? ▶ skip (no empty digest)
   ├─▶ summarize(chunks) ──▶ Gemini 1.5 Flash ──◀ structured markdown
   ├─▶ renderEmail(summary) ─▶ responsive HTML + text fallback
   ├─▶ sendEmail(recipients) ──▶ Resend / SendGrid ──◀ accepted
   └─▶ INSERT digest_deliveries + UPDATE last_sent_at
        │
        ▼
   USER's inbox ◀── "Here's what happened in your business yesterday"
```

See [digest.md](../backend/modules/digest.md).

---

## 8. Enforcing Security & Boundaries

```
Tenant isolation ─▶ repository layer: every query has WHERE org_id = $1
Rate limits      ─▶ Redis (shared across ECS replicas)
Monthly quota    ─▶ usage_counters (atomic increment on completed asks)
OAuth CSRF       ─▶ oauth_states (single-use, org/user-bound nonce)
Token secrecy    ─▶ AES-256-GCM at rest; decrypted only in worker connectors
Webhook trust    ─▶ raw-body signature verification (Svix / Slack HMAC)
LLM safety       ─▶ Gemini sees ≤ 6 chunks per ask, never the database
```

---

## 9. Status vocabulary (so the diagrams read unambiguously)

| Entity | Field | Values |
|--------|-------|--------|
| Query | `status` | `processing → completed` \| `insufficient_evidence` \| `failed` \| `timeout` |
| Integration | `status` | `pending → active`, `active → error`, `active → disconnecting → disconnected` |
| Sync job | `status` | `running → completed` \| `failed` |
| Digest delivery | `status` | `sent` \| `failed` |
