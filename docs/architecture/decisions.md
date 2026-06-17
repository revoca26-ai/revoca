# Technical Decisions (ADR)

Architecture Decision Records for Revoca. Status: **Accepted** unless marked otherwise.

---

## ADR-001: PostgreSQL + pgvector over a dedicated vector DB

**Context:** Need hybrid semantic + keyword search with strong ACID guarantees and multi-tenant row isolation.

**Decision:** PostgreSQL 15 with pgvector extension. tsvector column on chunks for keyword leg.

**Alternatives rejected:** Pinecone (extra vendor, no relational joins), Elasticsearch (operational overhead for a small team).

**Consequences:** Single database to manage. Hybrid queries run in one transaction. IVFFlat index on embeddings for approximate nearest neighbor at scale.

---

## ADR-002: Hybrid search weighting 70/30 semantic/keyword

**Context:** Pure semantic search misses exact entity names (supplier names, ticket IDs). Pure keyword search misses paraphrased questions.

**Decision:** Combined score = `0.7 × semantic + 0.3 × keyword`, both normalized to [0, 1] before merge.

**Consequences:** Tunable per org in Phase 2. Initial weighting validated against internal test set of 50 business questions.

---

## ADR-003: Chunk size 200–400 tokens, no mid-sentence splits

**Context:** Chunks must balance retrieval precision with enough context for Claude to reason.

**Decision:** Target 300 tokens; hard bounds 200–400. Split on sentence/paragraph/thread boundaries only.

**Consequences:** Slightly larger storage vs. fixed 256-token splits, but measurably better answer quality on threaded conversations.

---

## ADR-004: Claude for answer generation; OpenAI for embeddings

**Context:** Need best-in-class reasoning for answers and a stable, cost-effective embedding model.

**Decision:** Anthropic Claude (Sonnet) for query rewrite + answer. OpenAI `text-embedding-ada-002` for vectors.

**Alternatives rejected:** Single-vendor (Anthropic embeddings less mature at time of decision). Self-hosted embeddings (ops burden).

**Consequences:** Two API keys, two rate-limit budgets. Embedding model locked to 1536 dimensions.

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

**Decision:** If top rerank score < 0.55, return `INSUFFICIENT_EVIDENCE` — never synthesize an answer.

**Consequences:** Some valid questions return no answer when data hasn't been ingested yet. UI copy explains "connect more sources" vs. "no evidence found."

---

## ADR-008: In-process cron (Phase 1)

**Context:** MVP team size is 1–2 engineers; operational simplicity matters.

**Decision:** node-cron inside the Express process for sync and digest jobs.

**Migration trigger (Phase 2):** Move to Railway cron or a dedicated worker when sync volume exceeds 10k chunks/day per org.

---

## ADR-009: Monorepo with npm workspaces pattern

**Context:** Frontend and backend deploy separately but share env conventions and docs.

**Decision:** Root `package.json` runs both via `concurrently`. Separate deploy targets (Vercel / Railway).

**Consequences:** No shared TypeScript types in Phase 1. API contract in docs is the source of truth until OpenAPI codegen in Phase 2.

---

## ADR-010: REST API versioned at `/api/v1`

**Context:** Production API must support backward-compatible evolution.

**Decision:** All endpoints under `/api/v1`. Breaking changes require `/api/v2`.

**Consequences:** Version header optional in Phase 1; required in client SDK (Phase 2).
