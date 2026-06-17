# Digest Module

Nightly summary of ingested content, delivered via email (Phase 1) and WhatsApp (Phase 2).

## Flow

```
digestScheduler (hourly cron)
  → for each org at delivery_hour:
      1. fetchRecentContent(orgId, 24h)
      2. summarize(orgId, chunks) → Claude
      3. renderEmail(summary) → HTML template
      4. sendEmail(recipients, html)
      5. log digest_deliveries
```

## Content selection

```sql
SELECT d.title, d.source_type, d.url, d.metadata, c.content
FROM chunks c
JOIN documents d ON d.id = c.document_id
WHERE c.org_id = $1
  AND c.created_at > now() - interval '24 hours'
  AND c.deleted_at IS NULL
ORDER BY d.metadata->>'date' DESC
LIMIT 200
```

If zero chunks → skip delivery (no empty digest emails).

## Summarization prompt

Claude receives all chunk summaries grouped by source type and produces:

- **Key decisions** — anything that looks like a decision or policy change
- **Active discussions** — notable Slack threads
- **New documents** — recently added/updated Drive files
- **Email highlights** — important threads (exclude newsletters/automated)

Output: structured markdown rendered into HTML email template.

## Email delivery

- Provider: Resend or SendGrid (via `EMAIL_API_KEY`)
- From: `EMAIL_FROM` (must have SPF/DKIM configured)
- Template: responsive HTML, plain-text fallback
- Unsubscribe link in footer (required for CAN-SPAM compliance)

## Settings

Managed via `PATCH /api/v1/digest/settings`:

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | Toggle digest on/off |
| `deliveryHour` | `6` | Hour in org timezone (0–23) |
| `emailRecipients` | `[org owner email]` | Array of recipient addresses |

## Files (target)

```
modules/digest/
├── digestService.ts       Orchestrator
├── fetchRecentContent.ts  24h chunk query
├── summarize.ts           Claude summarization
├── renderEmail.ts         HTML template
└── sendEmail.ts           Email provider client
```

## Phase 2: WhatsApp delivery

Same summary payload sent via WhatsApp Business API to configured phone numbers. Requires WhatsApp integration connector.
