import React, { useEffect, useImperativeHandle, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

export interface CloneTerminalHandle {
  write: (data: string) => void
  reset: () => void
}

export const CloneTerminal = React.forwardRef<CloneTerminalHandle>((_, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)

  useEffect(() => {
    const term = new Terminal({
      rows: 9,
      cols: 60,
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        selectionBackground: '#264f78',
        cursor: '#c9d1d9',
      },
      fontFamily: '"Menlo", "Monaco", "Courier New", monospace',
      fontSize: 11,
      lineHeight: 1.4,
      convertEol: false,
      disableStdin: true,
      cursorBlink: false,
      scrollback: 500,
    })
    termRef.current = term
    if (containerRef.current) term.open(containerRef.current)
    return () => { term.dispose(); termRef.current = null }
  }, [])

  useImperativeHandle(ref, () => ({
    write: (data) => {
      if (!termRef.current) return
      // Normalize bare \n to \r\n so newlines render correctly, while leaving
      // bare \r untouched — git uses \r alone to overwrite the progress line.
      termRef.current.write(data.replace(/\r?\n/g, '\r\n'))
    },
    reset: () => termRef.current?.reset(),
  }))

  return <div ref={containerRef} className="rounded overflow-hidden border border-t-line" />
})

CloneTerminal.displayName = 'CloneTerminal'
