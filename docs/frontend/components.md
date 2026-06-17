# Components

All components are functional React components written in **TypeScript**. Props are typed via interfaces; request/response types are imported from the shared package ([ADR-009](../architecture/decisions.md)) so component props stay in sync with the API contract. No PropTypes.

## Layout

### `Navbar`

Top navigation bar with org name, nav links, and Clerk `UserButton`.

| Prop | Type | Description |
|------|------|-------------|
| — | — | No props; reads auth state from Clerk |

Renders: logo, links (Ask, History, Integrations, Settings), Clerk user avatar menu.

---

## Query

### `QueryInput`

Natural-language question input with submit button.

| Prop | Type | Description |
|------|------|-------------|
| `onSubmit` | `(question: string) => void` | Called with trimmed question on submit |
| `isLoading` | `boolean` | Disables input and shows spinner on button |
| `placeholder` | `string` | Optional. Default: "Ask anything about your business..." |

Renders: auto-resizing textarea, submit button, character count (3–2000).

Validation: disables submit if question length < 3 or > 2000.

### `AnswerCard`

Displays the generated answer with confidence indicator.

| Prop | Type | Description |
|------|------|-------------|
| `answer` | `string \| null` | Generated answer text |
| `status` | `string` | `completed`, `insufficient_evidence`, `failed`, `timeout` |
| `confidence` | `number` | 0–1 rerank score |
| `message` | `string?` | Shown when status is `insufficient_evidence` |
| `suggestion` | `string?` | Actionable suggestion for insufficient evidence |

Renders: answer text with inline citation markers `[1]`, confidence badge (green > 0.7, yellow > 0.55, red below), insufficient-evidence callout.

### `SourceChips`

Clickable source citations below the answer.

| Prop | Type | Description |
|------|------|-------------|
| `sources` | `Source[]` | Array of source objects from API |
| `onSourceClick` | `(source: Source) => void?` | Optional analytics callback |

Each chip shows: citation number, source type icon (Slack/Gmail/Drive), title, snippet preview. Click opens source URL in new tab.

```typescript
type Source = {
  citationIndex: number;
  title: string;
  url: string;
  sourceType: 'slack_message' | 'gmail_thread' | 'gdrive_doc';
  snippet: string;
  relevanceScore: number;
};
```

---

## Integrations

### `IntegrationCard`

Status and actions for a single integration provider.

| Prop | Type | Description |
|------|------|-------------|
| `provider` | `string` | `slack`, `gmail`, `gdrive` |
| `integration` | `Integration \| null` | Null if not connected |
| `onConnect` | `() => void` | Triggers OAuth redirect |
| `onDisconnect` | `() => void` | Calls DELETE endpoint |
| `onSync` | `() => void` | Triggers manual sync |
| `isAdmin` | `boolean` | Shows connect/disconnect/sync buttons |

Renders: provider logo + name, status badge (`active`, `error`, `disconnected`), last synced time, document count, error message if status is `error`, action buttons.

Status badge colors: green (active), red (error), gray (disconnected/pending).

---

## Shared

### `LoadingState`

Skeleton loader for async content.

| Prop | Type | Description |
|------|------|-------------|
| `variant` | `string` | `answer`, `card`, `list` |
| `count` | `number?` | Number of skeleton items (for `list` variant) |

### `ErrorBanner`

Inline error display for API failures.

| Prop | Type | Description |
|------|------|-------------|
| `error` | `{ code: string, message: string }` | API error object |
| `onRetry` | `() => void?` | Optional retry callback |
| `onDismiss` | `() => void?` | Optional dismiss callback |

Handles: `RATE_LIMITED` (shows countdown), `AUTH_INVALID` (redirects to sign-in), generic errors.

### `EmptyState`

Placeholder when no data exists.

| Prop | Type | Description |
|------|------|-------------|
| `title` | `string` | Heading text |
| `description` | `string` | Subtext |
| `action` | `{ label: string, onClick: () => void }?` | Optional CTA button |

Used on: History (no queries yet), Integrations (none connected), Home (prompt to connect first).
