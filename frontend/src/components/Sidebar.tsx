// frontend/src/components/Sidebar.tsx
import { useUser, useClerk } from '@clerk/clerk-react'
import type { QueryHistoryItem } from '../lib/api'

type Props = {
  history: QueryHistoryItem[]
  onNewSearch: () => void
  onSelectHistory: (item: QueryHistoryItem) => void
  activeQueryId: string | null
}

// Static for now — Track A's real integration status will replace this
// once GET /api/v1/integrations is wired in.
const CONNECTED_SERVICES = [
  { name: 'Google Drive', connected: true },
  { name: 'Slack', connected: false },
  { name: 'Github', connected: true },
  { name: 'Whatsapp', connected: true },
]

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return 'Last week'
}

export default function Sidebar({ history, onNewSearch, onSelectHistory, activeQueryId }: Props) {
  const { user } = useUser()
  const { openUserProfile } = useClerk()

  const initials =
    (user?.firstName?.[0] ?? '') + (user?.lastName?.[0] ?? '') || user?.username?.[0] || 'U'

  return (
    <aside className="flex h-full w-[280px] flex-shrink-0 flex-col bg-navy px-5 py-6 text-cream">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-medium text-cream">Revoca</h1>
      </div>

      <button
        onClick={onNewSearch}
        className="mt-6 flex items-center justify-center gap-2 rounded-lg bg-tan py-3 font-medium text-navy transition-colors hover:bg-tan-dark"
      >
        <span className="text-lg leading-none">+</span>
        New Search
      </button>

      <div className="mt-8">
        <p className="text-xs font-medium uppercase tracking-widest text-cream/50">
          Connected Services
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {CONNECTED_SERVICES.map((service) => (
            <div
              key={service.name}
              className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium ${
                service.connected ? 'bg-sage-dark/40 text-cream' : 'bg-cream-light text-ink'
              }`}
            >
              <span className={service.connected ? 'text-sage' : 'text-ink-muted'}>
                {service.connected ? '✓' : '✕'}
              </span>
              {service.name}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 flex-1 overflow-y-auto">
        <p className="text-xs font-medium uppercase tracking-widest text-cream/50">Recent</p>
        <div className="mt-3 flex flex-col gap-1">
          {history.length === 0 && (
            <p className="mt-2 text-sm text-cream/40">No searches yet</p>
          )}
          {history.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectHistory(item)}
              className={`rounded-lg px-3 py-2.5 text-left transition-colors ${
                item.id === activeQueryId ? 'bg-navy-light' : 'hover:bg-navy-light/60'
              }`}
            >
              <p className="truncate text-sm font-medium text-cream">{item.question}</p>
              <p className="mt-0.5 text-xs text-cream/40">{relativeTime(item.created_at)}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 border-t border-cream/10 pt-4">
        <button
          onClick={() => openUserProfile()}
          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-navy-light/60"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cream/20 text-sm font-medium text-cream">
            {initials.toUpperCase()}
          </span>
          <span>
            <p className="text-sm font-medium text-cream">
              {user?.fullName ?? user?.username ?? 'Account'}
            </p>
            <p className="text-xs text-cream/50">Settings</p>
          </span>
        </button>
      </div>
    </aside>
  )
}
