# Contributing

## Git workflow

1. Branch from `main`
2. Make changes in focused commits
3. Open a PR against `main`
4. Squash merge after approval

## Branch naming

```
feat/ask-confidence-threshold
fix/slack-webhook-signature
docs/api-contract-update
chore/upgrade-dependencies
```

Format: `{type}/{short-description}` in kebab-case.

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`.

## Commit format

```
Short imperative summary (max 72 chars).

Optional body explaining why, not what.
```

Examples:
```
Add hybrid search with reciprocal rank fusion of semantic + keyword.

Pure semantic search missed exact entity names in early testing.
```

```
Fix Slack webhook signature verification for URL-encoded bodies.
```

Do not:
- Commit `.env` files, secrets, or `node_modules`
- Force push to `main`
- Skip pre-commit hooks

## Pull request process

1. **Title:** Same format as commit message
2. **Description:** What changed, why, how to test
3. **Size:** Prefer PRs under 400 lines. Split large features into stacked PRs.
4. **Review:** At least one approval required before merge
5. **CI:** Must pass lint before merge (tests required once test suite exists)

PR template:
```markdown
## Summary
- ...

## Test plan
- [ ] ...
```

## Code conventions

### Backend (TypeScript)

- ES modules (`import`/`export`)
- Async/await over raw promises
- All DB queries through repository functions co-located in their respective modular feature folder under `modules/<feature>/` (e.g. `modules/auth/authRepository.ts`)
- Every repository function takes `orgId` as first parameter
- Env vars accessed only through `config/env.ts` — never `process.env` in modules
- Errors thrown as typed error classes mapped to API error codes in `errorHandler.ts`

### Frontend (React + TypeScript)

- Functional components only
- Hooks for data fetching (`useAsk`, `useIntegrations`)
- API calls only through `src/api/client.ts`
- No inline styles — use CSS modules or global CSS classes

### Documentation

- Update relevant docs when changing API contracts, schema, or env vars
- Docs in `docs/` are the source of truth for architecture decisions

## Pre-commit checks

```bash
# Frontend
cd frontend && npm run lint

# Backend (once linter configured)
cd backend && npm run lint
```

## Adding a new integration

1. Create connector in `backend/modules/integrations/{provider}.ts`
2. Implement the `Connector` interface (see [ingest.md](../backend/modules/ingest.md))
3. Add OAuth env vars to `.env.example` and [environment.md](../backend/environment.md)
4. Add provider to `GET /integrations` response
5. Add `IntegrationCard` entry on frontend
6. Write docs in `docs/backend/modules/integrations/{provider}.md`
7. Update [contract.md](../api/contract.md) if new endpoints are added
