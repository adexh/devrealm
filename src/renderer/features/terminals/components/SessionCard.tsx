import { useState } from 'react'
import type { TerminalSession } from '../types'
import { relTimeFine } from '../../../utils/format'
import { StateChip } from './StateChip'
import { StateDot } from './StateDot'

const STAT_TONE_CLASS = {
  ok: 'text-tm-ok-dim',
  warn: 'text-tm-warn-dim',
  dim: 'text-tm-ink-dim',
  err: 'text-tm-err',
}

export function SessionCard({ session, active, onFocus, onRename }: {
  session: TerminalSession
  active: boolean
  onFocus: () => void
  onRename: (title: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(session.title)

  function commit() {
    setEditing(false)
    if (draft !== session.title) onRename(draft)
  }

  return (
    <div
      onClick={onFocus}
      onDoubleClick={() => { setDraft(session.title); setEditing(true) }}
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
              onChange={event => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={event => {
                if (event.key === 'Enter') commit()
                if (event.key === 'Escape') setEditing(false)
              }}
              onClick={event => event.stopPropagation()}
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

      {session.subtitle && (
        <p className="text-[12px] leading-4 text-tm-ink-soft truncate">{session.subtitle}</p>
      )}

      <div className="flex items-center justify-between gap-2 pt-0.5 font-mono text-[10px] leading-[14px] text-tm-ink-dim">
        {session.stats.map(stat => (
          <span key={stat.label} className={`${STAT_TONE_CLASS[stat.tone ?? 'dim']} truncate`}>
            {stat.label}
          </span>
        ))}
        <span className="shrink-0">{relTimeFine(session.lastActiveAt)}</span>
      </div>
    </div>
  )
}
