# Background Jobs

All jobs run via `node-cron` inside the **Worker process** (`ROLE=worker`), never on API replicas ([ADR-008](../architecture/decisions.md)). Each job is idempotent and logs start/finish as structured JSON.

## Why not in the API process

The API scales to N replicas. If cron ran there, every job would fire N times — N duplicate syncs (provider rate-limit bans) and **N copies of every digest email**. Ingestion is also CPU-bound and would add latency to live `POST /ask` requests. The single Worker process solves both.

## Leader-election safety net

Even with one Worker, deploys briefly overlap old and new instances. So every scheduled job first acquires a PostgreSQL advisory lock and skips the run if it can't:

```sql
SELECT pg_try_advisory_lock( hashtext('job:integrationSync') );
-- run only if true; pg_advisory_unlock(...) in finally
```

This makes jobs safe to run on multiple workers in Phase 2 without code changes.

## Job schedule

| Job | Schedule | Module | Description |
|-----|----------|--------|-------------|
| `integrationSync` | Every 15 min | ingest | Poll all active integrations for new/updated content |
| `digestDelivery` | Hourly (checks org timezone) | digest | Send morning digest to orgs whose delivery hour matches |
| `tokenRefresh` | Every 30 min | auth | Refresh expiring Google OAuth tokens |
| `embeddingRetry` | Every 5 min | ingest | Re-embed chunks with `embedding_status = failed` |
| `purgeDeleted` | Daily 03:30 UTC | ingest | Hard-delete soft-deleted documents/chunks past grace period |
| `syncJobCleanup` | Daily 03:00 UTC | — | Delete sync_jobs older than 30 days |
| `oauthStateCleanup` | Hourly | auth | Delete expired/consumed `oauth_states` rows |

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
SELECT chunks WHERE embedding_status = 'failed' AND deleted_at IS NULL
  ORDER BY created_at LIMIT 500
Batch (100/call) → call OpenAI embed → update embedding + set status = 'ok'
```

Runs every 5 min (not hourly) so a transient OpenAI outage that fails thousands of chunks recovers in minutes, not hours. Per-chunk attempts are capped with exponential backoff to avoid hot-looping a persistent failure.

## purgeDeleted

```
Hard-delete documents + chunks where deleted_at < now() - interval '7 days'
```

Soft deletes (from disconnects and content updates) are removed after a 7-day grace window. This keeps the partial HNSW/GIN indexes and the table from accumulating dead rows that degrade vector recall and bloat storage ([ADR-011](../architecture/decisions.md)). Deletes run in bounded batches to avoid long locks.

## Error handling

- Jobs never crash the process. Uncaught errors are logged and the job continues to the next item.
- Critical failures (DB unreachable) log at `error` level and exit the process (Railway restarts).
- Job metrics (duration, items processed, failures) are logged as structured JSON for future observability integration.

## Phase 2 migration

When sync volume exceeds ~10k chunks/day per org **or** the single Worker saturates CPU:
- Move `integrationSync`/ingestion onto a BullMQ + Redis queue with multiple Worker replicas (the advisory-lock pattern already makes this safe).
- Keep lightweight schedulers (`digestDelivery`, `tokenRefresh`, cleanup jobs) on the Worker or move to Railway cron triggers.
