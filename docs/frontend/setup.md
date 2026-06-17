# Frontend Setup

React 19 + Vite SPA. Deployed to Vercel.

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
├── src/
│   ├── main.jsx               App entry, ClerkProvider
│   ├── App.jsx                Router setup
│   ├── api/
│   │   └── client.js          Authenticated fetch wrapper
│   ├── pages/
│   │   ├── Home.jsx           Query input + results
│   │   ├── History.jsx        Past queries
│   │   ├── Integrations.jsx   Connect/disconnect integrations
│   │   ├── DigestSettings.jsx Digest config
│   │   └── SignIn.jsx         Clerk sign-in redirect
│   ├── components/
│   │   ├── QueryInput.jsx     Question textarea + submit
│   │   ├── AnswerCard.jsx     Answer text + confidence badge
│   │   ├── SourceChips.jsx    Citation source links
│   │   ├── IntegrationCard.jsx Provider status + actions
│   │   ├── Navbar.jsx         Nav + user menu
│   │   └── LoadingState.jsx   Skeleton/spinner states
│   ├── hooks/
│   │   ├── useAsk.js          POST /ask with loading/error state
│   │   └── useIntegrations.js GET /integrations
│   └── styles/
│       └── global.css
├── vite.config.js
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

## Production env vars (Vercel)

| Variable | Value |
|----------|-------|
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_...` |
| `VITE_API_URL` | `https://api.revoca.app` |

See [deployment.md](../guides/deployment.md) for Vercel configuration.
