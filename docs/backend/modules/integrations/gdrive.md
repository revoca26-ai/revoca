# Google Drive Integration

OAuth 2.0 connector for Google Drive. Ingests Docs, Sheets (as text), and PDFs.

## OAuth scopes

| Scope | Purpose |
|-------|---------|
| `https://www.googleapis.com/auth/drive.readonly` | Read files and metadata |
| `openid`, `email`, `profile` | User identity |

Combined with Gmail in a single Google OAuth app. See [gmail.md](gmail.md) for the shared callback flow.

## Data fetched

| Method | API | Content |
|--------|-----|---------|
| Initial sync | `files.list` + export/get | All files modified in last 90 days |
| Delta sync | `files.list?q=modifiedTime > '...'` | Files changed since last sync |
| Changes API | `changes.list` with `pageToken` | Incremental (preferred for delta) |

## Supported file types (Phase 1)

| MIME type | Extraction method |
|-----------|------------------|
| `application/vnd.google-apps.document` | Export as `text/plain` |
| `application/vnd.google-apps.spreadsheet` | Export as CSV → plain text |
| `application/vnd.google-apps.presentation` | Export as `text/plain` |
| `application/pdf` | Download + text extraction (pdf-parse) |

Unsupported types (images, videos, binary) are skipped and logged.

## Normalization

```javascript
{
  externalId: file_id,
  sourceType: 'gdrive_doc',
  title: file_name,
  url: web_view_link,
  content: extracted_plain_text,
  metadata: {
    mime_type, modified_time, created_time, owner_email, folder_path, file_size
  }
}
```

Docs are chunked at heading/paragraph boundaries. PDFs are chunked at page boundaries where possible.

## Rate limits

Drive API: 12,000 queries/60 s per project. Export calls are heavier — connector limits to 10 concurrent exports with 500 ms spacing.

## Files (target)

```
modules/integrations/gdrive.ts   Connector implementation
modules/integrations/googleOAuth.ts  Shared OAuth token exchange
```

## Disconnect

`DELETE /api/v1/integrations/gdrive`:
- Revoke token via Google revoke endpoint
- Set integration status → `disconnected`
- Soft-delete all gdrive documents/chunks for the org

Note: Disconnecting GDrive does not disconnect Gmail if both share the same Google OAuth token. Each provider is tracked independently in the `integrations` table.
