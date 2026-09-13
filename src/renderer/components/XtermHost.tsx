import { useEffect, useRef } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'

/**
 * Reads the workbench tokens from CSS so the terminal follows the app's
 * light and dark themes instead of hardcoding a palette.
 */
/**
 * Reads the workbench tokens from CSS so the terminal follows the app's light
 * and dark themes.
 *
 * Must be given an element inside the themed subtree. The app puts its `dark`
 * class on a div in App.tsx, not on <html>, so reading from documentElement
 * silently returns the light palette no matter which theme is active.
 */
export function readTerminalTheme(scope: Element): ITheme {
  const styles = getComputedStyle(scope)
  const token = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback

  return {
    background: token('--tm-0', '#0e0e0e'),
    foreground: token('--tm-ink', '#e5e2e1'),
    cursor: token('--tm-ink-strong', '#ffffff'),
    cursorAccent: token('--tm-0', '#0e0e0e'),
    selectionBackground: token('--tm-4', '#353534'),
    black: token('--tm-2', '#201f1f'),
    red: token('--tm-err', '#ffb4ab'),
    green: token('--tm-ok', '#8efa98'),
    yellow: token('--tm-warn', '#fbbf24'),
    blue: '#7aa2f7',
    magenta: '#bb9af7',
    cyan: '#7dcfff',
    white: token('--tm-ink', '#e5e2e1'),
    brightBlack: token('--tm-ink-dim', '#8f918c'),
    brightRed: token('--tm-err', '#ffb4ab'),
    brightGreen: token('--tm-ok-dim', '#72dd7e'),
    brightYellow: token('--tm-warn-dim', '#fcd34d'),
    brightBlue: '#9eb8ff',
    brightMagenta: '#d0b0ff',
    brightCyan: '#a4dcff',
    brightWhite: token('--tm-ink-strong', '#ffffff'),
  }
}

export type XtermHandle = {
  terminal: Terminal
  fit: () => { cols: number; rows: number }
}

/**
 * Mounts an xterm instance into a container and hands it back once.
 *
 * The terminal deliberately lives outside React state: output never triggers a
 * render, and only the visible session has a live instance at all.
 */
export function XtermHost({ readOnly = false, scrollback = 5000, fontSize = 12, onReady, onResize }: {
  readOnly?: boolean
  scrollback?: number
  fontSize?: number
  onReady: (handle: XtermHandle) => void | (() => void)
  onResize?: (cols: number, rows: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onReadyRef = useRef(onReady)
  const onResizeRef = useRef(onResize)
  onReadyRef.current = onReady
  onResizeRef.current = onResize

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let appliedTheme = readTerminalTheme(container)
    const terminal = new Terminal({
      theme: appliedTheme,
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      fontSize,
      lineHeight: 1.35,
      cursorBlink: !readOnly,
      disableStdin: readOnly,
      scrollback,
      allowProposedApi: true,
      convertEol: false,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(container)

    // WebGL is the single biggest renderer win; fall back silently if the
    // context cannot be created or is lost later.
    let webgl: WebglAddon | null = null
    try {
      webgl = new WebglAddon()
      webgl.onContextLoss(() => { webgl?.dispose(); webgl = null })
      terminal.loadAddon(webgl)
    } catch {
      webgl = null
    }

    function fit() {
      try { fitAddon.fit() } catch { /* container not laid out yet */ }
      return { cols: terminal.cols, rows: terminal.rows }
    }

    fit()
    const cleanup = onReadyRef.current({ terminal, fit })

    // Debounced, because fit() forces layout and a window drag fires constantly.
    let resizeTimer: number | undefined
    // The theme toggle flips a class on an ancestor div, which changes the
    // resolved custom properties without remounting this component.
    const themeObserver = new MutationObserver(() => {
      const next = readTerminalTheme(container)
      if (next.background === appliedTheme.background) return
      appliedTheme = next
      terminal.options.theme = next
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
    })

    let torndown = false
    const observer = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        if (torndown) return
        const size = fit()
        onResizeRef.current?.(size.cols, size.rows)
      }, 50)
    })
    observer.observe(container)

    // Each step is guarded: a throw here happens during React unmount and
    // would take the whole tree down with it.
    return () => {
      torndown = true
      window.clearTimeout(resizeTimer)
      try { observer.disconnect() } catch { /* already disconnected */ }
      try { themeObserver.disconnect() } catch { /* already disconnected */ }
      try { cleanup?.() } catch { /* consumer cleanup failed */ }
      try { webgl?.dispose() } catch { /* context already lost */ }
      try { terminal.dispose() } catch { /* already disposed */ }
    }
    // Re-creating the terminal on prop changes would lose scrollback, so this
    // intentionally mounts once per component instance.
     
  }, [])

  return <div ref={containerRef} className="w-full h-full" />
}
