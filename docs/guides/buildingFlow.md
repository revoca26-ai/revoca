# Building Revoca — Step by Step

Each stage introduces **one new concept**, explains why it matters, tells you exactly what to build, and ends with a "You're done when…" checklist. Don't skip ahead — each stage assumes the previous one works.

> **Where you're starting from:** A barebones Express server with one `/health` endpoint and a default Vite + React app. No database, no auth, no real logic yet.

---

## Stage 1 — Environment Config & Project Structure

**What you'll learn:** How to validate env vars on startup and organize a backend project into folders.

Right now `backend/` is a single `index.ts`. Before writing any features, set up the folder structure your code will live in — and make the server crash immediately with a clear error if a required env var is missing. This saves hours of debugging later ("why is my DB not connecting?" → because `DATABASE_URL` was never set).

### What to build

- [ ] Create the folder structure inside `backend/`:
  ```
  backend/
  ├── config/
  │   └── env.ts           ← validate env vars here
  ├── middleware/           ← empty for now
  ├── modules/             ← empty for now
  ├── db/                  ← empty for now
  ├── jobs/                ← empty for now
  ├── .env.example         ← env template (copied from root)
  ├── .env                 ← local secrets (gitignored)
  ├── app.ts               ← Express app setup (cors, JSON parser, routes)
  └── index.ts             ← server entrypoint (validates env, starts DB, calls app.listen)
  ```
- [ ] Split your Express initialization to separate testing concerns (best practice):
  - In `backend/app.ts`, export the initialized `app` object with all middleware and routes attached (but **no** `app.listen()`). This allows unit/integration tests to query the app via Supertest without binding to actual network ports.
  - In `backend/index.ts`, run the env verification, import `app` and the DB connection pool, and start the server using `app.listen()`.
- [ ] In `config/env.ts`, export a function that reads `process.env` and returns a typed config object. If any required var is missing, `console.error` a clear message listing what's absent and call `process.exit(1)`. Start with just these vars for now:
  - `DATABASE_URL` (required)
  - `PORT` (optional, default `3000`)
  - `NODE_ENV` (optional, default `development`)
  - `FRONTEND_URL` (required)
- [ ] Import and call the env validation in `index.ts` before anything else
- [ ] Update the existing CORS setup in `app.ts` to use `FRONTEND_URL` from config instead of allowing everything
- [ ] Update `.env` in backend with your Neon `DATABASE_URL` and other secrets

### You're done when

- Starting the server **without** `DATABASE_URL` set crashes immediately with a message like: `Missing required env vars: DATABASE_URL`
- Starting with all vars set boots normally
- You understand why validating at startup (rather than wherever you first use the var) is important

---

## Stage 2 — PostgreSQL Connection

**What you'll learn:** How to connect to Postgres from Node, create a connection pool, and check DB health.

A "pool" is a set of reusable database connections. Instead of connecting to Postgres every time you want to run a query (slow), you keep a pool of connections open and borrow one when needed. Every production Node app uses this pattern.

### What to build

- [ ] Create a [Neon](https://neon.tech) project (always-on hosted Postgres — no local install needed)
- [ ] In Neon **SQL Editor**, enable extensions: `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS vector;`
- [ ] Copy the **pooled** connection string into `backend/.env` as `DATABASE_URL` (must include `?sslmode=require`)
- [ ] Create `backend/db/pool.ts`:
  - Import `pg` (the `Pool` class)
  - Create and export a pool using `DATABASE_URL` from your config
  - Export a helper function `query(text, params)` that calls `pool.query(text, params)` — this is what the rest of your code will use to talk to the DB
- [ ] Update `GET /health` to actually check DB connectivity:
  - Run `SELECT 1` through the pool
  - Return `{ status: "ok", db: "connected" }` if it works
  - Return `{ status: "degraded", db: "disconnected" }` with a `503` status code if it fails
- [ ] Add `GET /healthz` (liveness) — just return `{ status: "ok" }` with no DB check. This one tells infrastructure "the process is alive" even if the DB is temporarily down.

### You're done when

- `GET /health` returns `{ "status": "ok", "db": "connected" }` when `DATABASE_URL` points at Neon
- Setting an invalid `DATABASE_URL` and hitting `/health` returns `503` with `"db": "disconnected"`
- `/healthz` returns `200` regardless of DB state
- You understand the difference between liveness and readiness checks

---

## Stage 3 — Database Migrations

**What you'll learn:** How to manage database schema changes with migration files instead of running SQL by hand.

Migrations are numbered SQL files that run in order. Each one creates or modifies tables. You never edit a migration after applying it — you add a new one instead. This way, every developer (and every server) can reproduce the exact same database by running migrations from scratch.

### What to build

- [ ] Create `backend/migrations/` folder
- [ ] Write a migration runner (`backend/db/migrate.ts`):
  - Create a `_migrations` table to track which files have already been applied
  - Read all `.sql` files from `migrations/`, sorted by number
  - For each file not yet applied: run it inside a transaction, then record it in `_migrations`
  - Log each migration as it applies: `Applied 001_enable_extensions.sql`
- [ ] Add script to `package.json`: `"migrate": "tsx db/migrate.ts"`
- [ ] Write your first 4 migration files:
  - `001_enable_extensions.sql` — `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS vector;`
  - `002_create_organizations.sql` — the `organizations` table (see [database.md](../backend/database.md))
  - `003_create_users.sql` — the `users` table with `org_id` FK to organizations
  - `004_create_integrations.sql` — the `integrations` table
- [ ] Run `npm run migrate` and verify the tables exist

### You're done when

- `npm run migrate` on a fresh Neon database creates all 4 tables
- Running it again does nothing (already applied)
- You can reset schema via a new Neon branch (or `DROP` + re-migrate) and get the same result
- You understand why migrations exist instead of just running SQL by hand

---

## Stage 4 — Repository Pattern (Your First CRUD)

**What you'll learn:** How to wrap raw SQL queries in a clean "repository" layer, and why tenant isolation matters.

A repository is just a module that holds all the SQL for one table. Instead of writing `SELECT * FROM organizations WHERE ...` scattered across your routes, you write it once in `organizationsRepo.findById(orgId)`. This keeps your routes clean and makes tenant isolation easy to enforce — every function takes `orgId` as its first arg.

### What to build

- [ ] Create `backend/db/repositories/organizations.ts`:
  - `create(data)` → INSERT and return the new org
  - `findById(orgId)` → SELECT by id
  - `findByClerkId(clerkOrgId)` → SELECT by `clerk_org_id`
  - `update(orgId, data)` → UPDATE name, timezone, etc.
- [ ] Create `backend/db/repositories/users.ts`:
  - `create(orgId, data)` → INSERT with org_id
  - `findById(orgId, userId)` → SELECT with `WHERE org_id = $1 AND id = $2`
  - `findByClerkId(clerkUserId)` → SELECT by `clerk_user_id`
- [ ] Create `backend/db/repositories/integrations.ts`:
  - `create(orgId, data)` → INSERT
  - `findAllByOrg(orgId)` → SELECT all integrations for an org
  - `findByProvider(orgId, provider)` → SELECT specific provider
  - `updateStatus(orgId, integrationId, status)` → UPDATE status
- [ ] **Critical rule:** every function that touches a tenant-scoped table takes `orgId` as the first parameter and uses `WHERE org_id = $1`. No exceptions. This is how you prevent org A from ever seeing org B's data.
- [ ] Create a quick `GET /api/v1/integrations` route that returns `integrations.findAllByOrg(orgId)` — use a hardcoded org ID for now (real auth comes next stage). Wire it up in `index.ts`.

### You're done when

- You can manually INSERT an org and user via psql, then hit your API to see results
- Your repository functions always filter by `org_id`
- You understand why the repository pattern exists (centralize SQL, enforce isolation, keep routes clean)

---

## Stage 5 — Clerk Authentication Middleware

**What you'll learn:** How JWT authentication works — a token is sent with every request, the server verifies it, and extracts who the user is.

When a user logs into your frontend through Clerk, Clerk gives them a JWT (JSON Web Token). The frontend sends this token with every API request in the `Authorization: Bearer <token>` header. Your backend verifies the signature (using Clerk's public keys), extracts the user ID and org ID from the token, and attaches them to the request. This is how your API knows who's asking.

### What to build

- [ ] Install `@clerk/express` (or use `jsonwebtoken` + `jwks-rsa` to verify manually — both work, manual teaches you more)
- [ ] Add `CLERK_SECRET_KEY` and `CLERK_WEBHOOK_SECRET` to your env validation
- [ ] Create `backend/middleware/auth.ts`:
  - Extract the `Authorization: Bearer <token>` header
  - If missing → return `401` with `{ error: { code: "AUTH_REQUIRED", message: "Authentication required" } }`
  - Verify the JWT signature against Clerk's JWKS endpoint (cache the keys for 1 hour)
  - If invalid/expired → return `401` with `{ error: { code: "AUTH_INVALID", message: "Invalid or expired token" } }`
  - Extract `sub` (user ID), `org_id`, and `org_role` from the JWT payload
  - Look up the user in your DB by `clerk_user_id`
  - Attach `{ userId, orgId, role }` to `req.auth` (you'll need to extend the Express Request type)
- [ ] Create `backend/middleware/errorHandler.ts`:
  - Catch-all error handler that returns the standard envelope: `{ error: { code, message, details }, meta: { requestId } }`
  - In production, never expose stack traces
- [ ] Update your `GET /api/v1/integrations` route to use the auth middleware and get `orgId` from `req.auth` instead of hardcoding it
- [ ] Create `GET /api/v1/me` route — returns the authenticated user, their org, and usage placeholder

### You're done when

- Hitting `/api/v1/me` without a token returns `401 AUTH_REQUIRED`
- Hitting it with a valid Clerk JWT returns your user and org info
- Hitting it with an expired/fake token returns `401 AUTH_INVALID`
- You understand the JWT flow: Clerk issues → frontend sends → backend verifies → backend trusts the claims

---

## Stage 6 — JIT Provisioning & Clerk Webhooks

**What you'll learn:** How to handle the chicken-and-egg problem of a new user who exists in Clerk but not yet in your database, and how webhooks keep your DB in sync.

When someone signs up via Clerk, Clerk fires a webhook to tell your backend "hey, a new user was created." But webhooks are async — they can lag a few seconds. If the user's first API call arrives before the webhook, your auth middleware would reject them with a 404. JIT (just-in-time) provisioning fixes this: if the JWT is valid but the user isn't in your DB yet, create them on the spot.

### What to build

- [ ] Update your auth middleware to handle the "user not found" case:
  - If JWT is valid but user doesn't exist in DB → create the user record from the JWT claims (`sub`, `org_id`, `email` from token or Clerk API)
  - If the org doesn't exist either → create it too
  - Use `INSERT ... ON CONFLICT DO NOTHING` (upsert) so this is safe to call multiple times
  - Then proceed normally with the request
- [ ] Create `POST /api/v1/auth/webhook` route:
  - Mount this route with a **raw body parser** (`express.raw()`), not `express.json()` — because webhook signature verification needs the exact raw bytes
  - Verify the Svix signature using `CLERK_WEBHOOK_SECRET`
  - Handle event types: `user.created`, `user.updated`, `user.deleted`, `organization.created`, `organization.updated`
  - Sync the data into your `users` and `organizations` tables
- [ ] Make sure the webhook route does **not** require the auth middleware (it's server-to-server, not user-to-user)

### You're done when

- A brand-new Clerk user making their first API call gets provisioned automatically (no 404)
- Clerk webhooks successfully create/update user and org records in your DB
- Invalid webhook signatures are rejected
- You understand why raw body parsing is needed for signature verification

---

## Stage 7 — Remaining Migrations & Error Handling

**What you'll learn:** How to build out the full database schema and set up consistent error responses across your entire API.

Now that auth works, you need the rest of the tables before building features. You'll also standardize how errors look across every endpoint — consistent errors make the frontend much easier to build later.

### What to build

- [ ] Write the remaining migration files:
  - `005_create_documents_chunks.sql` — `documents` and `chunks` tables (with `vector(1536)` column, `tsvector` generated column, HNSW index)
  - `006_create_queries.sql` — `queries` and `query_sources` tables
  - `007_create_digest_sync_jobs.sql` — `sync_jobs`, `digest_settings`, `digest_deliveries`
  - `008_create_oauth_states.sql` — `oauth_states` table for CSRF protection
  - `009_create_usage_counters.sql` — `usage_counters` table for monthly quotas
  - `010_create_indexes.sql` — all remaining indexes (see [database.md](backend/database.md))
- [ ] Run `npm run migrate` — all tables should be created
- [ ] Create repositories for the new tables:
  - `chunks.ts`, `documents.ts`, `queries.ts`, `querySources.ts`, `syncJobs.ts`, `digestSettings.ts`, `oauthStates.ts`, `usageCounters.ts`
- [ ] Create a custom `AppError` class that carries `code`, `statusCode`, `message`, and `details`
- [ ] Update `errorHandler.ts` to catch `AppError` instances and return the right status code + envelope
- [ ] Create `backend/middleware/requireRole.ts` — a middleware factory: `requireRole('admin', 'owner')` returns a middleware that checks `req.auth.role` and returns `403 FORBIDDEN` if the user doesn't have the right role

### You're done when

- All tables from [database.md](../backend/database.md) exist in your Neon database
- Throwing `new AppError('VALIDATION_ERROR', 400, 'Question too short')` in any route handler produces a clean JSON error response
- `requireRole('admin')` blocks members from protected endpoints
- `npm run migrate` on a fresh DB creates everything cleanly

---

## Stage 8 — Token Encryption & OAuth State

**What you'll learn:** How to securely store third-party tokens (never store them in plain text!) and how OAuth CSRF protection works.

When a user connects their Slack or Google account, you receive access tokens. These tokens can read their emails and messages — so storing them as plain text in your DB is a security risk. You'll encrypt them with AES-256-GCM before storing, and decrypt only when you need to make an API call.

The OAuth `state` parameter prevents CSRF attacks: without it, an attacker could trick a user into connecting the attacker's account to the victim's org.

### What to build

- [ ] Add `TOKEN_ENCRYPTION_KEY`, `OAUTH_STATE_SECRET` to your env validation (format: `v1:<64-hex-chars>`)
- [ ] Create `backend/modules/integrations/encryption.ts`:
  - `encrypt(plaintext, keyId, key)` → returns a string like `v1:<iv>:<ciphertext>:<authTag>`
  - `decrypt(encrypted, keys)` → reads the key ID from the ciphertext, finds the right key, decrypts
  - Uses `crypto.createCipheriv('aes-256-gcm', ...)` from Node's built-in `crypto` module
  - Write a test: encrypt → decrypt → get the original string back
- [ ] Create `backend/modules/integrations/oauthState.ts`:
  - `createState(orgId, userId, provider)` → generate a random nonce, store in `oauth_states` with 10-min expiry, return the nonce
  - `consumeState(state)` → look up the nonce, reject if missing/expired/already consumed, mark as consumed, return `{ orgId, userId, provider }`
- [ ] Wire the oauthState cleanup job concept (we'll schedule it later — for now just write the `deleteExpired()` repository method)

### You're done when

- `encrypt("my-secret-token")` → `decrypt(result)` returns `"my-secret-token"`
- The encrypted string looks nothing like the original (and includes a key ID prefix)
- `createState()` → `consumeState()` works once; calling `consumeState()` again with the same nonce fails
- Expired nonces (>10 min old) are rejected
- You understand why tokens are encrypted at rest and why OAuth state prevents CSRF

---

## Stage 9 — OAuth Connect & Disconnect (Integrations)

**What you'll learn:** The full OAuth 2.0 flow — redirect the user to a third-party consent screen, receive a callback with a code, exchange it for tokens, and store them.

This is where users connect their Slack, Gmail, and Google Drive accounts. The flow: your frontend calls `POST /connect` → your backend creates an OAuth state nonce and returns the provider's consent URL → the frontend redirects the browser there → the user approves → the provider redirects back to your callback URL with a `code` → your backend exchanges the code for tokens → encrypts and stores them → redirects the user back to the frontend.

### What to build

- [ ] Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, `SLACK_REDIRECT_URI` to env validation
- [ ] Define a `Connector` interface (TypeScript interface — not a class):
  ```typescript
  interface Connector {
    getAuthorizeUrl(state: string): string;
    exchangeCode(code: string): Promise<TokenSet>;
    revokeToken?(token: string): Promise<void>;
  }
  ```
- [ ] Implement `backend/modules/integrations/connectors/google.ts`:
  - `getAuthorizeUrl(state)` → builds the Google OAuth URL with scopes for Gmail + Drive
  - `exchangeCode(code)` → POST to Google's token endpoint, return access + refresh tokens
- [ ] Implement `backend/modules/integrations/connectors/slack.ts`:
  - Same pattern for Slack OAuth V2
- [ ] Create `backend/modules/integrations/integrationsRouter.ts` with these endpoints:
  - `GET /api/v1/integrations` — list all integrations for the org (already started in Stage 4)
  - `POST /api/v1/integrations/:provider/connect` — auth required; create OAuth state, return `{ authorizeUrl }`
  - `GET /api/v1/integrations/google/callback` — no auth header (browser redirect); validate state, exchange code, encrypt tokens, store integration, redirect to `FRONTEND_URL/integrations?connected=gmail`
  - `GET /api/v1/integrations/slack/callback` — same for Slack
  - `DELETE /api/v1/integrations/:provider` — disconnect: mark `disconnecting`, return `202`
- [ ] Enforce: only one connection per provider per org (the DB unique index handles this, but return `409 ALREADY_CONNECTED` from the route)

### You're done when

- `POST /integrations/slack/connect` returns a URL that takes you to Slack's consent screen
- After approving, Slack redirects back to your callback, which stores encrypted tokens and redirects to the frontend
- `GET /integrations` shows the connected integration as `active`
- `DELETE /integrations/slack` returns `202` and marks it `disconnecting`
- Replaying the same OAuth state nonce returns `400 OAUTH_STATE_INVALID`
- You understand the full OAuth 2.0 authorization code flow

---

## Stage 10 — Ingestion: Fetching & Normalizing Content

**What you'll learn:** How to pull data from third-party APIs (Slack messages, Gmail emails, Google Drive docs) and normalize it into a common format.

Each provider returns data in a completely different format. Slack gives you JSON with blocks, Gmail gives you MIME-encoded emails, Google Drive gives you Docs/PDFs. You need a "normalize" step that turns all of them into a simple `{ title, content, metadata }` shape that the rest of your pipeline can work with.

### What to build

- [ ] Extend each connector with:
  - `fetchDelta(syncCursor)` → call the provider's API to get new/updated items since the last sync. Return raw items + an updated cursor.
    - **Slack:** `conversations.list` → `conversations.history` + `conversations.replies`
    - **Gmail:** `users.messages.list` with `q: after:...` → `users.messages.get` for full content
    - **Google Drive:** `changes.list` with `pageToken` → `files.get` / `files.export` for content
  - `normalize(rawItem)` → strip HTML, decode entities, extract plain text + metadata (author, channel/subject, timestamp, URL)
- [ ] Create a `NormalizedDocument` type in your shared types:
  ```typescript
  type NormalizedDocument = {
    externalId: string;
    sourceType: 'slack_message' | 'gmail_thread' | 'gdrive_doc';
    title: string;
    content: string;        // cleaned plain text
    url: string;            // deep link to original
    metadata: Record<string, unknown>;
    contentHash: string;    // SHA-256 of content (for change detection)
  };
  ```
- [ ] Write fixture-based tests: save a real Slack message JSON / Gmail response as a fixture file, run it through `normalize()`, assert the output shape is correct

### You're done when

- You can call `slackConnector.fetchDelta(null)` with a real Slack token and get back messages
- `normalize(rawSlackMessage)` returns a clean `NormalizedDocument` with no HTML, correct metadata
- Same for Gmail and Google Drive
- You understand the connector pattern: each provider is isolated, speaks the same interface

---

## Stage 11 — Ingestion: Chunking

**What you'll learn:** Why you can't just embed an entire document, and how to split text into search-friendly chunks.

LLM embedding models work best on short passages (200–400 tokens). If you embed a 5000-token email thread as one vector, the embedding becomes a blurry average of everything in it — searches won't find specific details. Chunking splits documents into focused pieces so each embedding represents one specific idea or conversation segment.

### What to build

- [ ] Create `backend/modules/ingest/chunker.ts`:
  - Input: a `NormalizedDocument`
  - Output: an array of `{ content, chunkIndex, tokenCount, metadata }` objects
  - Rules:
    - Target 300 tokens per chunk (hard bounds: 200–400)
    - Split on sentence or paragraph boundaries — **never mid-sentence**
    - Slack threads: one thread = one logical unit; split at reply boundaries for long threads
    - Gmail: one email body = base unit; split at paragraphs for long emails
    - Google Drive docs: split by heading or paragraph
  - Use a simple token counter (split on whitespace as an approximation, or use `tiktoken` for accuracy)
- [ ] Handle edge cases:
  - Content shorter than 200 tokens → one chunk (don't pad it)
  - Content exactly in range → one chunk
  - Very long content → multiple chunks, all within bounds
- [ ] Write tests with concrete examples:
  - A 100-token message → 1 chunk
  - A 500-token email → 2 chunks, each 200–300 tokens, split at a sentence boundary
  - A 1200-token doc → 3–4 chunks

### You're done when

- Chunker never produces a chunk smaller than 200 tokens (unless the source doc itself is shorter)
- Chunker never splits mid-sentence
- You can explain why chunking matters for search quality

---

## Stage 12 — Ingestion: Embedding & Persistence

**What you'll learn:** How to turn text into vectors (embeddings) using OpenAI, and how to store them alongside the text in Postgres.

An embedding is a list of 1536 numbers that represents the "meaning" of a text passage. Similar text → similar numbers → close together in vector space. This is what makes semantic search work — you embed the user's question and find chunks whose embeddings are closest.

### What to build

- [ ] Add `OPENAI_API_KEY` to env validation
- [ ] Create `backend/modules/ingest/embedder.ts`:
  - Takes an array of text strings
  - Calls OpenAI `text-embedding-3-small` (batches of up to 100)
  - Returns an array of 1536-dimensional vectors
  - On failure: don't crash — mark those chunks as `embedding_status = 'failed'` so they can be retried later
- [ ] Create `backend/modules/ingest/pipeline.ts` — the full orchestrator:
  1. Receive a `NormalizedDocument`
  2. Dedup: check if `(org_id, integration_id, external_id)` already exists with the same `content_hash` → skip if unchanged
  3. If content changed: soft-delete old chunks (`SET deleted_at = NOW()`)
  4. Upsert the document record
  5. Chunk the content
  6. Embed all chunks
  7. Persist chunks with their embeddings
- [ ] Create `backend/modules/ingest/dedup.ts`:
  - `hasChanged(orgId, integrationId, externalId, contentHash)` → check if the document exists and if the hash differs
- [ ] Test the full pipeline with a fixture: raw normalized doc → document + chunks in DB with embeddings

### You're done when

- A normalized document goes through the pipeline and creates a `documents` row + multiple `chunks` rows with valid `embedding` vectors
- Running the same document again (same content hash) does nothing (dedup works)
- Running with changed content soft-deletes old chunks and creates new ones
- A failed OpenAI call marks chunks as `embedding_status = 'failed'` instead of crashing
- You understand: text → embedding → vector column → ready for search

---

## Stage 13 — Hybrid Search

**What you'll learn:** How to combine semantic search (meaning-based) with keyword search (exact-match) to get the best of both worlds.

Semantic search finds "we terminated the Acme contract" when you ask "why did we stop using Acme?" — it understands meaning. But it might miss exact names or ticket numbers. Keyword search finds those exact matches. You'll combine both using Reciprocal Rank Fusion (RRF): a simple formula that merges two ranked lists by position, not by score.

### What to build

- [ ] Create `backend/modules/search/hybrid.ts`:
  - **Semantic leg:** query pgvector with `embedding <=> $queryEmbedding` (cosine distance), return top 20
    - Set `hnsw.ef_search = 150` for good recall after org filtering
  - **Keyword leg:** query tsvector with `plainto_tsquery('english', $searchTerms)`, rank by `ts_rank`, return top 20
  - **RRF fusion:** for each chunk that appears in either list:
    ```
    score = sum of (1 / (60 + rank_in_that_list))
    ```
    A chunk ranked #1 in both lists gets: `1/61 + 1/61 = 0.0328`. A chunk ranked #1 in one and #10 in the other gets: `1/61 + 1/70 = 0.0307`. Higher score wins.
  - Return top 20 fused results (chunk IDs + RRF scores)
  - **Always filter by `org_id`** — a search must never return another org's data
- [ ] Create `backend/modules/search/rerank.ts`:
  - Add `COHERE_API_KEY` to env validation
  - Take the 20 candidates + the original question
  - Call Cohere `rerank-english-v3.0`
  - Return the top 6 with their calibrated relevance scores (0–1)
- [ ] Write a test: seed the DB with 50 known chunks for a test org, run a hybrid search, verify that relevant chunks rank higher than irrelevant ones

### You're done when

- A hybrid search returns results that combine both meaning-based and keyword-based matches
- RRF fusion works: a chunk that appears in both legs ranks higher than one in only one leg
- Reranking narrows 20 candidates to 6 with calibrated scores
- Search never returns chunks from a different org
- You understand RRF: it uses rank position, not raw scores, so you don't need to normalize anything

---

## Stage 14 — The Ask Pipeline (Query → Answer)

**What you'll learn:** How to chain multiple AI calls together into a pipeline, stream the answer back to the user, and handle the "I don't know" case.

This is the core of Revoca. A user asks a question → Gemini 1.5 Flash rewrites it into better search terms → you embed and search → Cohere reranks → if confidence is high enough, Gemini 1.5 Flash generates an answer from the top chunks → the answer streams back token by token.

### What to build

- [ ] Add `GEMINI_API_KEY` to env validation
- [ ] Create `backend/modules/ask/rewrite.ts`:
  - Send the user's question to Gemini 1.5 Flash with a prompt like: "Rewrite this question into search terms and identify the intent"
  - Return `{ searchTerms: string[], intent: string }`
- [ ] Create `backend/modules/ask/answer.ts`:
  - Send the top 6 chunks + the user's question to Gemini 1.5 Flash
  - System prompt: "Answer ONLY based on the provided sources. Cite sources as [1], [2], etc. If the sources don't contain the answer, say so."
  - **Stream** the response (use Google Gemini's streaming API)
  - Return a stream of tokens + the final answer text
- [ ] Create `backend/modules/ask/pipeline.ts` — orchestrates the full flow:
  1. Gemini 1.5 Flash rewrites the question
  2. Embed the rewritten search terms (same embedder from Stage 12)
  3. Hybrid search (Stage 13)
  4. Cohere reranks to top 6
  5. **Confidence check:** if the top relevance score < `0.55` → stop here, return `status: insufficient_evidence` (no Gemini call, no answer generated)
  6. Gemini 1.5 Flash streams the answer from the 6 chunks
  7. Return everything: answer, sources, confidence, latency
- [ ] Add a 25-second timeout — if the pipeline takes longer, return `status: timeout`
- [ ] Test: mock the LLM calls, run the pipeline, verify the flow and the confidence threshold behavior

### You're done when

- The full pipeline runs: question → rewrite → search → rerank → answer
- Low-confidence queries (top score < 0.55) return `insufficient_evidence` without calling Sonnet
- The answer includes inline citations `[1]`, `[2]` matching the sources
- A slow pipeline (>25s) returns `timeout`
- You understand the pipeline pattern: each step feeds into the next, and you can short-circuit early

---

## Stage 15 — The Ask API (Routes + SSE Streaming)

**What you'll learn:** How to make an endpoint asynchronous (accept → process in background → stream results) using Server-Sent Events.

A normal REST endpoint processes the request and returns the result. But the ask pipeline takes 3–10 seconds. You don't want to hold the HTTP connection open that long — proxies might time out, and the user gets no feedback. Instead: `POST /ask` returns immediately with an ID, and the client opens a separate SSE stream to receive the answer as it generates.

### What to build

- [ ] Create `backend/modules/ask/askRouter.ts`:
  - `POST /api/v1/ask` — validates question (3–2000 chars), checks rate limit, checks monthly quota, persists a `queries` row with `status: processing`, kicks off the pipeline in the background, returns `202 { id, status: "processing" }`
  - `GET /api/v1/ask/:id/stream` — SSE endpoint:
    - Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
    - Emit events as the pipeline progresses:
      - `event: status` → `{ status: "processing" }`
      - `event: token` → `{ text: "partial answer text..." }` (one per token)
      - `event: sources` → `{ sources: [...] }`
      - `event: done` → full Query object
      - `event: error` → `{ code: "QUERY_TIMEOUT", message: "..." }`
  - `GET /api/v1/ask/:id` — retrieve a finished query (for history / reconnect)
  - `GET /api/v1/ask/history` — cursor-paginated list of past queries for the org
- [ ] Implement monthly quota using `usage_counters`:
  - On `POST /ask`: atomically increment `usage_counters` for the org's current billing period
  - If count exceeds plan limit → return `429 QUOTA_EXCEEDED` with `{ usage: { used, limit, period } }`
  - Only `completed` queries count against the quota
- [ ] Support `X-Request-Id` header as idempotency key — resubmitting the same request returns the existing query instead of creating a duplicate
- [ ] Create `backend/middleware/rateLimit.ts`:
  - In-memory sliding window for dev (good enough for single process)
  - `POST /ask`: 10 req/min per user
  - Return `429 RATE_LIMITED` with `Retry-After` header

### You're done when

- `POST /ask` returns `202` within milliseconds
- Opening the SSE stream shows tokens appearing in real time
- The final `done` event contains the complete answer with sources
- Sending 11 questions in 1 minute returns `429 RATE_LIMITED`
- Exceeding the monthly quota returns `429 QUOTA_EXCEEDED`
- You understand SSE: it's like a one-way WebSocket — the server pushes events to the client

---

## Stage 16 — Worker Process & Background Jobs

**What you'll learn:** How to run scheduled tasks (cron jobs) in a separate process so they don't interfere with your API, and how advisory locks prevent duplicate execution.

Your API should only handle HTTP requests. Scheduled tasks (syncing integrations every 15 min, sending digest emails, retrying failed embeddings) run in a separate Worker process. Same codebase, different entrypoint — selected by a `ROLE` env var.

### What to build

- [ ] Refactor `backend/index.ts`:
  - Read `ROLE` from env (default: `api`)
  - If `ROLE=api`: start Express server (current behavior), run **no** cron
  - If `ROLE=worker`: start `node-cron` scheduler, run **no** HTTP server
- [ ] Install `node-cron`
- [ ] Create `backend/jobs/advisoryLock.ts`:
  - `withAdvisoryLock(jobName, fn)` → acquires `pg_try_advisory_lock(hashtext('job:' + jobName))`, runs `fn` if acquired, releases in `finally`
  - If lock is already held (another worker instance during deploy) → skip the run, log it
- [ ] Create these scheduled jobs in `backend/jobs/`:
  - `integrationSync.ts` — every 15 min: find active integrations, run `fetchDelta()` + ingest pipeline for each
  - `tokenRefresh.ts` — every 30 min: refresh Google tokens expiring within 10 min
  - `embeddingRetry.ts` — every 5 min: re-embed chunks with `embedding_status = 'failed'`
  - `purgeDeleted.ts` — daily 03:30 UTC: hard-delete soft-deleted docs/chunks older than 7 days
  - `syncJobCleanup.ts` — daily 03:00 UTC: delete sync_jobs older than 30 days
  - `oauthStateCleanup.ts` — hourly: delete expired/consumed oauth_states
- [ ] Each job wraps itself in `withAdvisoryLock()` before doing work
- [ ] Integration sync: track failures per integration; 3 consecutive → set `status = 'error'`
- [ ] Add `"dev:worker": "ROLE=worker tsx watch index.ts"` to `package.json`

### You're done when

- `ROLE=api npm run dev` starts the HTTP server with no cron
- `ROLE=worker npm run dev` starts the cron scheduler with no HTTP
- Integration sync pulls new content from connected integrations and ingests it
- Advisory locks prevent duplicate execution (test: start two workers, only one runs the job)
- Failed embeddings are retried automatically
- You understand why cron lives in a separate process (no duplicate jobs across replicas, no CPU contention)

---

## Stage 17 — Digest System

**What you'll learn:** How to generate AI summaries of recent activity and deliver them as formatted emails.

The morning digest is a daily email summarizing what happened across the user's connected tools in the last 24 hours. It reuses your existing Gemini integration and adds email delivery.

### What to build

- [ ] Add `EMAIL_API_KEY`, `EMAIL_FROM` to env validation
- [ ] Create `backend/modules/digest/summarizer.ts`:
  - Query chunks ingested in the last 24h for the org
  - If zero chunks → skip this org (no empty digests)
  - Send chunks to Gemini with a prompt: "Summarize the key activity from these business communications. Group by: decisions made, blockers raised, new documents, notable threads."
  - Return the structured summary
- [ ] Create `backend/modules/digest/emailTemplate.ts`:
  - Build an HTML email from the summary (keep it simple and clean — a styled `<div>` with sections, not a complex template)
  - Include: org name, date, summary sections, link to Revoca web app
- [ ] Create `backend/modules/digest/sender.ts`:
  - Send via Resend or SendGrid API
  - Log a `digest_deliveries` row (status: sent/failed)
- [ ] Create `backend/modules/digest/digestRouter.ts`:
  - `GET /api/v1/digest/settings` — read settings for the org
  - `PATCH /api/v1/digest/settings` — update (admin/owner only): `enabled`, `deliveryHour` (0–23), `emailRecipients` (valid emails, max 10)
- [ ] Wire the `digestDelivery` job in the Worker (Stage 16):
  - Runs hourly at :00
  - For each org: check if current hour in org's timezone matches their `delivery_hour`
  - If yes and not already sent today → summarize + send
  - Update `last_sent_at`

### You're done when

- The digest job finds recent content, summarizes it with Gemini, and sends an email
- Orgs with no new content are skipped
- `PATCH /digest/settings` saves changes; only admins/owners can update
- You receive a real test digest email

---

## Stage 18 — Frontend: Auth, Layout & Integrations Page

**What you'll learn:** How to integrate Clerk on the frontend, set up routing, and build the OAuth connect UI.

Time to make it real for the user. You'll set up the React app with Clerk authentication, create the page layout, and build the Integrations page — the first thing a new user needs to do (connect their tools).

### What to build

- [ ] Install: `@clerk/clerk-react`, `react-router-dom`
- [ ] Set up `frontend/.env.local` with `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_API_URL`
- [ ] Update `main.tsx`: wrap app in `ClerkProvider`
- [ ] Update `App.tsx`:
  - React Router with routes: `/`, `/history`, `/integrations`, `/settings/digest`, `/sign-in/*`, `/sign-up/*`
  - `SignedIn` → show routes; `SignedOut` → redirect to `/sign-in`
- [ ] Create `src/api/client.ts`:
  - Authenticated fetch wrapper that uses Clerk's `getToken()` to attach the Bearer header
  - Error handling: throw `ApiError` on non-OK responses
- [ ] Create `src/components/Navbar.tsx` — logo, nav links (Ask, History, Integrations), Clerk `UserButton`
- [ ] Create `src/pages/Integrations.tsx`:
  - Three `IntegrationCard` components (Slack, Gmail, Google Drive)
  - Connect button → `POST /integrations/:provider/connect` → `window.location = authorizeUrl`
  - Detect `?connected=slack` URL param → show success toast
  - Disconnect button → confirmation → `DELETE /integrations/:provider`
  - Show status, last synced, document count for each connected integration
- [ ] Create `src/hooks/useIntegrations.ts` — fetches `GET /integrations`, exposes `connect()` and `disconnect()` functions
- [ ] Style the layout and cards (clean, modern — use your design tokens in `global.css`)

### You're done when

- The app redirects to Clerk sign-in when not authenticated
- After sign-in, you see the Integrations page
- Clicking "Connect Slack" takes you through the OAuth flow and back
- Connected integrations show as `active` with their info
- You can disconnect an integration
- The app looks good — not a plain white page with default styling

---

## Stage 19 — Frontend: Home Page (Ask + Streamed Answers)

**What you'll learn:** How to consume Server-Sent Events in React to show a streaming AI answer.

This is the main screen — where users type a question and watch the answer appear word by word, like ChatGPT. You'll use the browser's `EventSource` API (or a fetch-based reader) to listen for `token` events from your SSE endpoint.

### What to build

- [ ] Create `src/hooks/useAsk.ts`:
  - `submitQuestion(question)` → `POST /ask` → get `id`
  - Open SSE stream to `/ask/:id/stream`
  - Accumulate `token` events into the answer string
  - Capture `sources` event
  - Handle `done` event (close stream)
  - Handle `error` event (show error, close stream)
  - Expose state: `{ answer, sources, status, confidence, isLoading, error }`
- [ ] Create `src/components/QueryInput.tsx`:
  - Auto-resizing textarea
  - Character count (3–2000)
  - Submit button (disabled while loading or invalid length)
- [ ] Create `src/components/AnswerCard.tsx`:
  - Shows the answer text with inline citations `[1]`, `[2]`
  - Confidence badge: green (> 0.7), yellow (> 0.55), red (below)
  - `insufficient_evidence` state: show message + suggestion to connect more sources
- [ ] Create `src/components/SourceChips.tsx`:
  - One chip per source: citation number, source type icon (Slack/Gmail/Drive), title, snippet
  - Click opens the source URL in a new tab
- [ ] Create `src/components/LoadingState.tsx` — skeleton animation while waiting for first token
- [ ] Create `src/pages/Home.tsx` — assemble: `QueryInput` → `LoadingState` → `AnswerCard` + `SourceChips`
- [ ] Handle empty state: if no integrations connected, show a CTA to visit `/integrations`
- [ ] Handle quota exceeded: show upgrade prompt instead of the input

### You're done when

- Type a question → answer appears word by word in real time
- Citations show as clickable chips below the answer
- "I don't know" case shows a friendly message, not an error
- Loading state shows a skeleton while processing
- You understand SSE: `EventSource` opens a persistent connection; the server pushes named events; the client listens

---

## Stage 20 — Frontend: History, Digest Settings, Slack Webhook & Ship

**What you'll learn:** How to put the finishing touches on a full-stack app, set up real-time Slack ingestion, and deploy to production.

This is the final stage. Build the remaining pages, wire up the Slack Events webhook for real-time message ingestion, and deploy everything.

### What to build

- [ ] Create `src/pages/History.tsx`:
  - Fetch `GET /ask/history` with cursor pagination ("Load more" button)
  - List of query cards (question, status, confidence, timestamp)
  - Click a card → fetch `GET /ask/:id` → expand to show full answer + sources
- [ ] Create `src/pages/DigestSettings.tsx`:
  - Toggle: enable/disable digest
  - Time picker: delivery hour
  - Email recipients: editable list (add/remove)
  - Auto-save on change (debounced 500ms)
  - Admin/owner only — redirect members to `/`
- [ ] Create `src/hooks/useUser.ts` — fetches `GET /me`, exposes user/org/usage
- [ ] Show monthly usage in the Navbar or on Home: "73 / 100 queries used"
- [ ] Add webhook endpoints to `backend/modules/integrations/integrationsRouter.ts` (or a dedicated webhook handler inside the integration module):
  - `POST /api/v1/webhooks/slack` — Slack Events API
  - Raw body parser (for signature verification)
  - Verify `X-Slack-Signature` + `X-Slack-Request-Timestamp`
  - Handle `url_verification` challenge event (Slack sends this when you register the webhook URL)
  - On `message` events: look up integration by workspace ID → run ingest pipeline
- [ ] Create `PATCH /api/v1/organization` route — update org name/timezone (admin/owner)
- [ ] Final polish:
  - Error boundaries on all pages
  - Loading states everywhere
  - Responsive layout (works on mobile)
  - Clean typography and spacing
- [ ] **Deploy:**
  - **AWS Amplify:** deploy frontend with `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_API_URL`
  - **AWS ECS Fargate:** create backend service (`ROLE=api` tasks behind ALB) + worker service (`ROLE=worker` single task)
  - **AWS RDS PostgreSQL:** production database (or Neon)
  - **AWS ElastiCache for Redis:** rate limiting cache (or Upstash)
  - Set up custom domains via Route 53
  - Update OAuth redirect URIs for production
  - Run the post-deploy checklist from [deployment.md](deployment.md)
- [ ] Set up uptime monitoring on `/health`

### You're done when

- History page shows past queries with pagination and expandable answers
- Digest settings save correctly; digest email arrives next morning
- Slack webhook receives real-time messages and ingests them
- App is deployed and accessible at your production URL
- The full flow works in production: sign up → connect Slack → ask a question → get a cited answer
- 🎉 **Phase 1 MVP is complete**

---

## Overview

| Stage | What You Build | What You Learn |
|-------|---------------|----------------|
| 1 | Env config & folder structure | Startup validation, project organization |
| 2 | PostgreSQL connection & health | Connection pools, health checks |
| 3 | Migration files & runner | Schema versioning, transactions |
| 4 | Repository layer (CRUD) | Repository pattern, tenant isolation |
| 5 | Clerk JWT auth middleware | JWT verification, auth flow |
| 6 | JIT provisioning & webhooks | Webhook handling, edge case resilience |
| 7 | Remaining DB + error handling | Full schema, consistent error responses |
| 8 | Token encryption & OAuth state | Crypto, CSRF protection |
| 9 | OAuth connect/disconnect | Full OAuth 2.0 flow |
| 10 | Fetching & normalizing content | Third-party APIs, data normalization |
| 11 | Chunking | Text splitting for search quality |
| 12 | Embedding & persistence | Vector embeddings, dedup |
| 13 | Hybrid search | Semantic + keyword search, RRF fusion |
| 14 | Ask pipeline | Multi-model AI pipeline, confidence thresholds |
| 15 | Ask API + SSE streaming | Async endpoints, Server-Sent Events |
| 16 | Worker process & cron jobs | Background processing, advisory locks |
| 17 | Digest system | AI summarization, email delivery |
| 18 | Frontend: auth + integrations | Clerk React, OAuth UI |
| 19 | Frontend: ask + streaming | SSE in React, streaming UX |
| 20 | History, settings, deploy | Finishing touches, production deployment |
