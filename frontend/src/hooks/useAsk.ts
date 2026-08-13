// frontend/src/hooks/useAsk.ts
//
// Manages the lifecycle of a single question: create the query, open the
// stream, and accumulate tokens/sources/status as they arrive.

import { useCallback, useRef, useState } from 'react'
import { createQuery, streamQuery, type AskEvent } from '../lib/api'

export type AskSource = {
  index: number
  chunkId: string
  documentId: string
  relevanceScore: number
  snippet: string
}

export type AskState = {
  question: string
  answer: string
  status: string
  sources: AskSource[]
  isStreaming: boolean
  error: string | null
}

const IDLE_STATE: AskState = {
  question: '',
  answer: '',
  status: 'idle',
  sources: [],
  isStreaming: false,
  error: null,
}

export function useAsk(getToken: () => Promise<string | null>) {
  const [state, setState] = useState<AskState>(IDLE_STATE)
  const abortRef = useRef<AbortController | null>(null)

  const ask = useCallback(
    async (question: string) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setState({
        question,
        answer: '',
        status: 'sending',
        sources: [],
        isStreaming: true,
        error: null,
      })

      try {
        const token = await getToken()
        if (!token) throw new Error('Not signed in')

        const { id } = await createQuery(token, question)

        for await (const event of streamQuery(token, id, controller.signal) as AsyncGenerator<AskEvent>) {
          if (controller.signal.aborted) return

          switch (event.type) {
            case 'status':
              setState((prev) => ({ ...prev, status: event.status }))
              break
            case 'sources':
              setState((prev) => ({ ...prev, sources: event.sources }))
              break
            case 'token':
              setState((prev) => ({ ...prev, answer: prev.answer + event.text }))
              break
            case 'done':
              setState((prev) => ({ ...prev, status: 'done', isStreaming: false }))
              break
            case 'error':
              setState((prev) => ({ ...prev, status: 'error', error: event.message, isStreaming: false }))
              break
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return
        const message = err instanceof Error ? err.message : 'Something went wrong'
        setState((prev) => ({ ...prev, status: 'error', error: message, isStreaming: false }))
      }
    },
    [getToken]
  )

  const viewStatic = useCallback((data: {
    question: string
    answer: string
    sources: AskSource[]
  }) => {
    abortRef.current?.abort()
    setState({
      question: data.question,
      answer: data.answer,
      status: 'done',
      sources: data.sources,
      isStreaming: false,
      error: null,
    })
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setState(IDLE_STATE)
  }, [])

  return { state, ask, reset, viewStatic }
}
