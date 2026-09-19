import type { IdeProcessKind, IdeWindowSource } from '../../../../shared/ide'

/**
 * Accessibility listing is a ~100 ms AppleScript, so it can run often. The CLI
 * fallback walks every open folder and is cached for 10 s in main, so polling
 * it faster only returns the cache with fresh process numbers.
 */
export const POLL_INTERVAL_MS: Record<IdeWindowSource, number> = {
  accessibility: 3_000,
  cli: 10_000,
  none: 15_000,
}

/** A window or process takes a moment to appear or vanish after an action. */
export const POST_ACTION_REFRESH_DELAY_MS = 1_200

export const PROCESS_KIND_LABEL: Record<IdeProcessKind, string> = {
  main: 'Main process',
  renderer: 'Windows and webviews',
  'extension-host': 'Extension hosts',
  gpu: 'GPU',
  utility: 'Helpers',
  child: 'Spawned by extensions',
}

export const PROCESS_KIND_HINT: Record<IdeProcessKind, string> = {
  main: 'The one process that owns every window.',
  renderer: 'One per window, plus one per isolated webview, so this count runs above the window count.',
  'extension-host': 'One per window. Extensions run here, so this is where a heavy extension shows up.',
  gpu: 'Compositing for every window.',
  utility: 'Shared process, terminal host, file watchers, network.',
  child: 'Language servers, shells, agents and anything else an extension started.',
}

export const VSCODE_INSTALL_URL = 'https://code.visualstudio.com'

export const OTHER_GROUP_KEY = '__other__'
