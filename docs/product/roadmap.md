# Product Roadmap

## Phase 1 — Core Search Loop (MVP)

**Status:** In progress

**Goal:** Prove the core value — connect tools, ask questions, get cited answers.

| Feature | Status | Notes |
|---------|--------|-------|
| Clerk auth + org management | Planned | |
| OAuth: Google Drive | Planned | |
| OAuth: Gmail | Planned | |
| OAuth: Slack | Planned | |
| Ingestion pipeline (chunk + embed) | Planned | 200–400 token chunks, ada-002 |
| Hybrid search (70/30 semantic/keyword) | Planned | pgvector + tsvector |
| Ask endpoint with confidence threshold | Planned | "I don't know" fallback |
| Web UI (query + answer + sources) | Planned | |
| Integration management UI | Planned | |
| Nightly email digest | Planned | |
| Manual sync trigger | Planned | |

**Success criteria:**
- 5 beta users connect at least 2 integrations each
- 80% of test questions return relevant cited answers
- Digest delivered reliably for 7 consecutive days

**Pricing at launch:** $20/month (Starter), $50/month (Pro — higher query limits, 5 integrations)

---

## Phase 2 — Expanded Integrations & Onboarding

**Status:** Not started

**Goal:** Lower the barrier to value with more data sources and lightweight onboarding.

| Feature | Status | Notes |
|---------|--------|-------|
| WhatsApp Business integration | Planned | |
| Zoom / Google Meet transcript ingestion | Planned | |
| GitHub integration | Planned | Issues, PRs, READMEs |
| Notion integration | Planned | Pages and databases |
| CSV / file upload | Planned | Legacy data onboarding path |
| WhatsApp digest delivery | Planned | Same summary, second channel |
| Query history retention settings | Planned | Configurable per org |
| Cross-encoder reranker | Planned | Replace Claude reranker for latency |
| Dedicated sync worker | Planned | Move off in-process cron |
| OpenAPI spec + client SDK | Planned | |

**Success criteria:**
- 50 paying customers
- Average time-to-first-answer < 10 minutes after sign-up (via CSV upload)
- Sync worker handles 10k+ chunks/day without degradation

---

## Phase 3 — Scale & Monetization

**Status:** Not started

**Goal:** Team analytics, enterprise readiness, and usage-based billing.

| Feature | Status | Notes |
|---------|--------|-------|
| Team usage analytics dashboard | Planned | Queries/day, top topics, source breakdown |
| Admin console | Planned | Org management, member roles, audit log |
| SSO (SAML/OIDC) | Planned | Enterprise requirement |
| Usage-based billing | Planned | Stripe integration, overage pricing |
| API access for customers | Planned | Programmatic ask endpoint with API keys |
| Custom digest templates | Planned | User-defined summary format |
| Multi-language support | Planned | Non-English content ingestion + queries |
| SOC 2 Type I preparation | Planned | Security audit readiness |

**Success criteria:**
- 500 paying customers
- <$50 customer acquisition cost
- Monthly churn < 5%
