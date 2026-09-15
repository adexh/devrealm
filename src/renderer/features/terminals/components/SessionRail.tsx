import { Command, Terminal, X } from 'lucide-react'
import { useTerminalStore } from '../hooks/useTerminalStore'
import { SessionCard } from './SessionCard'

/** Sessions in the selected workspace. Flat, because the tab is the grouping. */
export function SessionRail({ onQuickSwitch }: { onQuickSwitch: () => void }) {
  const sessions = useTerminalStore(state => state.sessions)
  const activeWorkspaceId = useTerminalStore(state => state.activeWorkspaceId)
  const activeSessionId = useTerminalStore(state => state.activeSessionId)
  const focusSession = useTerminalStore(state => state.focusSession)
  const renameSession = useTerminalStore(state => state.renameSession)
  const killWorkspaceSessions = useTerminalStore(state => state.killWorkspaceSessions)

  const scoped = sessions.filter(session => session.workspaceId === activeWorkspaceId)

  return (
    <aside className="w-64 bg-tm-0 flex flex-col shrink-0 overflow-hidden border-r border-tm-line/40">
      <div className="h-9 px-3 bg-tm-1 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Terminal size={15} className="text-tm-ink-dim" aria-hidden="true" />
          <span className="text-[10px] leading-[14px] font-semibold uppercase tracking-widest text-tm-ink-soft">
            Sessions
          </span>
          {activeWorkspaceId && (
            <span className="font-mono text-[10px] leading-[14px] px-1.5 rounded bg-tm-4 text-tm-ink-strong font-semibold">
              {scoped.length}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-1 space-y-1 scrollbar-thin">
        {!activeWorkspaceId ? (
          <p className="px-2 py-6 text-[12px] leading-4 text-tm-ink-dim text-center">
            Select a workspace to see its sessions.
          </p>
        ) : scoped.length === 0 ? (
          <p className="px-2 py-6 text-[12px] leading-4 text-tm-ink-dim text-center">
            No shells open here. Launch one from the repo drawer, or press ⌘T.
          </p>
        ) : scoped.map(session => (
          <SessionCard
            key={session.id}
            session={session}
            active={session.id === activeSessionId}
            onFocus={() => focusSession(session.id)}
            onRename={title => void renameSession(session.id, title)}
          />
        ))}
      </div>

      <div className="p-1 bg-tm-1 flex flex-col gap-1 shrink-0">
        <button
          type="button"
          onClick={onQuickSwitch}
          className="w-full flex items-center justify-between px-2 py-1.5 rounded bg-tm-2 hover:bg-tm-3 text-tm-ink text-[12px] leading-4 transition-colors border-none cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Command size={16} className="text-tm-ink-dim" aria-hidden="true" />
            <span>Quick Switcher</span>
          </span>
          <kbd className="font-mono text-[10px] leading-[14px] px-1 rounded bg-tm-0 text-tm-ink-dim">⌃Tab</kbd>
        </button>
        <button
          type="button"
          disabled={scoped.length === 0}
          onClick={() => activeWorkspaceId && void killWorkspaceSessions(activeWorkspaceId)}
          className="w-full flex items-center justify-center gap-1 py-1 rounded text-tm-err hover:bg-tm-2 disabled:opacity-40 text-[10px] leading-[14px] font-semibold uppercase tracking-wider transition-colors bg-transparent border-none cursor-pointer"
        >
          <X size={14} aria-hidden="true" />
          <span>Kill all in workspace</span>
        </button>
      </div>
    </aside>
  )
}
