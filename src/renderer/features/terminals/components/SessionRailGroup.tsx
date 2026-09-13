import { ChevronDown, ChevronRight } from 'lucide-react'
import type { SessionGroup } from '../types'
import { SessionCard } from './SessionCard'

export function SessionRailGroup({ group, collapsed, activeSessionId, onToggle, onFocus, onRename }: {
  group: SessionGroup
  collapsed: boolean
  activeSessionId: string | null
  onToggle: () => void
  onFocus: (sessionId: string) => void
  onRename: (sessionId: string, title: string) => void
}) {
  const hasActive = group.sessions.some(session => session.id === activeSessionId)
  const Caret = collapsed ? ChevronRight : ChevronDown

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-1 py-1 text-tm-ink-soft hover:text-tm-ink-strong cursor-pointer bg-transparent border-none"
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <Caret size={14} className="text-tm-ink-dim shrink-0" aria-hidden="true" />
          <span className={hasActive
            ? 'text-[13px] leading-[18px] font-semibold text-tm-ink-strong truncate'
            : 'text-[13px] leading-[18px] font-semibold text-tm-ink truncate'}
          >
            {group.workspaceName}
          </span>
        </span>
        <span className="font-mono text-[10px] leading-[14px] text-tm-ink-dim shrink-0">
          {group.sessions.length} {group.sessions.length === 1 ? 'tab' : 'tabs'}
        </span>
      </button>

      {!collapsed && group.sessions.map(session => (
        <SessionCard
          key={session.id}
          session={session}
          active={session.id === activeSessionId}
          onFocus={() => onFocus(session.id)}
          onRename={title => onRename(session.id, title)}
        />
      ))}
    </div>
  )
}
