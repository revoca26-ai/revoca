# Backend Infrastructure Roadmap — CI/CD, Docker, AWS

**Owner:** Maazin (infra/deployment track)
**Not owned here:** `/api/v1/ask` and `/api/v1/search` routes — co-founder's track. Don't touch `modules/ask/` or `modules/search/` route wiring; only touch them if adding a health/smoke-test hook once they're mounted.

**Goal:** Take the backend from "runs on my machine" to "auto-tested, containerized, and deployed on AWS" without breaking the app currently in active development.

---

## Phase 0 — Foundation Fixes (do this first, ~half a day)

These are cheap fixes that remove landmines before automating anything on top of them.

- [ ] **Fix `.env.example` drift.** `backend/config/config.ts` requires 12 vars (`PORT`, `DATABASE_URL`, `NODE_ENV`, `FRONTEND_URL`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `ENCRYPTION_KEY`, `OPENAI_API_KEY`, `COHERE_API_KEY`, `ROLE`, `SLACK_WEBHOOK_SIGNING_SECRET`, `GEMINI_API_KEY`) plus optional OAuth vars. `backend/.env.example` currently only lists 5 and still has the wrong key name (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` instead of `CLERK_PUBLISHABLE_KEY`). Rewrite it to match `config.ts` exactly.
- [ ] **Confirm `ROLE` values.** Code checks for `ROLE=worker` vs everything else being treated as server (`index.ts`). Docs (`docs/guides/deployment.md`) reference `ROLE=api`. Pick one convention (`server` / `worker` matches the code — cheaper to fix docs than code) and make it consistent everywhere: code, `.env.example`, docs, and later the ECS task definitions.
- [ ] **Standardize worker logging.** In `backend/worker.ts`, the first cron job uses the `pino` `logger`, the other two (`refreshToken` job, `deleteChunks` job) use raw `console.log`/`console.error`. Convert all three to `logger` so CloudWatch log parsing works consistently once deployed.
- [ ] **Add `lint` and `typecheck` scripts** to `backend/package.json` (`tsc --noEmit` for typecheck; add ESLint config + `eslint .` for lint — there currently is none for backend, only frontend has one).
- [ ] **Add a minimal `test` script.** Don't boil the ocean — use Node's built-in test runner (`node --test`) or Vitest. Start with 3-4 smoke tests: config loads without throwing given a valid fake env, `/health` and `/healthz` respond, one connector's data-normalization function produces expected shape. This is what CI will run — it doesn't need to be exhaustive on day one.

**Definition of done:** fresh clone → `cp .env.example .env` (fill real secrets) → `npm install` → `npm run lint && npm run build && npm test` all pass with zero surprises.

---

## Phase 1 — Containerization (~half a day)

- [ ] **Write `backend/Dockerfile`** (multi-stage):
  - Stage 1 (`builder`): `node:20-alpine`, `npm ci`, `npm run build` (produces `dist/`).
  - Stage 2 (`runner`): `node:20-alpine`, copy `dist/` + `node_modules` (production only) + `migrations/`, run as non-root user, `CMD ["node", "dist/index.js"]`.
  - Same image serves both API and worker — behavior is controlled entirely by the `ROLE` env var at container runtime, per `systemDesign.md`.
- [ ] **Add `backend/.dockerignore`** (`node_modules`, `dist`, `.env`, `*.md`, `scripts/`).
- [ ] **Add root `docker-compose.yml`** for local dev: Postgres image with `pgvector` extension pre-installed (e.g. `pgvector/pgvector:pg16`), backend API service, backend worker service, all wired to the same `.env`. This also becomes the DB service CI uses for integration tests.
- [ ] **Verify locally**: `docker compose up`, confirm `/health` returns DB-connected `ok`, confirm the worker container logs cron ticks without crashing on missing tables (run `npm run migrate` against the compose DB first).

**Definition of done:** `docker compose up` gives you a fully working stack (API + worker + DB) with zero manual host setup beyond Docker itself.

---

## Phase 2 — CI (GitHub Actions) (~half a day)

- [ ] **`/.github/workflows/ci.yml`** — triggered on PRs and pushes to `main`:
  1. Checkout, setup Node 20, `npm ci` (root + backend if not a single workspace).
  2. `npm run lint` (backend).
  3. `npm run build` (typecheck via `tsc`).
  4. Spin up Postgres+pgvector service container, run `npm run migrate`, run `npm test`.
  5. Build the Docker image (`docker build`) to catch Dockerfile breakage early — don't push yet.
- [ ] **`/.github/workflows/deploy.yml`** — triggered on merge to `main` only:
  1. Run the same checks as CI (or depend on the CI workflow succeeding).
  2. Build and tag the Docker image with the git SHA, push to ECR.
  3. Run migrations against the target environment DB (careful: this needs network access to RDS — see Phase 3 for VPC/bastion considerations).
  4. Trigger an ECS service update (`aws ecs update-service --force-new-deployment` initially; move to proper CD later).
- [ ] **Branch protection**: require the CI workflow to pass before merging PRs on GitHub.

**Definition of done:** every PR shows automated pass/fail checks; merging to `main` results in a new image in ECR without manual steps.

---

## Phase 3 — AWS Infrastructure (~2-3 days, the big one)

Recommend **AWS CDK (TypeScript)** for IaC since the team is already TS-native — avoids context-switching to HCL for Terraform, and keeps infra code in the same repo/language.

- [ ] **Decide DB hosting**: keep Neon (already pgvector-ready, cheaper, less to manage) for longer, or migrate to RDS Postgres now. Recommendation: **stay on Neon until you have a real reason to move** (compliance, VPC-only access requirement, cost at scale) — don't do this migration just because docs say "RDS eventually."
- [ ] **ECR repository** for the backend image.
- [ ] **Secrets**: put all required env vars into AWS Secrets Manager or SSM Parameter Store (one secret per var or one JSON blob) — never bake `.env` into the image or commit it to the task definition in plaintext.
- [ ] **ECS Cluster (Fargate)** with two services from the same image/task-definition family, differing only in the `ROLE` env var override:
  - `revoca-api` service: `ROLE=server`, behind an **Application Load Balancer**, target group health check hitting `/healthz`, desired count 1-2.
  - `revoca-worker` service: `ROLE=worker`, no load balancer, **desired count must stay at 1** until the cron-locking issue in Phase 4 below is fixed (otherwise sync/token-refresh/cleanup jobs will double-run).
- [ ] **Networking**: VPC with public subnets for the ALB, private subnets for the Fargate tasks; NAT gateway if tasks need outbound internet (they will, for OpenAI/Cohere/Slack/GitHub/Google APIs).
- [ ] **DNS + TLS**: Route 53 record for the API subdomain (e.g. `api.revoca.yourdomain.com`), ACM certificate attached to the ALB listener.
- [ ] **CloudWatch**: log group per service, basic alarms (unhealthy target count, 5xx rate, task restart count).
- [ ] **Frontend stays on Vercel** for now per existing docs — no reason to move it to Amplify yet.

**Definition of done:** hitting `https://api.<yourdomain>/health` from the public internet returns a healthy DB-connected response, and pushing to `main` results in a live deploy within a few minutes.

---

## Phase 4 — Worker Reliability (before running >1 worker task, ~1 day)

Currently `worker.ts` has three `node-cron` jobs in-process. Only the sync job has overlap protection (via a Postgres unique-constraint trick on `sync_jobs`). The other two (token refresh, chunk cleanup) have none.

- [ ] Add a **Postgres advisory lock** (`pg_try_advisory_lock`) around each of the three cron jobs so that if you ever scale the worker service beyond 1 task, only one instance executes a given job per tick.
- [ ] Alternative/complementary: move scheduled jobs off in-process `node-cron` entirely and onto **EventBridge Scheduler → ECS RunTask** (one-shot tasks per schedule, no long-running worker container needed at all for cron-only workloads). Worth evaluating once ask/search adds real background workload beyond cron — for now in-process cron + advisory locks is fine and cheaper to build.

---

## Phase 5 — Observability & Hardening (ongoing, pick up opportunistically)

- [ ] Error tracking (Sentry or similar) wired into both the API and worker processes.
- [ ] Rate limiting middleware on public API routes (nothing exists today).
- [ ] DB pool size tuning for Fargate — current pool max is 10 (`backend/db/pool.ts`); revisit once you know concurrent task count.
- [ ] Structured request logging (method/path/status/latency) via pino middleware on `app.ts`.

---

## Phase 6 — Deferred / Post-MVP (per `systemDesign.md` Phase 2-3)

Do **not** start these until real usage justifies the added complexity:

- [ ] Redis + BullMQ to decouple the Slack webhook handler (currently synchronous ingest on webhook receipt — a real timeout risk under load, but not urgent pre-launch).
- [ ] Redis caching for repeated search/rerank queries.
- [ ] RDS read replicas, Kafka, Kubernetes — explicitly Phase 3 material in the existing system design doc; skip until traffic actually demands it.

---

## Coordination note

Once the co-founder mounts `/api/v1/ask` and `/api/v1/search` in `app.ts`, add one smoke test per route to the Phase 0 test suite and one path-based health check consideration to the ALB target group if these routes get their own latency/timeout profile (LLM calls can be slow — may need a longer ALB idle timeout than the default 60s).
