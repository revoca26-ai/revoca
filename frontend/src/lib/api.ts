// frontend/src/lib/api.ts
//
// Thin wrapper around fetch for talking to the backend, plus the manual SSE
// parser for the ask stream. We use fetch instead of the native EventSource
// API specifically because EventSource cannot send custom headers, and our
// backend requires a real Authorization: Bearer <token> header on every
// request (see middlewares/auth.ts on the backend).

// Empty in local dev so Vite can proxy /api → backend and skip CORS.
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''

export type AskEvent =
  | { type: 'status'; status: string }
  | { type: 'token'; text: string }
  | {
      type: 'sources'
      sources: Array<{
        index: number
        chunkId: string
        documentId: string
        relevanceScore: number
        snippet: string
      }>
    }
  | { type: 'done'; confidence: number }
  | { type: 'error'; message: string }

export type QueryHistoryItem = {
  id: string
  question: string
  answer: string | null
  status: string
  created_at: string
}

export async function createQuery(token: string, question: string): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE_URL}/api/v1/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ question }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }

  return res.json()
}

export async function fetchQueryDetail(token: string, queryId: string) {
  const res = await fetch(`${API_BASE_URL}/api/v1/ask/${queryId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Failed to load query (${res.status})`)
  return res.json()
}

export async function fetchHistory(token: string): Promise<QueryHistoryItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/ask/history`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.queries ?? []
}

// Streams events from GET /api/v1/ask/:id/stream, parsing the raw SSE frames
// by hand (same approach as answer.ts on the backend) since EventSource
// can't carry our auth header.
export async function* streamQuery(
  token: string,
  queryId: string,
  signal?: AbortSignal
): AsyncGenerator<AskEvent, void, unknown> {
  const res = await fetch(`${API_BASE_URL}/api/v1/ask/${queryId}/stream`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })

  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Stream failed (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  function parseFrame(frame: string): AskEvent | null {
    // Frames look like:
    //   event: token
    //   data: {"text":"..."}
    const lines = frame.split('\n')
    const dataLine = lines.find((l) => l.startsWith('data:'))
    if (!dataLine) return null
    try {
      const payload = JSON.parse(dataLine.slice('data:'.length).trim())
      const eventLine = lines.find((l) => l.startsWith('event:'))
      const eventType = eventLine?.slice('event:'.length).trim()
      return { type: eventType, ...payload } as AskEvent
    } catch {
      return null
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      const event = parseFrame(frame)
      if (event) yield event
    }
  }

  buffer += decoder.decode()
  if (buffer.trim().length > 0) {
    const event = parseFrame(buffer)
    if (event) yield event
  }
}
