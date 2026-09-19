import { FolderOpen, Layers } from 'lucide-react'
import type { IdeCapabilities } from '../../../../shared/ide'
import type { IdeActionState, IdeWindowGroup, IdeWindowView } from '../types'
import { IdeWindowCard } from './IdeWindowCard'

export function IdeWorkspaceGroup({ group, capabilities, closeUnavailableReason, action, onFocus, onClose, onTerminal }: {
  group: IdeWindowGroup
  capabilities: IdeCapabilities
  closeUnavailableReason: string | null
  action: IdeActionState | null
  onFocus: (win: IdeWindowView) => void
  onClose: (win: IdeWindowView) => void
  onTerminal: (win: IdeWindowView) => void
}) {
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {group.windows.map(win => (
          <IdeWindowCard
            key={win.id}
            win={win}
            capabilities={capabilities}
            closeUnavailableReason={closeUnavailableReason}
            busy={action?.targetId === win.id ? action.kind : null}
            onFocus={() => onFocus(win)}
            onClose={() => onClose(win)}
            onTerminal={() => onTerminal(win)}
          />
        ))}
      </div>
    </section>
  )
}
