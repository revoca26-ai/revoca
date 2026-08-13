// frontend/src/App.tsx
import { useCallback, useEffect, useState } from 'react'
import { SignedIn, SignedOut, SignIn, useAuth } from '@clerk/clerk-react'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import { useAsk } from './hooks/useAsk'
import { fetchHistory, fetchQueryDetail, type QueryHistoryItem } from './lib/api'

function AskApp() {
  const { getToken } = useAuth()
  const [history, setHistory] = useState<QueryHistoryItem[]>([])
  const [activeQueryId, setActiveQueryId] = useState<string | null>(null)

  const tokenGetter = useCallback(() => getToken(), [getToken])
  const { state, ask, reset, viewStatic } = useAsk(tokenGetter)

  const loadHistory = useCallback(async () => {
    const token = await getToken()
    if (!token) return
    const items = await fetchHistory(token)
    setHistory(items)
  }, [getToken])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // Refresh history once a question finishes, so it shows up in "Recent"
  useEffect(() => {
    if (state.status === 'done') {
      loadHistory()
    }
  }, [state.status, loadHistory])

  async function handleAsk(question: string) {
    setActiveQueryId(null)
    await ask(question)
  }

  function handleNewSearch() {
    setActiveQueryId(null)
    reset()
  }

  async function handleSelectHistory(item: QueryHistoryItem) {
    setActiveQueryId(item.id)
    const token = await getToken()
    if (!token) return
    try {
      const detail = await fetchQueryDetail(token, item.id)
      viewStatic({
        question: detail.question,
        answer: detail.answer ?? '',
        sources: (detail.sources ?? []).map((s: any) => ({
          index: s.citation_index,
          chunkId: s.chunk_id,
          documentId: '',
          relevanceScore: s.relevance_score,
          snippet: s.snippet,
        })),
      })
    } catch {
      // If the fetch fails, just leave the previous view in place rather
      // than crashing the UI.
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        history={history}
        onNewSearch={handleNewSearch}
        onSelectHistory={handleSelectHistory}
        activeQueryId={activeQueryId}
      />
      <ChatView askState={state} onAsk={handleAsk} />
    </div>
  )
}

export default function App() {
  return (
    <>
      <SignedIn>
        <AskApp />
      </SignedIn>
      <SignedOut>
        <div className="flex h-screen w-screen items-center justify-center bg-cream">
          <SignIn />
        </div>
      </SignedOut>
    </>
  )
}
