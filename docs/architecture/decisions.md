# Technical Decisions (ADR)

Architecture Decision Records for Revoca. Status: **Accepted** unless marked otherwise.

---

## ADR-001: PostgreSQL + pgvector over a dedicated vector DB

**Context:** Need hybrid semantic + keyword search with strong ACID guarantees and multi-tenant row isolation.

**Decision:** PostgreSQL 15 with pgvector extension. tsvector column on chunks for keyword leg.

**Alternatives rejected:** Pinecone (extra vendor, no relational joins), Elasticsearch (operational overhead for a small team).

**Consequences:** Single database to manage. Hybrid queries run in one transaction. Approximate nearest-neighbor search via an HNSW index on embeddings (see [ADR-011](#adr-011-hnsw-vector-index-over-ivfflat)).

---

## ADR-002: Hybrid search fusion via Reciprocal Rank Fusion (RRF)

**Status:** Accepted (supersedes the original 70/30 normalized-score weighting)

**Context:** Pure semantic search misses exact entity names (supplier names, ticket IDs). Pure keyword search misses paraphrased questions. The original design merged the two legs with `0.7 × semantic_norm + 0.3 × keyword_norm` using per-result-set min–max normalization.

**Problem with score normalization:** Min–max normalizing cosine similarity and `ts_rank` within each result set is unstable. The scores live on different, non-comparable scales, the normalization is skewed by a single outlier, and when all candidates score similarly it amplifies noise. The "right" weight is also dataset-dependent and brittle.

**Decision:** Merge the two legs with **Reciprocal Rank Fusion**: `score(d) = Σ_legs 1 / (k + rank_leg(d))`, `k = 60`. RRF uses *rank position*, not raw score, so it needs no normalization and no hand-tuned weights, and is robust across very different scorers. A small weight multiplier per leg (default 1.0 semantic / 1.0 keyword) remains available for Phase 2 tuning.

**Consequences:** Simpler, more stable retrieval. Weights become optional tuning knobs rather than load-bearing. Validated against the internal test set of 50 business questions.

---

## ADR-003: Chunk size 200–400 tokens, no mid-sentence splits

**Context:** Chunks must balance retrieval precision with enough context for Claude to reason.

**Decision:** Target 300 tokens; hard bounds 200–400. Split on sentence/paragraph/thread boundaries only.

**Consequences:** Slightly larger storage vs. fixed 256-token splits, but measurably better answer quality on threaded conversations.

---

## ADR-004: Model selection per pipeline stage

**Status:** Accepted (revised — replaces ada-002 embeddings and Claude-for-everything)

**Context:** Each ask runs up to three model stages (rewrite → rerank → answer) plus embeddings. Using the largest model for every stage was the original plan, but it serialized three model calls into a ~30 s budget and inflated per-query cost — which directly threatens unit economics at $20/100-queries pricing.

**Decision:** Pick the cheapest model that is good enough per stage:

| Stage | Model | Rationale |
|-------|-------|-----------|
| Embeddings | OpenAI `text-embedding-3-small` (1536-dim) | ~5× cheaper than `ada-002`, higher retrieval quality, same dimensionality (drop-in). |
| Query rewrite | Google Gemini 1.5 Flash | Cheap, extremely fast, high accuracy; rewrite is a light transformation, not deep reasoning. |
| Rerank | Cohere Rerank (`rerank-english-v3.0`) | Purpose-built cross-encoder; ~100 ms vs. multi-second LLM rerank; returns **calibrated** relevance scores that make the confidence threshold meaningful (see ADR-007). |
| Answer generation | Google Gemini 1.5 Flash (**streaming**) | Best reasoning for the user-facing answer under the budget constraints; streamed token-by-token (see ADR-012). |

**Alternatives rejected:** `ada-002` (legacy, costlier, weaker). LLM-based reranker (slow, uncalibrated scores broke the confidence threshold). Single-vendor embeddings. Anthropic Claude (deferred to Phase 2 to optimize price/performance ratio in early MVP stage).

**Consequences:** Three vendor keys (OpenAI, Google, Cohere). Embedding dimension fixed at 1536; changing it is a re-embed migration. Per-query LLM cost drops substantially and p95 latency improves.

---

## ADR-005: Clerk for authentication

**Context:** Small team; auth is not a differentiator. Need OAuth social login, org management, and JWT issuance quickly.

**Decision:** Clerk for frontend auth + backend JWT verification via JWKS.

**Alternatives rejected:** Roll-your-own JWT (security risk), Auth0 (cost at scale), Supabase Auth (couples to Supabase).

**Consequences:** `CLERK_SECRET_KEY` required. User records synced via webhook. No password storage in Revoca DB.

---

## ADR-006: Thin, swappable connector layer

**Context:** Third-party APIs change frequently. A Slack outage must not break Gmail ingestion.

**Decision:** Each integration implements a `Connector` interface: `fetchDelta()`, `normalize()`, `getOAuthConfig()`. Connectors are isolated modules with no cross-imports.

**Consequences:** New integrations are additive. Connector failures are per-integration, not system-wide.

---

## ADR-007: Confidence threshold with explicit "I don't know"

**Context:** Hallucinated answers destroy trust, especially for small businesses connecting email and Slack.

**Decision:** If the top reranker relevance score < `0.55` (`CONFIDENCE_THRESHOLD`), return status `insufficient_evidence` — never synthesize an answer.

**Why this depends on ADR-004:** The threshold is only meaningful if the reranker emits a **calibrated** [0,1] relevance score. The Cohere reranker does; a Claude-generated ranking does not (its "scores" are arbitrary). This is a primary reason rerank moved to Cohere.

**`confidence` is defined as the top source's reranker relevance score** (the max over returned sources), persisted on the query and echoed in the API.

**Consequences:** Some valid questions return no answer when data hasn't been ingested yet. UI copy explains "connect more sources" vs. "no evidence found." `insufficient_evidence` is a normal `200` outcome, never an HTTP error.

---

## ADR-008: Dedicated worker process for cron + ingestion (Phase 1)

**Status:** Accepted (revised — the original "node-cron inside the API process" is unsafe with replicas)

**Context:** MVP team size is 1–2 engineers; operational simplicity matters. But two facts break the naive "cron inside the Express process" plan:
1. The API runs **multiple replicas** for horizontal scale (see overview.md). If every replica runs node-cron, every scheduled job fires N times → duplicate syncs, duplicate provider API calls (rate-limit bans), and **N copies of every digest email**.
2. Ingestion is **CPU-bound** (tokenization, chunking). Running it in the same event loop as the API adds latency/jitter to live `POST /ask` requests.

**Decision:** Ship the same Docker container image deployed as two separate AWS ECS Fargate services, selected by a `ROLE` env var:
- `ROLE=api` — stateless HTTP, running as N tasks behind an ALB, runs **no** cron.
- `ROLE=worker` — a **single** task instance that runs node-cron and the ingestion pipeline.

As defense-in-depth (and to make a future move to multiple workers safe), each scheduled job acquires a PostgreSQL advisory lock (`pg_try_advisory_lock`) before running and skips if it can't — so a job never double-fires even if two workers briefly overlap during a deploy.

**Migration trigger (Phase 2):** Move ingestion to a real queue (BullMQ + Redis) and scale workers horizontally when sync volume exceeds ~10k chunks/day per org **or** worker CPU saturates.

**Consequences:** One extra always-on Fargate task in Phase 1 (cheap). No duplicate jobs, no event-loop contention on the API.

---

## ADR-009: Monorepo with a shared types package

**Status:** Accepted (revised — the codebase is now TypeScript end-to-end)

**Context:** Frontend and backend deploy separately but share env conventions, docs, and — critically — the API contract. Both are now TypeScript, so the original "no shared types in Phase 1" stance leaves money on the table: the contract can drift silently between server and client.

**Decision:** Root `package.json` orchestrates both via `concurrently`; separate deploy targets (Vercel / AWS ECS Fargate). Add a `packages/shared` workspace exporting **Zod schemas** for every request/response body. The backend validates inputs with these schemas at the edge; the frontend imports the inferred types for its API client. The contract docs remain human-readable, but the Zod schemas are the executable source of truth, and an OpenAPI document is generated from them (`zod-to-openapi`).

**Consequences:** Request validation, response typing, and the published contract all derive from one definition. A breaking field change fails the build instead of reaching production.

---

## ADR-010: REST API versioned at `/api/v1`

**Context:** Production API must support backward-compatible evolution.

**Decision:** All endpoints under `/api/v1`. Breaking changes require `/api/v2`. Unversioned `/health` and `/healthz` (liveness/readiness) sit outside the version prefix so infra probes never depend on an API version.

**Consequences:** Version header optional in Phase 1; required in client SDK (Phase 2).

---

## ADR-011: HNSW vector index over IVFFlat

**Context:** pgvector supports IVFFlat and HNSW. The original design used IVFFlat (`lists = 100`).

**Decision:** Use an **HNSW** index (`m = 16`, `ef_construction = 64`) with cosine ops, and tune `ef_search` at query time.

**Why:**
- IVFFlat must be *trained* on existing data; it performs poorly when a table is small or growing incrementally (exactly our early-tenant profile), and needs periodic `REINDEX` as data grows.
- HNSW gives better recall-vs-latency and handles incremental inserts gracefully.

**Multi-tenant recall caveat (important):** ANN indexes return the global top-N and *then* the planner applies `WHERE org_id = $1`. In a shared table with many orgs, a small org can get far fewer than 20 candidates back — or zero. Mitigations, in order: (1) raise `ef_search` (e.g. 100–200) so the candidate pool is large enough after filtering; (2) at scale, **partition `chunks` by `org_id`** (hash partitioning) so each tenant's vectors live in their own index; (3) for very large tenants, a per-org partial index. Phase 1 ships option 1 with monitoring; ADR revisited when any single table exceeds ~1M live chunks.

**Consequences:** The embedding index must exclude soft-deleted rows (see ADR added below / GC job) or it bloats with dead tuples and recall degrades.

---

## ADR-012: Asynchronous, streamed ask instead of a 30 s synchronous request

**Context:** The original `POST /ask` ran the full rewrite → search → rerank → answer pipeline inline and could hold the HTTP connection up to 30 s.

**Problems:** 30 s synchronous requests trip proxy/load-balancer idle timeouts, tie up a server connection per in-flight question (a handful of concurrent asks can starve a replica), give no progress feedback, and can't recover if the socket drops.

**Decision:** Make ask asynchronous and streamed:
1. `POST /api/v1/ask` validates, enforces rate limit + monthly quota, persists a `queries` row with `status = 'processing'`, hands the work to the pipeline, and returns **`202 { id, status: "processing" }`** immediately.
2. `GET /api/v1/ask/:id/stream` is a **Server-Sent Events** stream that emits `status` → `token`* (answer streamed as it generates) → `sources` → `done` (final object), or `error`. EventSource reconnects transparently.
3. `GET /api/v1/ask/:id` returns the final persisted result (history, reconnect, non-streaming clients).

**Consequences:** No long-held request sockets. Sub-2 s time-to-first-token UX. The pipeline's internal 30 s budget becomes a *processing* deadline that flips the row to `status = 'timeout'`, surfaced over the stream — not an HTTP 504 on a hanging request.

---

## ADR-013: Distributed rate limiting and per-org monthly quotas

**Context:** The API scales to multiple replicas, and pricing is sold as a **monthly query allowance per org** (Starter 100/mo, Pro 500/mo).

**Problems:** (1) In-process (in-memory) rate limiting is wrong the moment there's more than one replica — each replica counts independently, so real limits are N× the intended value. (2) Nothing in the original design enforced the *monthly* quota the business model is built on; only per-minute limits existed.

**Decision:**
- **Rate limiting** (per-minute burst control) uses a shared store: Redis (`REDIS_URL`) with a sliding-window counter. In single-replica dev, an in-memory fallback is allowed.
- **Monthly quota** is enforced transactionally in Postgres: a `usage_counters` row per `(org_id, period)` is incremented when a query is accepted; exceeding the plan allowance returns `QUOTA_EXCEEDED`. Current usage is exposed on `GET /me` so the UI can show "73 / 100 queries used."

**Consequences:** Limits hold under horizontal scale. Quota is a first-class, billable, observable concept rather than an afterthought.

---

## ADR-014: OAuth `state` is a signed, single-use CSRF token; connect returns a URL

**Context:** OAuth connect/callback runs in the browser. Two security/correctness problems existed in the original flow:
1. `GET /integrations/:provider/connect` was documented as a `302` redirect, but a top-level browser navigation **cannot carry the `Authorization: Bearer` header**, so the backend couldn't know which org/user initiated the connect.
2. The callback had no described CSRF protection or binding to the initiating org/user.

**Decision:**
- Connect is an **authenticated `POST /integrations/:provider/connect`** (normal `fetch`, Bearer header) that returns **`200 { authorizeUrl }`**; the frontend then sets `window.location = authorizeUrl`.
- The `state` parameter is a random, single-use nonce persisted in an `oauth_states` table bound to `{ org_id, user_id, provider, expires_at }` (10-minute TTL). The callback validates the nonce (exists, unexpired, unused), consumes it, and uses *its* `org_id`/`user_id` — never any client-supplied value.

**Consequences:** CSRF-safe, correctly attributed connections. One small table + a cleanup pass.

---

## ADR-015: Just-in-time user/org provisioning (don't depend solely on webhooks)

**Context:** Users and orgs are mirrored into Postgres via Clerk webhooks. Webhooks are asynchronous and can lag seconds behind the moment a freshly signed-up user makes their first API call.

**Problem:** If the backend hard-rejects any JWT whose `sub` isn't yet in the DB, brand-new users hit `401`/`404` on their first screen — a broken first impression on the most important flow.

**Decision:** On a verified JWT whose user/org isn't found locally, **provision the record just-in-time** from the JWT claims (and a Clerk API lookup if needed) inside a transaction, then proceed. Webhooks remain the path for *updates* and *deletes* and reconcile any drift.

**Consequences:** Signup → first query works regardless of webhook timing. Provisioning is idempotent (upsert on `clerk_user_id` / `clerk_org_id`).

---

## ADR-016: Feature-Modular Directory Structure and App/Entrypoint Separation

**Context:** The codebase needs to scale maintainably as new features are added. A global `routes/` directory splits HTTP handlers from the services and models they consume, making it harder to develop and refactor features self-contained. Additionally, keeping Express app configuration and socket listeners coupled in a single file makes integration testing difficult (causing port-conflict errors).

**Decision:**
1. Package routers directly inside their respective feature modules under `backend/modules/` (e.g., `modules/ask/askRouter.ts` instead of `routes/ask.ts`). The Express routes are mounted modularly.
2. Separate Express initialization from the server startup:
   - `backend/app.ts` configures standard Express middlewares, mounts all module routers, and exports `app` without starting a server listener.
   - `backend/index.ts` handles env validations, connects to the database pool, and starts the server via `app.listen()`.

**Consequences:** High cohesion inside each feature module (DDD pattern). Feature additions or deletions are self-contained. Port-isolated integration tests can be run safely against the exported `app` object using Supertest.
