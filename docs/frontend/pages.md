# Pages

All routes use React Router. Unauthenticated users are redirected to Clerk sign-in.

## Route map

| Route | Page | Auth | Description |
|-------|------|------|-------------|
| `/` | Home | Required | Main query interface |
| `/history` | History | Required | Past queries list |
| `/integrations` | Integrations | Required | Connect/manage integrations |
| `/settings/digest` | DigestSettings | Required (admin+) | Configure morning digest |
| `/sign-in/*` | SignIn | Public | Clerk hosted sign-in |
| `/sign-up/*` | SignUp | Public | Clerk hosted sign-up |

## `/` — Home

Primary interface. User types a question and receives an answer with sources.

**Layout:**
1. `QueryInput` at top
2. On submit → loading skeleton via `LoadingState`
3. On response → `AnswerCard` + `SourceChips`
4. If no integrations connected → `EmptyState` prompting to visit `/integrations`

**State:** Managed by `useAsk` hook. Clears previous answer on new submit.

## `/history` — History

Paginated list of past queries for the org.

**Layout:**
1. List of query cards (question, status, confidence, timestamp)
2. Click a query → expand to show full answer + sources (fetched via `GET /ask/:id`)
3. Cursor-based pagination ("Load more" button)

**Empty state:** "No questions yet. Ask your first question."

## `/integrations` — Integrations

Manage OAuth connections.

**Layout:**
1. Three `IntegrationCard` components (Slack, Gmail, Google Drive)
2. Connect button → redirects to `GET /api/v1/integrations/:provider/connect`
3. After OAuth callback → URL param `?connected=slack` shows success toast
4. Disconnect → confirmation modal → `DELETE /api/v1/integrations/:provider`
5. Manual sync button → `POST /api/v1/integrations/:provider/sync` with polling

**Permissions:** Connect/disconnect/sync visible only to `admin` and `owner` roles.

## `/settings/digest` — Digest Settings

Configure morning digest delivery. Admin/owner only.

**Layout:**
1. Toggle: enable/disable digest
2. Time picker: delivery hour (in org timezone)
3. Email recipients: editable list (add/remove emails)
4. Last sent timestamp

Saves via `PATCH /api/v1/digest/settings` on change (debounced 500 ms).

## `/sign-in/*` and `/sign-up/*`

Clerk-hosted authentication pages. No custom UI — Clerk `<SignIn />` and `<SignUp />` components.

After sign-in → redirect to `/`.
After sign-up → Clerk org creation flow → redirect to `/integrations` (connect first source).

## Route protection

```javascript
// App.jsx
<ClerkProvider publishableKey={...}>
  <SignedIn>
    <Routes>
      <Route path="/" element={<Home />} />
      ...
    </Routes>
  </SignedIn>
  <SignedOut>
    <RedirectToSignIn />
  </SignedOut>
</ClerkProvider>
```

Admin-only routes (`/settings/digest`) check `orgRole` from Clerk and redirect members to `/`.
