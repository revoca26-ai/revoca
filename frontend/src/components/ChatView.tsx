// frontend/src/components/ChatView.tsx
import { useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import type { AskState } from '../hooks/useAsk'

type Props = {
  askState: AskState
  onAsk: (question: string) => void
}

const SUGGESTED_QUESTIONS = [
  'Why did we stop using that supplier?',
  'Complied mistakes from last pull request',
  'What was decided on the last board meeting?',
]

const STATUS_LABELS: Record<string, string> = {
  sending: 'Sending…',
  rewriting: 'Understanding your question…',
  searching: 'Searching your workspace…',
  reranking: 'Finding the best sources…',
  answering: 'Writing an answer…',
  insufficient_evidence: "Couldn't find enough information",
}

export default function ChatView({ askState, onAsk }: Props) {
  const [input, setInput] = useState('')
  const { user } = useUser()
  const hasConversation = askState.question.length > 0

  function handleSubmit(question: string) {
    const trimmed = question.trim()
    if (!trimmed) return
    onAsk(trimmed)
    setInput('')
  }

  return (
    <div className="flex h-full flex-1 flex-col bg-cream">
      <header className="flex items-center justify-end border-b border-ink/10 px-8 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy/10 text-sm text-navy">
          {user?.firstName?.[0] ?? 'U'}
        </span>
      </header>

      <div className="flex flex-1 flex-col overflow-y-auto px-8 py-10">
        {!hasConversation ? (
          <div className="m-auto flex max-w-xl flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-tan-dark text-2xl leading-none text-cream">
              +
            </div>
            <h2 className="mt-6 font-display text-3xl text-ink">What do you want to know?</h2>
            <p className="mt-3 text-ink-muted">
              Ask anything about your business — decisions, documents, conversations.
              <br />
              Revoca searches across all your connected tools.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSubmit(q)}
                  className="rounded-full bg-navy/15 px-4 py-2 text-sm text-navy transition-colors hover:bg-navy/25"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
            <div className="self-end rounded-2xl rounded-br-sm bg-navy px-4 py-3 text-cream">
              {askState.question}
            </div>

            <div className="flex flex-col gap-3">
              {askState.status !== 'done' && askState.status !== 'error' && (
                <p className="text-sm italic text-ink-muted">
                  {STATUS_LABELS[askState.status] ?? askState.status}
                </p>
              )}

              {askState.answer && (
                <div className="rounded-2xl rounded-bl-sm bg-cream-light px-4 py-3 text-ink">
                  <p className="whitespace-pre-wrap leading-relaxed">{askState.answer}</p>
                </div>
              )}

              {askState.status === 'done' && !askState.answer && !askState.error && (
                <div className="rounded-2xl rounded-bl-sm bg-cream-light px-4 py-3 text-ink-muted">
                  I couldn't find enough information in your connected tools to answer that confidently.
                </div>
              )}

              {askState.error && (
                <div className="rounded-2xl bg-red-50 px-4 py-3 text-red-800">
                  {askState.error === 'Not signed in'
                    ? "You're not signed in — please sign in and try again."
                    : askState.status === 'insufficient_evidence'
                      ? "I couldn't find enough information in your connected tools to answer that confidently."
                      : `Something went wrong: ${askState.error}`}
                </div>
              )}

              {askState.sources.length > 0 && (
                <div className="mt-2 flex flex-col gap-2">
                  <p className="text-xs font-medium uppercase tracking-widest text-ink-muted">
                    Sources
                  </p>
                  {askState.sources.map((s) => (
                    <div
                      key={s.chunkId}
                      className="rounded-lg border border-ink/10 bg-cream-light/60 px-3 py-2 text-sm text-ink-muted"
                    >
                      <span className="font-medium text-ink">[{s.index}]</span> {s.snippet}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="px-8 pb-8">
        <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-2xl border border-ink/10 bg-cream-light px-4 py-3 shadow-sm">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit(input)}
            placeholder="Ask anything about your business..."
            disabled={askState.isStreaming}
            className="flex-1 bg-transparent text-ink placeholder:text-ink-muted/60 focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={() => handleSubmit(input)}
            disabled={askState.isStreaming || !input.trim()}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-tan text-navy transition-colors hover:bg-tan-dark disabled:opacity-40"
            aria-label="Send question"
          >
            →
          </button>
        </div>
      </div>
    </div>
  )
}
