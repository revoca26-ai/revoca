# Slack Integration

OAuth 2.0 connector for Slack workspaces. Ingests channel messages and thread replies.

## OAuth scopes (Phase 1)

| Scope | Purpose |
|-------|---------|
| `channels:history` | Read public channel messages |
| `groups:history` | Read private channel messages (if invited) |
| `channels:read` | List channels |
| `users:read` | Resolve user display names |
| `team:read` | Workspace metadata |

Bot token scopes requested during OAuth install.

## OAuth flow

```
GET /api/v1/integrations/slack/connect
  → redirect to https://slack.com/oauth/v2/authorize?client_id=...&scope=...&redirect_uri=...

GET /api/v1/integrations/slack/callback?code=...
  → POST https://slack.com/api/oauth.v2.access
  → store bot token (encrypted) + team_id
  → enqueue initial full sync
  → redirect to FRONTEND_URL/settings/integrations?connected=slack
```

## Data fetched

| Method | API | Content |
|--------|-----|---------|
| Initial sync | `conversations.list` + `conversations.history` | Last 90 days of messages per channel |
| Delta sync | `conversations.history` with `oldest` cursor | Messages since last sync |
| Real-time | Events API webhook | `message` events (new + edited) |

## Events API webhook

```
POST /api/v1/webhooks/slack
Header: X-Slack-Signature
```

Verified with `SLACK_SIGNING_SECRET`. Handles:
- `message` — ingest new/edited messages
- `url_verification` — Slack challenge handshake

## Normalization

```javascript
{
  externalId: `${channel_id}:${ts}`,
  sourceType: 'slack_message',
  title: `#${channel_name} — ${user_name}`,
  url: `https://${workspace}.slack.com/archives/${channel_id}/p${ts}`,
  content: message.text,
  metadata: {
    channel_id, channel_name, user_id, user_name,
    thread_ts, ts, is_thread_reply: !!thread_ts
  }
}
```

Thread replies include `thread_ts` for chunk boundary grouping.

## Rate limits

Slack Tier 3: ~50 requests/minute. Connector implements token-bucket rate limiter. Large initial syncs paginate with 1 s delay between pages.

## Error handling

| Error | Action |
|-------|--------|
| `token_revoked` | Set integration status → `error`, notify admin |
| `channel_not_found` | Skip channel, log warning |
| Rate limit (429) | Respect `Retry-After` header |

## Files (target)

```
modules/integrations/slack.ts    Connector implementation
routes/webhooks/slack.ts         Events API handler
```

## Disconnect

`DELETE /api/v1/integrations/slack`:
- Revoke token via `auth.revoke` API
- Set integration status → `disconnected`
- Soft-delete all documents/chunks from this integration
