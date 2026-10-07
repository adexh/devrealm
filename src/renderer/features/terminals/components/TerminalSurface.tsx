import { useState } from 'react'
import type { TerminalSession } from '../types'
import { useTerminalAttach } from '../hooks/useTerminalAttach'
import { XtermHost } from '../../../components/XtermHost'
import { openExternalUrl } from '../ipc/external'

/**
 * The live terminal for one session. Keyed by session id by its parent, so
 * switching tabs disposes this instance and mounts a fresh one that replays
 * the daemon's snapshot. Background sessions therefore cost no renderer time.
 */
export function TerminalSurface({ session }: { session: TerminalSession }) {
  const [error, setError] = useState<string | null>(null)
  const { onReady, onResize } = useTerminalAttach(session.id, setError)

  return (
    <div className="flex-1 min-h-0 bg-tm-0 flex flex-col">
      {error && (
        <div className="px-3 py-2 bg-tm-2 text-tm-err text-[12px] leading-4 shrink-0">{error}</div>
      )}
      <div className="flex-1 min-h-0 p-2">
        <XtermHost onReady={onReady} onResize={onResize} onOpenLink={url => void openExternalUrl(url)} />
      </div>
    </div>
  )
}
