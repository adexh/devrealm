import { useState } from 'react'
import type { TerminalSession } from '../types'
import { SessionContextMenu } from './SessionContextMenu'
import { StateChip } from './StateChip'
import { StateDot } from './StateDot'

const STAT_TONE_CLASS = {
  ok: 'text-tm-ok-dim',
  warn: 'text-tm-warn-dim',
  dim: 'text-tm-ink-dim',
  err: 'text-tm-err',
}

function relTime(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000)
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function SessionCard({ session, active, onFocus, onRename }: {
  session: TerminalSession
  active: boolean
  onFocus: () => void
  onRename: (title: string) => string | null
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(session.title)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  function startEditing() {
    setDraft(session.title)
    setRenameError(null)
    setEditing(true)
  }

  function stopEditing() {
    setEditing(false)
    setRenameError(null)
  }

  function commit(keepOpenOnError: boolean) {
    const error = draft.trim() === session.title ? null : onRename(draft)
    if (error && keepOpenOnError) {
      setRenameError(error)
      return
    }
    stopEditing()
  }

  return (
    <div
      onClick={onFocus}
      onDoubleClick={startEditing}
      onContextMenu={event => {
        event.preventDefault()
        setMenu({
          x: Math.min(event.clientX, window.innerWidth - 140),
          y: Math.min(event.clientY, window.innerHeight - 48),
        })
      }}
      className={active
        ? 'flex flex-col gap-1 p-2 rounded bg-tm-3 shadow-sm cursor-pointer'
        : 'flex flex-col gap-1 p-2 rounded bg-tm-1 hover:bg-tm-2 cursor-pointer transition-colors'}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StateDot state={session.state} large={active} />
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={event => { setDraft(event.target.value); setRenameError(null) }}
              onBlur={() => commit(false)}
              onKeyDown={event => {
                if (event.key === 'Enter') commit(true)
                if (event.key === 'Escape') stopEditing()
              }}
              aria-invalid={renameError !== null}
              onClick={event => event.stopPropagation()}
              onDoubleClick={event => event.stopPropagation()}
              onContextMenu={event => event.stopPropagation()}
              className="w-full bg-transparent border-none outline-none font-mono text-[11px] leading-4 text-tm-ink-strong"
            />
          ) : (
            <span className={active
              ? 'font-mono text-[11px] leading-4 text-tm-ink-strong font-medium truncate'
              : 'font-mono text-[11px] leading-4 text-tm-ink truncate'}
            >
              {session.title}
            </span>
          )}
        </div>
        <StateChip state={session.state} label={session.statusLabel} />
      </div>

      {renameError && (
        <p role="alert" className="text-[11px] leading-4 text-tm-err">{renameError}</p>
      )}

      {session.subtitle && (
        <p className="text-[12px] leading-4 text-tm-ink-soft truncate">{session.subtitle}</p>
      )}

      <div className="flex items-center justify-between gap-2 pt-0.5 font-mono text-[10px] leading-[14px] text-tm-ink-dim">
        {session.stats.map(stat => (
          <span key={stat.label} className={`${STAT_TONE_CLASS[stat.tone ?? 'dim']} truncate`}>
            {stat.label}
          </span>
        ))}
        <span className="shrink-0">{relTime(session.lastActiveAt)}</span>
      </div>

      {menu && (
        <SessionContextMenu
          x={menu.x}
          y={menu.y}
          onRename={startEditing}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
