import { SquareCode, Terminal, X } from 'lucide-react'
import type { IdeCapabilities } from '../../../../shared/ide'
import { Spinner } from '../../../components/Spinner'
import type { IdeActionKind, IdeWindowRow } from '../types'

export function IdeWindowTableRow({ row, capabilities, closeUnavailableReason, busy, onFocus, onClose, onTerminal }: {
  row: IdeWindowRow
  capabilities: IdeCapabilities
  closeUnavailableReason: string | null
  busy: IdeActionKind | null
  onFocus: () => void
  onClose: () => void
  onTerminal: () => void
}) {
  const name = row.repoName ?? row.rootName ?? row.title
  const canFocus = Boolean(row.openPath) || capabilities.focusByTitle
  const canTerminal = Boolean(row.folderPath)

  return (
    <tr
      onClick={canFocus && !busy ? onFocus : undefined}
      aria-busy={busy !== null}
      title={canFocus ? 'Bring this window to the front' : 'No folder to open and no Accessibility permission to raise it by title'}
      className={canFocus
        ? 'border-b border-tm-line/20 hover:bg-tm-1 cursor-pointer transition-colors'
        : 'border-b border-tm-line/20 cursor-default'}
    >
      <td className="px-3 py-2 max-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {busy === 'focus'
            ? <Spinner size={13} />
            : <SquareCode size={14} className="text-tm-ink-dim shrink-0" aria-hidden="true" />}
          <span className="text-[13px] leading-[18px] font-medium text-tm-ink truncate">{name}</span>
          {row.dirty && (
            <span
              title="Unsaved changes in this window"
              className="w-1.5 h-1.5 rounded-full bg-tm-warn-dim shrink-0"
            />
          )}
          {row.ambiguous && (
            <span
              title="More than one known folder has this name, so no path was chosen. Actions that need a path are off."
              className="font-mono text-[10px] leading-[14px] px-1 rounded bg-tm-3 text-tm-warn-dim shrink-0"
            >
              AMB
            </span>
          )}
        </div>
      </td>

      <td className="px-3 py-2 max-w-0">
        <span className="block text-[12px] leading-4 text-tm-ink-soft truncate">{row.workspaceName}</span>
      </td>

      <td className="px-3 py-2 max-w-0 hidden xl:table-cell">
        <span className="block text-[12px] leading-4 text-tm-ink-dim truncate" title={row.title}>{row.title}</span>
      </td>

      <td className="px-3 py-2 max-w-0 hidden lg:table-cell">
        <span className="block font-mono text-[11px] leading-4 text-tm-ink-dim truncate" title={row.folderPath ?? undefined}>
          {row.folderLabel ?? 'folder unknown'}
        </span>
      </td>

      <td className="px-3 py-1.5 whitespace-nowrap text-right" onClick={event => event.stopPropagation()}>
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={onTerminal}
            disabled={!canTerminal || busy !== null}
            title={canTerminal ? 'Open a DevRealm shell in this folder' : 'No folder to open a shell in'}
            className="inline-flex items-center justify-center h-6 w-6 rounded text-tm-ink-dim hover:bg-tm-3 hover:text-tm-ink-strong transition-colors bg-transparent border-none cursor-pointer disabled:opacity-30 disabled:cursor-default"
          >
            {busy === 'terminal' ? <Spinner size={12} /> : <Terminal size={14} aria-hidden="true" />}
            <span className="sr-only">Open a terminal here</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={!capabilities.close || busy !== null}
            title={closeUnavailableReason ?? 'Close this window. VS Code will ask about unsaved changes.'}
            className="inline-flex items-center justify-center h-6 w-6 rounded text-tm-ink-dim hover:bg-tm-3 hover:text-tm-err transition-colors bg-transparent border-none cursor-pointer disabled:opacity-30 disabled:cursor-default"
          >
            {busy === 'close' ? <Spinner size={12} /> : <X size={14} aria-hidden="true" />}
            <span className="sr-only">Close this window</span>
          </button>
        </div>
      </td>
    </tr>
  )
}
