import { useState } from 'react'
import { ChevronDown, ChevronRight, FolderOpen, Layers } from 'lucide-react'
import type { IdeCapabilities } from '../../../../shared/ide'
import type { IdeActionState, IdeUnopenedRepo, IdeWindowGroup, IdeWindowView } from '../types'
import { IdeUnopenedRepoRow } from './IdeUnopenedRepoRow'
import { IdeWindowCard } from './IdeWindowCard'

export function IdeWorkspaceGroup({ group, capabilities, action, onFocus, onClose, onTerminal, onOpenRepo }: {
  group: IdeWindowGroup
  capabilities: IdeCapabilities
  action: IdeActionState | null
  onFocus: (win: IdeWindowView) => void
  onClose: (win: IdeWindowView) => void
  onTerminal: (win: IdeWindowView) => void
  onOpenRepo: (target: IdeUnopenedRepo) => void
}) {
  // The "not open" list is the point when you are mid-task in a workspace, and
  // noise when the workspace is idle, so it starts open only where windows are.
  const [unopenedOpen, setUnopenedOpen] = useState(group.windows.length > 0)
  const isOther = group.workspaceId === null

  return (
    <section className="space-y-2">
      <header className="flex items-center gap-2 min-w-0">
        {isOther
          ? <Layers size={15} className="text-tm-ink-dim shrink-0" aria-hidden="true" />
          : <FolderOpen size={15} className="text-tm-ink-dim shrink-0" aria-hidden="true" />}
        <h2 className="text-[14px] leading-5 font-semibold text-tm-ink truncate">{group.name}</h2>
        <span className="font-mono text-[10px] leading-[14px] px-1.5 rounded bg-tm-2 text-tm-ink-dim shrink-0">
          {group.windows.length} {group.windows.length === 1 ? 'window' : 'windows'}
        </span>
        {isOther && (
          <span className="text-[11px] leading-4 text-tm-ink-dim truncate">
            Folders no workspace tracks, and windows with no folder
          </span>
        )}
      </header>

      {group.windows.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {group.windows.map(win => (
            <IdeWindowCard
              key={win.id}
              win={win}
              capabilities={capabilities}
              busy={action?.targetId === win.id ? action.kind : null}
              onFocus={() => onFocus(win)}
              onClose={() => onClose(win)}
              onTerminal={() => onTerminal(win)}
            />
          ))}
        </div>
      )}

      {group.unopened.length > 0 && (
        <div className="rounded bg-tm-1/60 border border-tm-line/30">
          <button
            type="button"
            onClick={() => setUnopenedOpen(open => !open)}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-left bg-transparent border-none cursor-pointer text-tm-ink-soft hover:text-tm-ink-strong"
          >
            {unopenedOpen
              ? <ChevronDown size={14} aria-hidden="true" />
              : <ChevronRight size={14} aria-hidden="true" />}
            <span className="text-[12px] leading-4 font-medium">Not open in {group.name}</span>
            <span className="font-mono text-[10px] leading-[14px] px-1.5 rounded bg-tm-2 text-tm-ink-dim">{group.unopened.length}</span>
          </button>
          {unopenedOpen && (
            <ul className="border-t border-tm-line/30">
              {group.unopened.map(target => (
                <IdeUnopenedRepoRow
                  key={target.repo.id}
                  target={target}
                  busy={action?.kind === 'open' && action.targetId === target.repo.id}
                  onOpen={() => onOpenRepo(target)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
