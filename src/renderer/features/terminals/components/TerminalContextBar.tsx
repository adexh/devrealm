import { Columns2, FolderTree, PanelLeft, Plus } from 'lucide-react'
import { useTerminalStore } from '../hooks/useTerminalStore'
import { BUSY_STATES } from '../constants'
import { WorkspaceTabs } from './WorkspaceTabs'

export function TerminalContextBar({ onNewShell }: { onNewShell: () => void }) {
  const sessions = useTerminalStore(state => state.sessions)
  const activeWorkspaceId = useTerminalStore(state => state.activeWorkspaceId)
  const railOpen = useTerminalStore(state => state.railOpen)
  const drawerOpen = useTerminalStore(state => state.drawerOpen)
  const toggleRail = useTerminalStore(state => state.toggleRail)
  const toggleDrawer = useTerminalStore(state => state.toggleDrawer)

  // Every count is scoped to the selected workspace, like the rest of the screen.
  const scoped = sessions.filter(session => session.workspaceId === activeWorkspaceId)
  const busyCount = scoped.filter(session => BUSY_STATES.includes(session.state)).length
  const failedCount = scoped.filter(session => session.state === 'failed').length

  return (
    <section className="w-full bg-tm-0 border-b border-tm-line/30 px-3 py-1 flex items-center justify-between gap-3 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <WorkspaceTabs />
        <div className="flex items-center gap-1.5 px-2 py-1 bg-tm-1 rounded shrink-0">
          <span className={activeWorkspaceId ? 'w-2 h-2 rounded-full bg-tm-ok-dim' : 'w-2 h-2 rounded-full bg-tm-ink-dim'} aria-hidden="true" />
          <span className="text-[13px] leading-[18px] font-semibold text-tm-ink">Terminals</span>
        </div>
      </div>

      {activeWorkspaceId && (
        <div className="hidden xl:flex items-center gap-3 font-mono text-[10px] leading-[14px] text-tm-ink-dim shrink-0">
          <span className="flex items-center gap-1.5 text-tm-ink">
            <span className="w-1.5 h-1.5 rounded-full bg-tm-ok" aria-hidden="true" />
            {scoped.length} {scoped.length === 1 ? 'shell' : 'shells'}
          </span>
          <span className="text-tm-line">•</span>
          <span className="text-tm-ink-soft">{busyCount} running</span>
          <span className="text-tm-line">•</span>
          <span className={failedCount > 0 ? 'text-tm-err' : 'text-tm-ok-dim'}>{failedCount} errors</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={toggleRail}
          title="Toggle sessions rail"
          className={railOpen
            ? 'flex items-center gap-1 px-2.5 py-1 bg-tm-3 text-tm-ink-strong hover:bg-tm-5 rounded text-[12px] leading-4 transition-colors border-none cursor-pointer'
            : 'flex items-center gap-1 px-2.5 py-1 bg-tm-2 text-tm-ink-dim hover:bg-tm-3 rounded text-[12px] leading-4 transition-colors border-none cursor-pointer'}
        >
          <PanelLeft size={16} aria-hidden="true" />
          <span className="hidden 2xl:inline">Sessions</span>
          <kbd className="font-mono text-[10px] leading-[14px] px-1 rounded bg-tm-2 text-tm-ink-soft">⌘1</kbd>
        </button>
        <button
          type="button"
          onClick={toggleDrawer}
          title="Toggle repo drawer"
          className={drawerOpen
            ? 'flex items-center gap-1 px-2.5 py-1 bg-tm-3 text-tm-ink-strong hover:bg-tm-5 rounded text-[12px] leading-4 transition-colors border-none cursor-pointer'
            : 'flex items-center gap-1 px-2.5 py-1 bg-tm-2 text-tm-ink-dim hover:bg-tm-3 rounded text-[12px] leading-4 transition-colors border-none cursor-pointer'}
        >
          <FolderTree size={16} aria-hidden="true" />
          <span className="hidden 2xl:inline">Repos</span>
          <kbd className="font-mono text-[10px] leading-[14px] px-1 rounded bg-tm-2 text-tm-ink-soft">⌘B</kbd>
        </button>
        <button
          type="button"
          title="Split pane"
          className="flex items-center gap-1 px-2 py-1 bg-tm-2 text-tm-ink-dim hover:text-tm-ink-strong hover:bg-tm-3 rounded text-[12px] leading-4 transition-colors border-none cursor-pointer"
        >
          <Columns2 size={16} aria-hidden="true" />
          <kbd className="font-mono text-[10px] leading-[14px] px-1 rounded bg-tm-0 text-tm-ink-dim">⌘\</kbd>
        </button>
        <button
          type="button"
          onClick={onNewShell}
          disabled={!activeWorkspaceId}
          className="flex items-center gap-1.5 px-3 py-1 bg-tm-4 text-tm-ink-strong text-[13px] leading-[18px] font-semibold rounded hover:bg-tm-5 disabled:opacity-40 transition-colors border-none cursor-pointer"
        >
          <Plus size={16} aria-hidden="true" />
          <span>New Shell</span>
          <kbd className="font-mono text-[10px] leading-[14px] px-1.5 rounded bg-tm-0 text-tm-ink-soft">⌘T</kbd>
        </button>
      </div>
    </section>
  )
}
