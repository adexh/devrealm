import { ArrowUpRight, SquareCode, Terminal, X } from 'lucide-react'
import type { IdeCapabilities } from '../../../../shared/ide'
import { Spinner } from '../../../components/Spinner'
import type { IdeActionKind, IdeWindowView } from '../types'

export function IdeWindowCard({ win, capabilities, busy, onFocus, onClose, onTerminal }: {
  win: IdeWindowView
  capabilities: IdeCapabilities
  busy: IdeActionKind | null
  onFocus: () => void
  onClose: () => void
  onTerminal: () => void
}) {
  const name = win.repoName ?? win.rootName ?? win.title
  const canFocus = Boolean(win.folderPath) || capabilities.focusByTitle
  const canTerminal = Boolean(win.folderPath)
  const focusHint = canFocus
    ? 'Bring this window to the front'
    : 'No folder to open and no Accessibility permission to raise it by title'

  return (
    <article
      onClick={canFocus && !busy ? onFocus : undefined}
      title={focusHint}
      aria-busy={busy !== null}
      className={canFocus
        ? 'group flex flex-col gap-1.5 p-3 rounded bg-tm-1 hover:bg-tm-2 border border-tm-line/40 cursor-pointer transition-colors'
        : 'group flex flex-col gap-1.5 p-3 rounded bg-tm-1 border border-tm-line/40 cursor-default'}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <SquareCode size={15} className="text-tm-ink-dim shrink-0" aria-hidden="true" />
          <span className="text-[13px] leading-[18px] font-semibold text-tm-ink truncate">{name}</span>
          {win.dirty && (
            <span className="font-mono text-[10px] leading-[14px] tracking-[0.2px] font-medium px-1.5 rounded bg-tm-3 text-tm-warn-dim shrink-0">
              UNSAVED
            </span>
          )}
          {!win.folderPath && (
            <span className="font-mono text-[10px] leading-[14px] tracking-[0.2px] font-medium px-1.5 rounded bg-tm-4 text-tm-ink-dim shrink-0">
              NO FOLDER
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {busy === 'focus' ? <Spinner size={14} /> : (
            <ArrowUpRight size={15} className="text-tm-ink-dim opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
          )}
        </div>
      </div>

      <p className="text-[12px] leading-4 text-tm-ink-soft truncate" title={win.title}>{win.title}</p>

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="font-mono text-[10px] leading-[14px] text-tm-ink-dim truncate" title={win.folderPath ?? undefined}>
          {win.folderLabel ?? 'folder unknown'}
        </span>
        <div className="flex items-center gap-1 shrink-0" onClick={event => event.stopPropagation()}>
          <button
            type="button"
            onClick={onTerminal}
            disabled={!canTerminal || busy !== null}
            title={canTerminal ? 'Open a DevRealm shell in this folder' : 'No folder to open a shell in'}
            className="flex items-center gap-1 px-2 py-1 rounded bg-tm-2 text-tm-ink-dim hover:bg-tm-3 hover:text-tm-ink-strong text-[11px] leading-4 transition-colors border-none cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            {busy === 'terminal' ? <Spinner size={12} /> : <Terminal size={13} aria-hidden="true" />}
            <span>Terminal</span>
          </button>
          {capabilities.close && (
            <button
              type="button"
              onClick={onClose}
              disabled={busy !== null}
              title="Close this window. VS Code will ask about unsaved changes."
              className="flex items-center gap-1 px-2 py-1 rounded bg-tm-2 text-tm-ink-dim hover:bg-tm-3 hover:text-tm-err text-[11px] leading-4 transition-colors border-none cursor-pointer disabled:opacity-40 disabled:cursor-default"
            >
              {busy === 'close' ? <Spinner size={12} /> : <X size={13} aria-hidden="true" />}
              <span>Close</span>
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
