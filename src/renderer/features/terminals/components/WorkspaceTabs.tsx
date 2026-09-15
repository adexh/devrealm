import { Plus } from 'lucide-react'
import { useWorkspaceStore } from '../../../stores/workspaceStore'
import { useTerminalStore } from '../hooks/useTerminalStore'

/**
 * Open workspaces, the way a browser shows open tabs rather than every
 * bookmark. A workspace earns a tab by having a shell in it.
 *
 * The selected workspace is always included even with no shells yet, since it
 * was just picked and dropping its tab would leave the current scope unlabelled.
 * The picker, reached with the + button, is where every workspace is listed.
 */
export function WorkspaceTabs() {
  const workspaces = useWorkspaceStore(state => state.workspaces)
  const sessions = useTerminalStore(state => state.sessions)
  const activeWorkspaceId = useTerminalStore(state => state.activeWorkspaceId)
  const setActiveWorkspace = useTerminalStore(state => state.setActiveWorkspace)

  const open = workspaces
    .map(workspace => ({
      workspace,
      openCount: sessions.filter(session => session.workspaceId === workspace.id).length,
    }))
    .filter(entry => entry.openCount > 0 || entry.workspace.id === activeWorkspaceId)

  if (open.length === 0) return null

  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0">
      {open.map(({ workspace, openCount }) => {
        const active = workspace.id === activeWorkspaceId

        return (
          <button
            key={workspace.id}
            type="button"
            title={workspace.rootPath ?? workspace.name}
            onClick={() => setActiveWorkspace(workspace.id)}
            className={active
              ? 'flex items-center gap-1.5 px-2.5 py-1 rounded bg-tm-3 text-tm-ink-strong text-[12px] leading-4 font-semibold border-b-2 border-tm-ok shrink-0 cursor-pointer'
              : 'flex items-center gap-1.5 px-2.5 py-1 rounded bg-transparent text-tm-ink-soft hover:text-tm-ink-strong hover:bg-tm-1 text-[12px] leading-4 border-b-2 border-transparent shrink-0 cursor-pointer'}
          >
            <span className="truncate max-w-40">{workspace.name}</span>
            {openCount > 0 && (
              <span className="font-mono text-[10px] leading-[14px] px-1 rounded bg-tm-2 text-tm-ok shrink-0">
                {openCount}
              </span>
            )}
          </button>
        )
      })}

      <button
        type="button"
        onClick={() => setActiveWorkspace(null)}
        title="Open another workspace"
        className="flex items-center justify-center w-7 h-7 rounded bg-transparent text-tm-ink-dim hover:text-tm-ink-strong hover:bg-tm-1 transition-colors shrink-0 border-none cursor-pointer"
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
