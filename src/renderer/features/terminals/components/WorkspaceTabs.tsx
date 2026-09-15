import { useWorkspaceStore } from '../../../stores/workspaceStore'
import { useTerminalStore } from '../hooks/useTerminalStore'

/**
 * Workspace is the top-level scope for this screen: the tab you pick decides
 * what the rail, the drawer and the centre pane show.
 */
export function WorkspaceTabs() {
  const workspaces = useWorkspaceStore(state => state.workspaces)
  const sessions = useTerminalStore(state => state.sessions)
  const activeWorkspaceId = useTerminalStore(state => state.activeWorkspaceId)
  const setActiveWorkspace = useTerminalStore(state => state.setActiveWorkspace)

  if (workspaces.length === 0) return null

  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0">
      {workspaces.map(workspace => {
        const openCount = sessions.filter(session => session.workspaceId === workspace.id).length
        const active = workspace.id === activeWorkspaceId

        return (
          <button
            key={workspace.id}
            type="button"
            title={workspace.rootPath ?? workspace.name}
            onClick={() => setActiveWorkspace(active ? null : workspace.id)}
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
    </div>
  )
}
