import { X } from 'lucide-react'
import type { TerminalSession } from '../types'
import { StateDot } from './StateDot'

export function TerminalTab({ session, active, onFocus, onClose }: {
  session: TerminalSession
  active: boolean
  onFocus: () => void
  onClose: () => void
}) {
  return (
    <div
      onClick={onFocus}
      title={session.cwd}
      className={active
        ? 'flex items-center gap-2 px-3 py-1.5 rounded bg-tm-0 text-tm-ink-strong font-mono text-[11px] leading-4 font-medium shadow-sm cursor-pointer shrink-0'
        : 'flex items-center gap-2 px-3 py-1.5 rounded hover:bg-tm-2 text-tm-ink-soft font-mono text-[11px] leading-4 cursor-pointer shrink-0 transition-colors'}
    >
      <StateDot state={session.state} large={active} />
      <span className="flex items-center gap-1 min-w-0">
        <span className={active ? 'text-tm-ok-dim' : 'text-tm-ink-dim'}>&gt;_</span>
        <span className="truncate max-w-40">{session.title}</span>
      </span>
      <button
        type="button"
        onClick={event => { event.stopPropagation(); onClose() }}
        title="Close tab"
        className="text-tm-ink-dim hover:text-tm-ink-strong rounded-full p-0.5 ml-1 transition-colors bg-transparent border-none cursor-pointer flex items-center"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  )
}
