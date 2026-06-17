# Gmail Integration

OAuth 2.0 connector for Gmail. Ingests email threads as searchable documents.

## OAuth scopes

| Scope | Purpose |
|-------|---------|
| `https://www.googleapis.com/auth/gmail.readonly` | Read email messages |
| `openid`, `email`, `profile` | User identity |

Gmail shares the Google OAuth app with Google Drive. A single connect flow requests combined scopes if both are enabled.

## OAuth flow

```
GET /api/v1/integrations/gmail/connect
  → redirect to Google consent screen with gmail.readonly scope

GET /api/v1/integrations/google/callback?code=...
  → POST https://oauth2.googleapis.com/token
  → store access + refresh tokens (encrypted)
  → enqueue initial sync for gmail provider
```

Note: Google uses a unified callback URL (`/integrations/google/callback`). The `state` param encodes which provider(s) were requested.

## Data fetched

| Method | API | Content |
|--------|-----|---------|
| Initial sync | `users.messages.list` + `users.messages.get` | Last 90 days, max 5000 messages |
| Delta sync | `users.messages.list?q=after:YYYY/MM/DD` | Messages since last sync |
| History API | `users.history.list` | Incremental changes (preferred for delta) |

## Normalization

```javascript
{
  externalId: thread_id,
  sourceType: 'gmail_thread',
  title: subject,
  url: `https://mail.google.com/mail/u/0/#inbox/${thread_id}`,
  content: plain_text_body,   // HTML stripped, quoted replies collapsed
  metadata: {
    from, to, cc, subject, date, message_id, thread_id, label_ids
  }
}
```

Long email bodies are chunked at paragraph boundaries. Quoted reply chains (`> On ... wrote:`) are collapsed to reduce noise.

## Filters

Skipped by default:
- Spam and trash (`labelIds` contains `SPAM` or `TRASH`)
- Automated senders (noreply@, notifications@, mailer-daemon@)
- Messages under 20 characters (likely signatures/footers)

Configurable in Phase 2 via org settings.

## Token refresh

Google access tokens expire in 1 hour. The `tokenRefresh` job refreshes tokens 10 minutes before expiry. See [jobs.md](../../jobs.md).

## Rate limits

Gmail API: 250 quota units/user/second. `messages.get` = 5 units. Connector batches with exponential backoff on 429.

## Files (target)

```
modules/integrations/gmail.ts    Connector implementation
```

## Disconnect

`DELETE /api/v1/integrations/gmail`:
- Revoke token via Google revoke endpoint
- Set integration status → `disconnected`
- Soft-delete all gmail documents/chunks for the org
