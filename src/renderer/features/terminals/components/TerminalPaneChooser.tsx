import { Plus, Terminal, X } from 'lucide-react'
import { useTerminalStore } from '../../../stores/terminalStore'
import { StateDot } from './StateDot'

/**
 * The second pane before anything is in it. Splitting should not decide for
 * you: an existing session beside the current one is often the point.
 */
export function TerminalPaneChooser() {
  const sessions = useTerminalStore(state => state.sessions)
  const activeWorkspaceId = useTerminalStore(state => state.activeWorkspaceId)
  const paneIds = useTerminalStore(state => state.paneIds)
  const choosePaneSession = useTerminalStore(state => state.choosePaneSession)
  const openSession = useTerminalStore(state => state.openSession)
  const toggleSplit = useTerminalStore(state => state.toggleSplit)

  const current = sessions.find(session => session.id === paneIds[0])
  const available = sessions.filter(
    session => session.workspaceId === activeWorkspaceId && !paneIds.includes(session.id)
  )

  return (
    <div className="flex-1 min-h-0 bg-tm-0 flex flex-col overflow-hidden">
      <div className="h-10 px-3 bg-tm-1 flex items-center justify-between shrink-0">
        <span className="text-[10px] leading-[14px] font-semibold uppercase tracking-widest text-tm-ink-soft">
          Second pane
        </span>
        <button
          type="button"
          onClick={toggleSplit}
          title="Cancel the split"
          className="flex items-center justify-center w-5 h-5 rounded text-tm-ink-dim hover:text-tm-err bg-transparent border-none cursor-pointer"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {current && (
          <button
            type="button"
            onClick={() => void openSession({
              workspaceId: current.workspaceId,
              repoId: current.repoId,
              repoName: current.repoName,
              cwd: current.cwd,
            })}
            className="w-full flex items-center gap-2 p-2 rounded bg-tm-3 hover:bg-tm-5 text-tm-ink-strong text-[13px] leading-[18px] font-semibold transition-colors border-none cursor-pointer"
          >
            <Plus size={16} aria-hidden="true" />
            <span className="truncate">New shell in {current.repoName}</span>
          </button>
        )}

        <div className="space-y-1">
          <p className="text-[10px] leading-[14px] font-semibold uppercase tracking-widest text-tm-ink-dim px-1">
            {available.length > 0 ? 'Or move a running session here' : 'No other sessions running'}
          </p>

          {available.length === 0 ? (
            <p className="px-1 text-[12px] leading-4 text-tm-ink-dim">
              Launch a repo from the drawer and it opens here.
            </p>
          ) : available.map(session => (
            <button
              key={session.id}
              type="button"
              onClick={() => choosePaneSession(session.id)}
              className="w-full flex items-center justify-between gap-2 p-2 rounded bg-tm-1 hover:bg-tm-2 transition-colors border-none cursor-pointer text-left"
            >
              <span className="flex items-center gap-2 min-w-0">
                <StateDot state={session.state} />
                <span className="font-mono text-[11px] leading-4 text-tm-ink truncate">{session.title}</span>
              </span>
              <Terminal size={13} className="text-tm-ink-dim shrink-0" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
