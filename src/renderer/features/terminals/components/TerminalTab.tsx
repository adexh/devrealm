import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useTerminalStore } from '../../../stores/terminalStore'
import { useSessionDrag } from '../hooks/useSessionDrag'
import type { TerminalSession } from '../types'
import { StateDot } from './StateDot'

export function TerminalTab({ session, groupId, active, onFocus, onClose }: {
  session: TerminalSession
  groupId: string
  active: boolean
  onFocus: () => void
  onClose: () => void
}) {
  const drag = useSessionDrag(session.id)
  const draggedSessionId = useTerminalStore(state => state.draggedSessionId)
  const dropDraggedOnTab = useTerminalStore(state => state.dropDraggedOnTab)
  const [insert, setInsert] = useState<'before' | 'after' | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active])

  return (
    <div
      ref={ref}
      {...drag}
      onClick={onFocus}
      onDragOver={event => {
        if (!draggedSessionId) return
        // Kept from the tab bar too, which would otherwise take a drop on itself as "move to the end".
        event.stopPropagation()
        if (draggedSessionId === session.id) return
        event.preventDefault()
        const rect = event.currentTarget.getBoundingClientRect()
        setInsert(event.clientX > rect.left + rect.width / 2 ? 'after' : 'before')
      }}
      onDragLeave={() => setInsert(null)}
      onDrop={event => {
        if (!draggedSessionId) return
        event.preventDefault()
        event.stopPropagation()
        setInsert(null)
        dropDraggedOnTab(groupId, session.id, insert === 'after')
      }}
      title={session.cwd}
      className={active
        ? 'relative flex items-center gap-2 px-3 py-1.5 rounded bg-tm-0 text-tm-ink-strong font-mono text-[11px] leading-4 font-medium shadow-sm cursor-pointer shrink-0'
        : 'relative flex items-center gap-2 px-3 py-1.5 rounded hover:bg-tm-2 text-tm-ink-soft font-mono text-[11px] leading-4 cursor-pointer shrink-0 transition-colors'}
    >
      {insert === 'before' && <span className="absolute inset-y-1 -left-0.5 w-0.5 rounded-full bg-tm-ok pointer-events-none" aria-hidden="true" />}
      {insert === 'after' && <span className="absolute inset-y-1 -right-0.5 w-0.5 rounded-full bg-tm-ok pointer-events-none" aria-hidden="true" />}
      <StateDot state={session.state} large={active} />
      <span className="flex items-center gap-1 min-w-0 pointer-events-none">
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
