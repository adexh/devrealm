import { FolderOpen, Terminal } from 'lucide-react'
import { useWorkspaceStore } from '../../../stores/workspaceStore'
import { useTerminalStore } from '../../../stores/terminalStore'

/**
 * The landing state. Nothing is scoped until a workspace is chosen, so the
 * rail and the drawer stay empty behind this.
 */
export function WorkspacePicker() {
  const workspaces = useWorkspaceStore(state => state.workspaces)
  const repos = useWorkspaceStore(state => state.repos)
  const sessions = useTerminalStore(state => state.sessions)
  const setActiveWorkspace = useTerminalStore(state => state.setActiveWorkspace)

  return (
    <div className="flex-1 min-h-0 bg-tm-0 overflow-y-auto scrollbar-thin">
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-6">
        <div className="space-y-1">
          <h2 className="text-[18px] leading-6 font-semibold text-tm-ink">Pick a workspace</h2>
          <p className="text-[13px] leading-5 text-tm-ink-soft">
            Terminals, sessions and repos are all scoped to one workspace at a time.
          </p>
        </div>

        {workspaces.length === 0 ? (
          <p className="text-[13px] leading-5 text-tm-ink-dim">
            No workspaces yet. Add one from the Dashboard and it will appear here.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {workspaces.map(workspace => {
              const repoCount = repos.filter(repo => repo.workspaceId === workspace.id).length
              const openCount = sessions.filter(session => session.workspaceId === workspace.id).length

              return (
                <button
                  key={workspace.id}
                  type="button"
                  onClick={() => setActiveWorkspace(workspace.id)}
                  className="text-left p-3 rounded bg-tm-1 hover:bg-tm-2 border border-tm-line/40 transition-colors cursor-pointer flex flex-col gap-2"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <FolderOpen size={16} className="text-tm-ink-dim shrink-0" aria-hidden="true" />
                      <span className="text-[13px] leading-[18px] font-semibold text-tm-ink truncate">
                        {workspace.name}
                      </span>
                    </span>
                    {openCount > 0 && (
                      <span className="font-mono text-[10px] leading-[14px] px-1.5 rounded bg-tm-2 text-tm-ok shrink-0 flex items-center gap-1">
                        <Terminal size={11} aria-hidden="true" />
                        {openCount}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[10px] leading-[14px] text-tm-ink-dim truncate">
                    {repoCount} {repoCount === 1 ? 'repo' : 'repos'}
                    {workspace.rootPath ? ` · ${workspace.rootPath}` : ''}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
