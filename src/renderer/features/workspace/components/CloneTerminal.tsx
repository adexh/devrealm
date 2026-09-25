import React, { useImperativeHandle, useRef } from 'react'
import type { Terminal } from '@xterm/xterm'
import { XtermHost, type XtermHandle } from '../../../components/XtermHost'

export interface CloneTerminalHandle {
  write: (data: string) => void
  reset: () => void
}

/**
 * Read-only view of git clone output.
 *
 * Shares the terminal host with the Terminals feature rather than standing up
 * its own xterm, so theming, addon loading and disposal live in one place.
 */
export const CloneTerminal = React.forwardRef<CloneTerminalHandle>((_, ref) => {
  const terminalRef = useRef<Terminal | null>(null)

  function handleReady(handle: XtermHandle) {
    terminalRef.current = handle.terminal
    return () => { terminalRef.current = null }
  }

  useImperativeHandle(ref, () => ({
    write: (data) => {
      // Normalize bare \n to \r\n so newlines render correctly, while leaving
      // bare \r untouched, since git uses \r alone to overwrite the progress line.
      terminalRef.current?.write(data.replace(/\r?\n/g, '\r\n'))
    },
    reset: () => terminalRef.current?.reset(),
  }))

  return (
    <div className="h-36 rounded overflow-hidden border border-t-line">
      <XtermHost readOnly scrollback={500} fontSize={11} onReady={handleReady} />
    </div>
  )
})

CloneTerminal.displayName = 'CloneTerminal'
