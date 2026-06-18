# Revoca

AI-powered business knowledge search for small teams. Revoca connects Slack, Gmail, and Google Drive into a single indexed store and answers natural-language questions with cited sources.

**Target users:** Small businesses, student teams, and lean startups that need enterprise-grade knowledge search without enterprise pricing ($20–50/month vs. $20,000+/year).

## Problem

Business knowledge is fragmented across tools. Workers lose ~25% of their workday searching for information. New hires face an overwhelming onboarding crawl; existing staff spend hours jumping between Slack, Gmail, and Drive to reconstruct why a decision was made.

## Solution

Revoca ingests data from connected integrations, chunks and embeds it into PostgreSQL (pgvector), and serves hybrid semantic + keyword search. Claude answers questions exclusively from retrieved chunks — never the full database — with source citations. A nightly email digest summarizes the last 24 hours of activity.

## Monorepo layout

```
revoca/
├── backend/     Express API, ingestion pipeline, search, jobs
├── frontend/    React + Vite web app
└── docs/        Full technical and product documentation
```

## Quick start

**Prerequisites:** Node.js 20+, [Neon](https://neon.tech) project with pgvector, accounts for Clerk, Google Cloud, Slack, OpenAI, and Anthropic.

```bash
cp .env.example backend/.env   # fill in values — see docs/backend/environment.md
npm install
npm run dev                    # starts backend (:3000) and frontend (:5173)
```

Full setup: [docs/guides/onboarding.md](docs/guides/onboarding.md)

## Documentation

| Section | Entry point |
|---------|-------------|
| Architecture | [docs/architecture/overview.md](docs/architecture/overview.md) |
| API | [docs/api/contract.md](docs/api/contract.md) |
| Backend | [docs/backend/setup.md](docs/backend/setup.md) |
| Frontend | [docs/frontend/setup.md](docs/frontend/setup.md) |
| Deployment | [docs/guides/deployment.md](docs/guides/deployment.md) |
| Product roadmap | [docs/product/roadmap.md](docs/product/roadmap.md) |

## Phase 1 scope (MVP)

- Clerk authentication and org management
- OAuth integrations: Google Drive, Gmail, Slack
- Ingestion pipeline: parse → chunk (200–400 tokens) → embed (OpenAI) → store (pgvector + tsvector)
- Hybrid search (semantic + keyword, fused via Reciprocal Rank Fusion) with reranking
- Ask endpoint with confidence threshold and "I don't know" fallback
- Web UI: auth, integration management, query input, answer + source chips
- Nightly email digest

## Tech stack

| Layer | Choice |
|-------|--------|
| Backend | TypeScript, Node.js, Express (stateless API replicas + one worker) |
| Frontend | TypeScript, React 19, Vite |
| Database | [Neon](https://neon.tech) PostgreSQL + pgvector (HNSW) |
| Cache / limits | Redis (distributed rate limiting) |
| Auth | Clerk |
| Embeddings | OpenAI `text-embedding-3-small` |
| Rerank | Cohere `rerank-english-v3.0` |
| LLM | Anthropic Claude (Haiku rewrite, Sonnet answer, streamed) |
| Jobs | node-cron in the worker (advisory-locked) |
| Deploy | Railway (API + worker), Vercel (frontend) |

## License

Proprietary. All rights reserved.
