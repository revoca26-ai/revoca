# Background Jobs

All jobs run via `node-cron` inside the backend process (Phase 1). Each job is idempotent and logs start/finish to stdout (structured JSON in production).

## Job schedule

| Job | Schedule | Module | Description |
|-----|----------|--------|-------------|
| `integrationSync` | Every 15 min | ingest | Poll all active integrations for new/updated content |
| `digestDelivery` | Hourly (checks org timezone) | digest | Send morning digest to orgs whose delivery hour matches |
| `tokenRefresh` | Every 30 min | auth | Refresh expiring Google OAuth tokens |
| `embeddingRetry` | Every 60 min | ingest | Re-embed chunks with `embedding_status = failed` |
| `syncJobCleanup` | Daily 03:00 UTC | — | Delete sync_jobs older than 30 days |

Configure poll interval via `SYNC_INTERVAL_MINUTES` env var.

## integrationSync

```
For each integration WHERE status = 'active':
  1. Create sync_jobs row (status: running)
  2. Call connector.fetchDelta(sync_cursor)
  3. For each item → ingest pipeline
  4. Update sync_cursor + last_synced_at
  5. Mark sync_jobs completed (or failed with error_message)
  6. On 3 consecutive failures → set integration.status = 'error'
```

**Concurrency:** One sync per integration at a time (mutex via `sync_jobs WHERE status = 'running'`).

**Backoff:** Failed integrations skip the next cycle, then retry with 2× interval up to 60 min.

## digestDelivery

```
Every hour at :00:
  For each org WHERE digest_settings.enabled = true:
    If current hour in org.timezone == digest_settings.delivery_hour
    AND last_sent_at < today in org timezone:
      1. Fetch chunks ingested in last 24h
      2. Claude summarize → digest text
      3. Send email to digest_settings.email_recipients
      4. Insert digest_deliveries row
      5. Update last_sent_at
```

Skip orgs with zero new content (optional: send "quiet day" digest — disabled in Phase 1).

## tokenRefresh

```
For each integration WHERE provider IN ('gmail', 'gdrive')
  AND token_expires_at < now() + interval '10 minutes':
    1. Decrypt refresh_token
    2. POST to Google token endpoint
    3. Re-encrypt and store new access_token (+ refresh_token if rotated)
    4. On failure → integration.status = 'error'
```

Slack bot tokens are long-lived; no refresh needed unless revoked.

## embeddingRetry

```
SELECT chunks WHERE embedding_status = 'failed' AND deleted_at IS NULL LIMIT 100
For each → call OpenAI embed → update embedding + set status = 'ok'
```

## Error handling

- Jobs never crash the process. Uncaught errors are logged and the job continues to the next item.
- Critical failures (DB unreachable) log at `error` level and exit the process (Railway restarts).
- Job metrics (duration, items processed, failures) are logged as structured JSON for future observability integration.

## Phase 2 migration

When sync volume exceeds ~10k chunks/day:
- Move `integrationSync` to a dedicated Railway worker or queue (BullMQ + Redis).
- Keep `digestDelivery` and `tokenRefresh` on the main process or move to Railway cron triggers.
