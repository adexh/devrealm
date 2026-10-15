import { ExternalLink } from 'lucide-react'
import { SHORTCUTS } from '../constants'
import { openExternalUrl } from '../ipc/external'

export function TerminalShortcutBar({ boundPort }: { boundPort?: number }) {
  const url = boundPort ? `http://localhost:${boundPort}` : null

  return (
    <div className="h-9 px-3 bg-tm-1 flex items-center justify-between shrink-0 gap-4">
      <div className="flex items-center gap-3 font-mono text-[10px] leading-[14px] text-tm-ink-dim overflow-x-auto scrollbar-none">
        {SHORTCUTS.map(shortcut => (
          <span key={shortcut.keys} className="flex items-center gap-1 shrink-0">
            <kbd className={shortcut.danger
              ? 'px-1 rounded bg-tm-2 text-tm-err'
              : 'px-1 rounded bg-tm-2 text-tm-ink'}
            >
              {shortcut.keys}
            </kbd>
            {shortcut.label}
          </span>
        ))}
      </div>

      {url && (
        <button
          type="button"
          onClick={() => void openExternalUrl(url)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-tm-3 hover:bg-tm-5 text-tm-ink-strong font-mono text-[11px] leading-4 font-medium transition-colors shrink-0 border-none cursor-pointer"
        >
          <span className="w-2 h-2 rounded-full bg-tm-ok" aria-hidden="true" />
          <span>{url}</span>
          <ExternalLink size={13} className="text-tm-ok-dim" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
