# Backend Work Split — Two Developers

How to divide Revoca backend work between two people without stepping on each other. This guide maps directly to [buildingFlow.md](buildingFlow.md) stages and the architecture docs in [overview.md](../architecture/overview.md), [flow.md](../architecture/flow.md), and [data-flow.md](../architecture/data-flow.md).

> **Starting point:** A barebones Express server with `GET /health` only. No database, auth, or feature modules yet.

---

## The mental model

Revoca has two backend pipelines that meet at the **`chunks` table**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TRACK A — Data In                                                      │
│                                                                         │
│  Slack / Gmail / GDrive  →  OAuth  →  fetch  →  normalize  →  chunk     │
│       →  embed  →  persist chunks in PostgreSQL                         │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                           chunks table  ← integration contract
                                    │
┌───────────────────────────────────▼─────────────────────────────────────┐
│  TRACK B — Intelligence Out                                             │
│                                                                         │
│  user question  →  rewrite  →  hybrid search  →  rerank  →  answer      │
│       →  SSE stream  |  digest email                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Track A** owns everything that puts searchable data into the database.  
**Track B** owns everything that reads that data to answer questions or send digests.

This split minimizes merge conflicts because the two tracks mostly touch different folders, and the only hard dependency is a stable `chunks` schema (defined in Stage 7).

---

## Why split it this way

| Principle | How this split applies |
|-----------|------------------------|
| **Coherent ownership** | Each person owns an end-to-end pipeline, not random files |
| **Parallel work** | After shared foundation, both tracks can progress independently |
| **Few blocking deps** | B can seed test chunks and build search/ask before A finishes live ingestion |
| **Natural integration point** | The `chunks` + `documents` tables and the ingest pipeline's public API |
| **Worker split** | A owns sync/ingest jobs; B owns ask-processing and digest jobs |

---

## Phase 0 — Shared foundation (do together)

**Duration:** ~3–5 days · **Stages:** 1–7 from [buildingFlow.md](buildingFlow.md)

Neither track can start feature work until this is done. Pair on it or split by stage with daily sync.

| Stage | What | Owner suggestion |
|-------|------|------------------|
| 1 | Env config & folder structure | Either — agree on layout first |
| 2 | PostgreSQL connection & health checks | Either |
| 3 | Migration runner + migrations 001–004 | Either |
| 4 | Repositories: `organizations`, `users`, `integrations` | Either |
| 5 | Clerk JWT auth middleware | **Track B** (they need it first for Ask API testing) |
| 6 | JIT provisioning & Clerk webhooks | **Track B** |
| 7 | Remaining migrations 005–010, all repos, `AppError`, `requireRole` | **Both review** — this is the integration contract |

### Phase 0 exit checklist

- [ ] `npm run migrate` creates the full schema from [database.md](../backend/database.md)
- [ ] `GET /health` reports DB status; `GET /healthz` is always 200
- [ ] Auth middleware works: `GET /api/v1/me` returns user + org with a valid Clerk JWT
- [ ] JIT provisioning creates users on first request
- [ ] Clerk webhook syncs user/org create/update/delete
- [ ] `AppError` + error handler return the standard envelope from [contract.md](../api/contract.md)
- [ ] Both devs can run `npm run dev` from the same environment (WSL **or** Windows — not both on shared `node_modules`)
- [ ] `DATABASE_URL` points at the shared Neon project (or each dev's own Neon branch)

### Folder layout after Phase 0

```
backend/
├── config/env.ts
├── db/
│   ├── pool.ts
│   ├── migrate.ts
│   └── repositories/       ← all repos exist (may be thin stubs)
├── middleware/
│   ├── auth.ts
│   ├── errorHandler.ts
│   └── requireRole.ts
├── migrations/             ← 001–010 applied
├── modules/                ← empty — each track adds their modules
├── jobs/                   ← empty until Stage 16
└── index.ts
```

---

## Track A — Data Platform (Ingestion & Integrations)

**Focus:** Get content from third-party tools into searchable chunks.  
**Stages:** 8, 9, 10, 11, 12, 16 (partial), Slack webhook (from Stage 20)

### What you own

| Area | Files / folders |
|------|-----------------|
| Token security | `modules/integrations/encryption.ts`, `oauthState.ts` |
| OAuth connectors | `modules/integrations/connectors/google.ts`, `slack.ts` |
| Integration routes | `modules/integrations/integrationsRouter.ts` | -- done start from Ingest pipeline
| Ingest pipeline | `modules/ingest/chunker.ts`, `embedder.ts`, `dedup.ts`, `pipeline.ts` |
| Sync jobs | `jobs/integrationSync.ts`, `tokenRefresh.ts`, `oauthStateCleanup.ts`, `purgeDeleted.ts`, `syncJobCleanup.ts` |
| Slack real-time | `modules/integrations/integrationsRouter.ts` (Slack Events webhook) |

### Stage-by-stage work

#### Stage 8 — Token encryption & OAuth state
- [ ] `encrypt()` / `decrypt()` with AES-256-GCM
- [ ] `createState()` / `consumeState()` with 10-min TTL
- [ ] `oauthStates.deleteExpired()` repo method

#### Stage 9 — OAuth connect & disconnect
- [ ] `Connector` interface: `getAuthorizeUrl`, `exchangeCode`, `revokeToken?`
- [ ] Google connector (Gmail + Drive scopes)
- [ ] Slack connector (OAuth V2)
- [ ] Routes: `GET /integrations`, `POST /integrations/:provider/connect`, callbacks, `DELETE /integrations/:provider`
- [ ] Enforce one connection per provider per org (`409 ALREADY_CONNECTED`)

#### Stage 10 — Fetching & normalizing
- [ ] Extend connectors with `fetchDelta(syncCursor)` and `normalize(rawItem)`
- [ ] `NormalizedDocument` type (shared — put in `types/` or `modules/ingest/types.ts`)
- [ ] Fixture-based tests for each provider's normalize output

#### Stage 11 — Chunking
- [ ] `chunker.ts`: 200–400 tokens, split on sentence/paragraph/thread boundaries
- [ ] Provider-specific rules (Slack threads, Gmail bodies, GDrive headings)
- [ ] Unit tests with concrete token-count examples

#### Stage 12 — Embedding & persistence
- [ ] `embedder.ts`: OpenAI `text-embedding-3-small`, batch 100, graceful failure
- [ ] `dedup.ts`: content-hash change detection
- [ ] `pipeline.ts`: full orchestrator (normalize → dedup → chunk → embed → persist)
- [ ] Export a single entry point: `ingestPipeline.process(orgId, integrationId, document)`

#### Stage 16 (partial) — Worker: ingest jobs
- [ ] `jobs/advisoryLock.ts`
- [ ] `integrationSync.ts` — every 15 min, call `fetchDelta` + ingest pipeline
- [ ] `tokenRefresh.ts` — every 30 min for Google tokens
- [ ] `embeddingRetry.ts` — **coordinate with Track B** (B defines retry semantics, A implements the job that calls B's embedder or shared `embedder.ts`)
- [ ] `oauthStateCleanup.ts`, `purgeDeleted.ts`, `syncJobCleanup.ts`
- [ ] `ROLE=api` vs `ROLE=worker` split in `index.ts`

#### Slack webhook (from Stage 20)
- [ ] `POST /api/v1/webhooks/slack` with raw-body signature verification
- [ ] Handle `url_verification` challenge + `message` events → ingest pipeline

### Track A exit checklist

- [ ] Connect Slack via OAuth end-to-end; tokens stored encrypted
- [ ] `integrationSync` job pulls messages and creates `documents` + `chunks` with embeddings
- [ ] Dedup skips unchanged content; changed content soft-deletes old chunks
- [ ] Failed embeddings marked `embedding_status = 'failed'` (not crashed)
- [ ] Slack webhook ingests real-time messages
- [ ] **Handoff:** provide Track B a seed script or documented SQL to insert 50 test chunks for search development

### Track A does NOT touch

- `modules/search/`, `modules/ask/`, `modules/digest/`
- `modules/ask/askRouter.ts`, `modules/digest/digestRouter.ts`
- `middleware/rateLimit.ts`
- Ask/SSE logic

---

## Track B — Query Platform (Search, Ask & Digest)

**Focus:** Turn indexed chunks into cited answers and daily digest emails.  
**Stages:** 13, 14, 15, 17, 16 (partial)

### What you own

| Area | Files / folders |
|------|-----------------|
| Hybrid search | `modules/search/hybrid.ts`, `rerank.ts` |
| Ask pipeline | `modules/ask/rewrite.ts`, `answer.ts`, `pipeline.ts` |
| Ask API | `modules/ask/askRouter.ts` |
| Digest | `modules/digest/summarizer.ts`, `emailTemplate.ts`, `sender.ts`, `modules/digest/digestRouter.ts` |
| Rate limiting & quota | `middleware/rateLimit.ts`, quota logic in ask routes |
| Worker (query side) | `jobs/digestDelivery.ts`, `embeddingRetry.ts` (if not owned by A) |

### Stage-by-stage work

#### Unblock yourself early (before Track A finishes ingestion)
- [ ] Write a `scripts/seed-chunks.ts` that inserts 50 known chunks with embeddings for a test org
- [ ] Use OpenAI directly in the seed script to generate real embeddings
- [ ] This lets you build and test Stages 13–15 without waiting for live Slack/Gmail sync

#### Stage 13 — Hybrid search
- [ ] `hybrid.ts`: semantic leg (pgvector cosine) + keyword leg (tsvector) + RRF fusion (k=60)
- [ ] Always filter `WHERE org_id = $1 AND deleted_at IS NULL`
- [ ] `rerank.ts`: Cohere `rerank-english-v3.0` → top 6 with calibrated scores
- [ ] Test against seeded chunks: relevant results rank above irrelevant ones

#### Stage 14 — Ask pipeline
- [ ] `rewrite.ts`: Gemini 1.5 Flash → `{ searchTerms, intent }`
- [ ] `answer.ts`: Gemini 1.5 Flash streaming with citation-only system prompt
- [ ] `pipeline.ts`: rewrite → embed → search → rerank → confidence check (0.55) → answer
- [ ] 25-second timeout → `status: timeout`
- [ ] `insufficient_evidence` when top score < 0.55 (no Gemini call)

#### Stage 15 — Ask API + SSE
- [ ] `POST /api/v1/ask` → validate, rate limit, quota check, persist query, dispatch pipeline, `202`
- [ ] `GET /api/v1/ask/:id/stream` → SSE events: `status`, `token`, `sources`, `done`, `error`
- [ ] `GET /api/v1/ask/:id` and `GET /api/v1/ask/history` (cursor pagination)
- [ ] `usage_counters` atomic increment; `429 QUOTA_EXCEEDED` when over limit
- [ ] `X-Request-Id` idempotency on `POST /ask`
- [ ] `middleware/rateLimit.ts`: 10 req/min per user (in-memory for dev)

#### Stage 17 — Digest system
- [ ] `summarizer.ts`: query last 24h chunks, Gemini summary (skip if zero chunks)
- [ ] `emailTemplate.ts`: simple HTML email
- [ ] `sender.ts`: Resend/SendGrid + `digest_deliveries` log
- [ ] `modules/digest/digestRouter.ts`: `GET/PATCH /api/v1/digest/settings` (admin/owner only)

#### Stage 16 (partial) — Worker: query jobs
- [ ] `digestDelivery.ts` — hourly, match org timezone + delivery_hour
- [ ] Coordinate `embeddingRetry.ts` ownership with Track A (recommend: lives in `modules/ingest/embedder.ts`, job file in `jobs/` — whoever finishes embedder owns the retry job)

### Track B exit checklist

- [ ] Hybrid search returns fused results scoped to `org_id`
- [ ] Full ask pipeline works against seeded chunks: question → streamed answer with citations
- [ ] `POST /ask` returns `202`; SSE streams tokens in real time
- [ ] Rate limit (`429 RATE_LIMITED`) and quota (`429 QUOTA_EXCEEDED`) enforced
- [ ] Digest job sends a test email for an org with recent chunks
- [ ] End-to-end with Track A's live data: connect Slack → sync → ask a question about synced content → get cited answer

### Track B does NOT touch

- `modules/integrations/connectors/`
- OAuth callbacks or token encryption
- `fetchDelta` / `normalize` logic
- `integrationSync` job

---

## Integration contracts (the handshake)

These are the only places where Track A and Track B must align. Agree on these during Phase 0.

### 1. Chunk row shape (from Stage 7 / [database.md](../backend/database.md))

Track B reads; Track A writes. Do not change columns without notifying the other person.

```typescript
// What search expects from every chunk row
type ChunkRow = {
  id: string
  org_id: string
  document_id: string
  content: string
  embedding: number[]          // 1536-dim vector
  search_vector: string        // generated tsvector column
  metadata: Record<string, unknown>
  embedding_status: 'pending' | 'completed' | 'failed'
  deleted_at: Date | null
}
```

### 2. Ingest pipeline entry point (Track A exports, Track B + Worker call)

```typescript
// modules/ingest/pipeline.ts
export async function processDocument(
  orgId: string,
  integrationId: string,
  doc: NormalizedDocument
): Promise<{ documentId: string; chunksCreated: number }>
```

Slack webhook and `integrationSync` both call this. Track B never imports connector code — only this function (for manual re-ingest if needed).

### 3. Search entry point (Track B exports, Ask pipeline calls)

```typescript
// modules/search/hybrid.ts
export async function hybridSearch(
  orgId: string,
  queryEmbedding: number[],
  searchTerms: string[],
  limit?: number
): Promise<Array<{ chunkId: string; rrfScore: number }>>

// modules/search/rerank.ts
export async function rerank(
  question: string,
  candidates: ChunkRow[],
  topN?: number
): Promise<Array<{ chunk: ChunkRow; relevanceScore: number }>>
```

### 4. Shared embedder (both tracks use)

Put `embedder.ts` in `modules/ingest/` (Track A owns the file). Track B imports it for query embedding in the ask pipeline. Interface:

```typescript
export async function embed(texts: string[]): Promise<number[][]>
```

### 5. Worker `ROLE` split in `index.ts`

Both tracks modify `index.ts` for worker startup. **Coordinate PRs** on this file:

| `ROLE` | Starts | Runs |
|--------|--------|------|
| `api` | Express HTTP server | No cron |
| `worker` | node-cron scheduler | All jobs from both tracks |

### 6. Environment variables

| Var | Track A adds | Track B adds |
|-----|-------------|-------------|
| `TOKEN_ENCRYPTION_KEY` | ✓ | |
| `OAUTH_STATE_SECRET` | ✓ | |
| `GOOGLE_CLIENT_*`, `SLACK_CLIENT_*` | ✓ | |
| `OPENAI_API_KEY` | ✓ (embeddings) | uses same |
| `GEMINI_API_KEY` | | ✓ |
| `COHERE_API_KEY` | | ✓ |
| `EMAIL_API_KEY`, `EMAIL_FROM` | | ✓ |

Add all new vars to `config/env.ts` — whoever adds a var owns the PR, other person rebases.

---

## Suggested timeline

```
Week 1 ─── Phase 0 (together): Stages 1–7
              │
Week 2 ───┬── Track A: Stages 8–9 (OAuth)
          └── Track B: seed script + Stage 13 (search against seeds)
              │
Week 3 ───┬── Track A: Stages 10–12 (ingest pipeline)
          └── Track B: Stages 14–15 (ask pipeline + API)
              │
Week 4 ───┬── Track A: Stage 16 ingest jobs + Slack webhook
          └── Track B: Stage 17 (digest) + Stage 16 digest job
              │
Week 5 ─── Integration testing together (full flow in [flow.md](../architecture/flow.md) §3 + §5)
```

Track B is never fully blocked: the seed script unlocks search and ask work while Track A builds connectors.

---

## Git workflow — avoid conflicts

### Branch naming

```
feat/ingest-pipeline          ← Track A
feat/oauth-slack-connect      ← Track A
feat/hybrid-search            ← Track B
feat/ask-sse-streaming        ← Track B
feat/shared-auth-middleware   ← Phase 0 (either)
```

### File ownership (soft rule)

| Shared — coordinate before merging | Track A | Track B |
|-----------------------------------|---------|---------|
| `app.ts`, `index.ts` | | |
| `config/env.ts` | | |
| `modules/**/<name>Repository.ts` | writes: `documents`, `chunks`, `integrations`, `oauth_states`, `sync_jobs` | writes: `queries`, `query_sources`, `digest_*`, `usage_counters` |
| | `modules/integrations/**` | `modules/search/**` |
| | `modules/ingest/**` | `modules/ask/**` |
| | `modules/integrations/integrationsRouter.ts` | `modules/ask/askRouter.ts` |
| | | `modules/digest/digestRouter.ts` |
| | `jobs/integrationSync.ts`, `tokenRefresh.ts`, … | `jobs/digestDelivery.ts` |

### Merge order

1. Phase 0 branches merge to `main` first
2. Track A merges ingest pipeline before Track B's final E2E test PR
3. Whoever touches `index.ts` last resolves route registration conflicts

### Daily sync (15 min)

- What stage are you on?
- Any schema or type changes?
- Is the integration contract still satisfied?
- Blockers?

---

## End-to-end validation (both together)

When both tracks are done, run this full flow from [flow.md](../architecture/flow.md):

1. Sign in via Clerk → `GET /me` returns user + org
2. Connect Slack → OAuth callback → integration `active`
3. Wait for `integrationSync` (or trigger manually) → chunks appear in DB
4. `POST /ask` with a question about synced content → `202`
5. Open SSE stream → tokens stream → `done` with citations linking to Slack messages
6. Set digest settings → `digestDelivery` sends email next matching hour
7. Post a Slack message → webhook ingests → ask about it → answer cites the new message

---

## Quick reference: stage → track mapping

| Stage | Topic | Track |
|-------|-------|-------|
| 1–4 | Foundation | **Together** |
| 5–6 | Auth & webhooks | **B** (during Phase 0) |
| 7 | Full schema & errors | **Together** |
| 8 | Encryption & OAuth state | **A** |
| 9 | OAuth connect/disconnect | **A** |
| 10 | Fetch & normalize | **A** |
| 11 | Chunking | **A** |
| 12 | Embed & persist | **A** |
| 13 | Hybrid search | **B** |
| 14 | Ask pipeline | **B** |
| 15 | Ask API + SSE | **B** |
| 16 | Worker jobs | **A** (sync) + **B** (digest) |
| 17 | Digest system | **B** |
| 18–20 | Frontend | Separate from this doc — see [buildingFlow.md](buildingFlow.md) |

---

## Related docs

- [buildingFlow.md](buildingFlow.md) — step-by-step implementation guide (all stages)
- [architecture/overview.md](../architecture/overview.md) — system diagram and subsystems
- [architecture/flow.md](../architecture/flow.md) — arrow-by-arrow flows
- [architecture/data-flow.md](../architecture/data-flow.md) — data movement detail
- [backend/database.md](../backend/database.md) — schema both tracks depend on
- [api/contract.md](../api/contract.md) — endpoint shapes Track B implements
- [contributing.md](contributing.md) — branch naming and PR process
