# Frontend Setup

React 19 + Vite SPA. Deployed to Vercel for MVP, migrating to AWS Amplify post-launch.

## Prerequisites

- Node.js 20 LTS
- Backend running locally (see [backend/setup.md](../backend/setup.md))
- Clerk application configured

## First-time setup

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_URL=http://localhost:3000
```

### Start dev server

```bash
npm run dev          # http://localhost:5173
```

Or from repo root: `npm run dev` (starts backend + frontend).

## Project structure (target)

```
frontend/
├── index.html
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── src/
│   ├── main.tsx               App entry, ClerkProvider
│   ├── App.tsx                Router setup
│   ├── api/
│   │   └── client.ts          Authenticated fetch wrapper
│   ├── pages/
│   │   ├── Home.tsx           Query input + results
│   │   ├── History.tsx        Past queries
│   │   ├── Integrations.tsx   Connect/disconnect integrations
│   │   ├── DigestSettings.tsx Digest config
│   │   └── SignIn.tsx         Clerk sign-in redirect
│   ├── components/
│   │   ├── QueryInput.tsx     Question textarea + submit
│   │   ├── AnswerCard.tsx     Answer text + confidence badge
│   │   ├── SourceChips.tsx    Citation source links
│   │   ├── IntegrationCard.tsx Provider status + actions
│   │   ├── Navbar.tsx         Nav + user menu
│   │   └── LoadingState.tsx   Skeleton/spinner states
│   ├── hooks/
│   │   ├── useAsk.ts          POST /ask with loading/error state
│   │   └── useIntegrations.ts GET /integrations
│   └── styles/
│       └── global.css
├── vite.config.ts
└── package.json
```

## Build

```bash
npm run build        # outputs to dist/
npm run preview      # preview production build locally
```

## Clerk setup

1. Create Clerk application at [dashboard.clerk.com](https://dashboard.clerk.com).
2. Enable Organizations (required for multi-tenant org model).
3. Add `http://localhost:5173` to allowed origins.
4. Copy publishable key to `VITE_CLERK_PUBLISHABLE_KEY`.

## Production env vars (Vercel / AWS Amplify)

| Variable | Value |
|----------|-------|
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_...` |
| `VITE_API_URL` | `https://api.revoca.app` |

See [deployment.md](../guides/deployment.md) for configuration details.
