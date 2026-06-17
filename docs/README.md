# Revoca Documentation

Technical and product documentation for the Revoca monorepo. Start here, then drill into the section you need.

## How to use this folder

| If you want to… | Start here |
|-----------------|------------|
| Understand the system end-to-end | [architecture/overview.md](architecture/overview.md) |
| Trace a query from UI to answer | [architecture/data-flow.md](architecture/data-flow.md) |
| Run the project locally | [guides/onboarding.md](guides/onboarding.md) |
| Call or implement an API endpoint | [api/contract.md](api/contract.md) |
| Add a new integration | [backend/modules/integrations/](backend/modules/integrations/) |
| Deploy to production | [guides/deployment.md](guides/deployment.md) |
| Understand product direction | [product/roadmap.md](product/roadmap.md) |

## Structure

```
docs/
├── architecture/     System design, data flow, technical ADRs
├── backend/          API server, modules, database, jobs, env vars
├── frontend/         React app, pages, components, API client
├── api/              REST contract, errors, authentication
├── guides/           Contributing, testing, deployment, onboarding
└── product/          Roadmap and product decisions
```

## Conventions

- All API paths are prefixed with `/api/v1`.
- Timestamps are ISO 8601 UTC (`2026-06-16T14:30:00Z`).
- IDs are UUID v4 unless noted otherwise.
- Docs describe the **target production architecture**. If code lags the docs, the docs win — implement to match.
