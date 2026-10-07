import { Eraser, Folder, Maximize2, Minimize2, Plus, X } from 'lucide-react'
import { useTerminalStore } from '../../../stores/terminalStore'
import type { PaneGroup } from '../../../stores/terminalLayout'
import { getTerminal } from '../hooks/terminalRegistry'
import { TerminalTab } from './TerminalTab'

export function TerminalTabBar({ group, split, onNewTab }: { group: PaneGroup; split: boolean; onNewTab: () => void }) {
  const allSessions = useTerminalStore(state => state.sessions)
  const maximized = useTerminalStore(state => state.maximized)
  const toggleMaximized = useTerminalStore(state => state.toggleMaximized)
  const clearActiveTerminal = useTerminalStore(state => state.clearActiveTerminal)
  const focusSession = useTerminalStore(state => state.focusSession)
  const closeSession = useTerminalStore(state => state.closeSession)
  const closePane = useTerminalStore(state => state.closePane)
  const dragging = useTerminalStore(state => state.draggedSessionId !== null)
  const dropDraggedOnTab = useTerminalStore(state => state.dropDraggedOnTab)

  const sessions = group.sessionIds.flatMap(id => allSessions.filter(session => session.id === id))
  const activeSession = sessions.find(session => session.id === group.activeId) ?? null

  /**
   * Clears the visible buffer and the daemon's authoritative one. Clearing only
   * here would bring everything back on the next attach, since the snapshot is
   * rebuilt from the daemon's copy.
   */
  function clear() {
    getTerminal(group.activeId)?.terminal.clear()
    void clearActiveTerminal()
  }

  return (
    <div className="@container h-10 bg-tm-1 px-1 flex items-center justify-between shrink-0 select-none gap-2">
      <div
        onDragOver={event => { if (dragging) event.preventDefault() }}
        onDrop={event => {
          if (!dragging) return
          event.preventDefault()
          dropDraggedOnTab(group.id, null, true)
        }}
        className="flex-1 h-full flex items-center gap-1 overflow-x-auto min-w-0 scrollbar-none"
      >
        {sessions.map(session => (
          <TerminalTab
            key={session.id}
            session={session}
            groupId={group.id}
            active={session.id === group.activeId}
            onFocus={() => focusSession(session.id)}
            onClose={() => void closeSession(session.id)}
          />
        ))}
        <button
          type="button"
          onClick={onNewTab}
          title="New tab in this pane (⌘T)"
          className="flex items-center justify-center w-7 h-7 rounded hover:bg-tm-2 text-tm-ink-dim hover:text-tm-ink-strong transition-colors shrink-0 bg-transparent border-none cursor-pointer"
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {activeSession && (
          <div className="hidden @4xl:flex items-center gap-1.5 px-2 py-0.5 rounded bg-tm-2 font-mono text-[10px] leading-[14px] text-tm-ink-dim">
            <Folder size={13} className="text-tm-ok shrink-0" aria-hidden="true" />
            <span className="text-tm-ink-soft truncate max-w-80">{activeSession.cwd}</span>
          </div>
        )}
        {activeSession?.boundPort && (
          <span className="font-mono text-[10px] leading-[14px] px-2 py-0.5 rounded bg-tm-2 text-tm-ok flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-tm-ok animate-pulse" aria-hidden="true" />
            :{activeSession.boundPort} bound
          </span>
        )}
        {activeSession && (
          <span className="hidden @xl:inline font-mono text-[10px] leading-[14px] px-2 py-0.5 rounded bg-tm-3 text-tm-ink-soft font-semibold">
            {activeSession.shell}
          </span>
        )}
        <button
          type="button"
          onClick={clear}
          title="Clear scrollback"
          className="p-1 rounded text-tm-ink-dim hover:text-tm-ink-strong hover:bg-tm-2 transition-colors bg-transparent border-none cursor-pointer flex items-center"
        >
          <Eraser size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={toggleMaximized}
          title={maximized ? 'Restore the drawers (Esc)' : 'Maximize terminal'}
          className={maximized
            ? 'p-1 rounded text-tm-ink-strong bg-tm-3 transition-colors border-none cursor-pointer flex items-center'
            : 'p-1 rounded text-tm-ink-dim hover:text-tm-ink-strong hover:bg-tm-2 transition-colors bg-transparent border-none cursor-pointer flex items-center'}
        >
          {maximized
            ? <Minimize2 size={16} aria-hidden="true" />
            : <Maximize2 size={16} aria-hidden="true" />}
        </button>
        {split && (
          <button
            type="button"
            onClick={() => closePane(group.id)}
            title="Close this pane. Its tabs move to the next one; no shell is closed."
            className="p-1 rounded text-tm-ink-dim hover:text-tm-err hover:bg-tm-2 transition-colors bg-transparent border-none cursor-pointer flex items-center"
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
