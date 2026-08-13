# Codebase Mastery Checklist

**Purpose:** A self-quiz to find out exactly which parts of the backend you truly own vs. which parts you'd be stuck explaining/debugging without AI. Work through it alone, closed-book (no AI, no re-reading the files first — that's the whole point). Then open the files and check yourself.

Rule for grading yourself: if you get an answer wrong or can't answer at all, that's not a failure — it's a flagged module. Circle it, then go read that file line-by-line until you *could* explain it to someone else. That's the actual fix, not feeling bad about the quiz.

---

## Exercise 1: Cold trace — GitHub OAuth connect flow

Without opening any files, write out the sequence of function calls, in order, that happens when a user clicks "Connect GitHub" in the frontend through to the integration becoming active. Try to name the actual functions and files.

<details>
<summary>Answer (check yourself after)</summary>

1. Frontend calls `POST /api/v1/integrations/github/connect` → `integrationsController.connectIntegration` (`backend/modules/integrations/integrationsController.ts`)
2. Controller calls `integrationsService.createIntegration(orgId, userId, 'github', redirectPath)` (`integrationsService.ts`)
3. `createIntegration` calls `getConnector('github')` to validate the provider, checks `findIntegrationByProvider` to reject duplicates, calls `createPendingIntegration` to insert a `status: 'pending'` row, then `createOauthState(...)` to generate a CSRF-safe state token stored server-side
4. Returns `connector.getAuthorizeUrl(oauthState)` → `getGitHubAuthUrl` (`connectors/github.ts`) builds the GitHub authorize URL with `client_id`, `redirect_uri`, required scopes (`repo`, `read:user`, `user:email`), and `state`
5. Frontend redirects the browser to GitHub; user approves; GitHub redirects to your callback URL with `?code=...&state=...`
6. `GET /api/v1/integrations/github/callback` → `integrationsController.githubCallback`
7. Callback calls `consumeOauthState(state)` (validates + deletes the state, gets back `org_id`/`redirect_path`), then `exchangeGitHubCode(code)` → POSTs to `https://github.com/login/oauth/access_token`, validates granted scopes match required scopes
8. Encrypts both tokens via `encryptOAuthToken` (AES-GCM, `utils/encryption.ts`)
9. Calls `activateIntegration(...)` to flip the row from `pending` → `active` and store the encrypted tokens + scopes + `external_account_id`
10. Redirects the browser back to the frontend with `?connected=github`

**Self-check questions:**
- Why is the OAuth `state` stored server-side instead of just trusting whatever GitHub sends back? _(CSRF protection — proves the callback correlates to a request you actually initiated)_
- What happens if GitHub returns a code but the granted scopes don't include `repo`? _(`exchangeGitHubCode` throws an `AppError(400, ...)` before tokens are ever stored)_
- Why encrypt tokens before storing them, and what would happen if the DB leaked? _(tokens at rest are ciphertext, not raw secrets — DB leak alone doesn't hand over live GitHub access)_

</details>

---

## Exercise 2: Cold trace — a Slack message becomes searchable

Trace what happens from a Slack message being posted to it landing in the `chunks` table with an embedding.

<details>
<summary>Answer</summary>

1. Slack sends an Events API POST to `/api/v1/webhooks/slack` → `webhooksController` verifies the Slack signature, then calls `webhooksService.handleSlackMessageEvent(event, externalAccountId)`
2. Service branches on `event.subtype`:
   - `message_changed` → pulls text/user/ts from `event.message` (edited messages nest the real content there), keeping the **original** `ts` so the update overwrites the right row
   - `message_deleted` → looks up `integrationId`/`orgId` via `getIntegrationIdAndOrgIdByExternalAccountIdForSlack`, calls `deleteDocument` directly, returns early — never reaches ingestion
   - anything else with a subtype (bot messages, channel joins) → logged and ignored
3. For a normal new message: builds a `RawDocument` (`id: ts`, `sourceType: 'slack_channel:<channelId>'`, etc.) and calls `ingestDocument(document)` (`modules/ingest/pipeline.ts`)
4. `ingestDocument` calls `chunkDocument` (`ingestionService.ts`) — splits text into ~250-word chunks with 50-word overlap; if the doc has no text, bails out early (no chunks stored at all)
5. Calls `embedChunks` — batches all chunks into a single OpenAI `text-embedding-3-small` call
6. Calls `storeChunks(doc, chunks, embeddings, true)` (`documentRepository.ts`) inside a DB transaction:
   - Hashes the content (`sha256`); if a document with the same `(org_id, integration_id, external_id)` already exists **and** the hash matches, commits and returns immediately (no-op)
   - If it exists with a different hash, hard-deletes the old chunks first (can't soft-delete due to the unique constraint on `chunk_index`), then upserts the document row and inserts fresh chunks with `embedding_status: 'completed'`
7. If `embedChunks` throws (e.g. OpenAI is down), `pipeline.ts` catches it and calls `storeChunks(doc, chunks, [], false)` instead — chunks get stored with `embedding_status: 'failed'` and no vector, so they exist but aren't searchable yet

**Self-check questions:**
- What happens to a message edit if you *didn't* preserve the original `ts`? _(You'd insert a duplicate document instead of updating the existing one — `external_id` wouldn't match.)_
- Where does the "handle message deletion" logic short-circuit, and why does it not go through `ingestDocument` at all? _(Right after the `message_deleted` subtype check — it soft-deletes directly since there's nothing to chunk/embed.)_
- If OpenAI's embedding call fails, is the message silently lost? _(No — it's stored with `embedding_status: 'failed'`, but nothing currently retries it. Is that a gap? Worth deciding if you want a retry job.)_

</details>

---

## Exercise 3: Explain the "why," not the "what"

Answer these from memory, out loud or in writing, in your own words — no peeking:

1. Why does `ingestDocument` chunk text into ~250 words with a 50-word overlap instead of embedding the whole document as one vector?
2. Why is there a `content_hash` check in `storeChunks` before re-inserting chunks?
3. Why does the sync cron job in `worker.ts` insert a row into `sync_jobs` *before* calling `connector.syncData`, and specifically rely on a Postgres unique-constraint violation (`code === '23505'`) to detect an overlapping run?
4. Why does GitHub's `refreshGithubToken` just return `null` unconditionally while Google's and Slack's presumably don't?
5. Why is `ROLE` a single env var that switches the whole app between "server" and "worker" mode instead of being two separate codebases?
6. In `systemDesign.md`'s own words: what specifically breaks the current architecture if traffic grows 100x, and what's the very first thing you'd change?

If you can't answer #6 without opening `systemDesign.md`, that's fine to check — but then close it and try to say it back in your own words. That's the actual interview-readiness test.

---

## Exercise 4: Break it, then fix it (hands-on, no AI)

Pick one, actually do it in a scratch branch:

- [ ] In `documentRepository.ts`, comment out the `content_hash` early-return check, run the sync worker twice in a row, and explain in your own words what breaks (duplicate chunks? errors? silent bloat?). Then revert and explain why the real code avoids it.
- [ ] In `worker.ts`, temporarily run two copies of the worker process locally against the same DB. Watch what happens to the token-refresh cron job (no unique-constraint protection there, unlike the sync job) vs. the sync job. This is the exact gap flagged in `deployment-roadmap.md` Phase 4 — see it fail with your own eyes before you fix it.
- [ ] Intentionally set `COHERE_API_KEY` to an invalid value and trace exactly where the failure surfaces (which file throws, what error shape, does the caller handle it gracefully or crash the process).

---

## Exercise 5: Modify it solo

Take one small real task and implement it **without AI assistance**, then compare against what you'd get if you asked AI for the same thing:

- [ ] Add the Postgres advisory lock to the token-refresh and chunk-cleanup cron jobs in `worker.ts` (the fix identified in `deployment-roadmap.md` Phase 4).
- [ ] Convert the two `console.log`/`console.error` cron jobs in `worker.ts` to use the `logger` (pino) consistently with the first job.
- [ ] Write 2-3 real unit tests for `chunkDocument` in `ingestionService.ts` — it's pure, deterministic, and has no dependencies, making it the easiest real function in the codebase to test from scratch.

If your solo version is 90% identical to an AI-assisted version, that's genuinely reassuring — it means you understand the pattern, you just use AI to type faster. If you can't start without AI, that's the specific gap to close.

---

## Exercise 6: The rubber-duck test

Explain the entire request lifecycle for one full feature (pick GitHub sync or Slack ingestion) to a non-technical friend, or literally to a rubber duck / empty room, in under 3 minutes, with no notes. If you stall out at a specific step, that step is your gap — not "the whole codebase."

---

## How to use this over time

- Don't try to do all 6 exercises in one sitting. Pick one module per session.
- Re-run Exercise 1 or 2 style traces on *new* modules as they get built (once ask/search is mounted, do the same cold-trace exercise on "user asks a question → gets an answer").
- The goal isn't 100% recall of every line — it's being able to reconstruct any flow from structure + a few minutes of thinking, and being able to debug it live without needing AI to re-explain your own system to you.
