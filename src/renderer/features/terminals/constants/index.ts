import type { PaneZone } from '../../../stores/terminalLayout'
import type { SessionState, StatTone } from '../types'

export const STATE_LABEL: Record<SessionState, string> = {
  booting: 'BOOTING',
  running: 'RUNNING',
  working: 'WORKING',
  idle: 'IDLE',
  exited: 'EXITED',
  failed: 'FAILED',
}

export const STATE_TONE: Record<SessionState, StatTone> = {
  booting: 'dim',
  running: 'ok',
  working: 'warn',
  idle: 'dim',
  exited: 'dim',
  failed: 'err',
}

/** States where the shell is actively producing output. */
export const BUSY_STATES: SessionState[] = ['booting', 'running', 'working']

export type ShortcutHint = { keys: string; label: string; danger?: boolean }

export const SHORTCUTS: ShortcutHint[] = [
  { keys: '⌃L', label: 'Clear' },
  { keys: '⌘\\', label: 'Split' },
  { keys: '⌥↑', label: 'Prev Tab' },
  { keys: '⌥↓', label: 'Next Tab' },
  { keys: '⌘C', label: 'Interrupt', danger: true },
]

export const DEFAULT_SHELL = 'zsh'

/** Folder names never offered as launch targets. */
export const IGNORED_DIR_NAMES = [
  'node_modules',
  '.git',
  '.venv',
  '.venv312',
  '.obsidian',
  '.claude',
  'dist',
  'build',
]

export const RAIL_WIDTH = { min: 180, max: 460, default: 256 } as const
export const DRAWER_WIDTH = { min: 200, max: 520, default: 288 } as const

export const SPLIT_RATIO = { min: 0.1, max: 0.9 } as const

/** A drag needs some payload to start; what is dragged is tracked in the store. */
export const SESSION_DRAG_TYPE = 'application/x-devrealm-session'

export const DROP_PREVIEW_CLASS: Record<PaneZone, string> = {
  center: 'absolute pointer-events-none rounded-md bg-tm-ok/20 border-2 border-tm-ok/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.4),inset_0_0_32px_color-mix(in_srgb,var(--tm-ok)_45%,transparent)] transition-all duration-150 ease-out inset-1',
  left: 'absolute pointer-events-none rounded-md bg-tm-ok/20 border-2 border-tm-ok/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.4),inset_0_0_32px_color-mix(in_srgb,var(--tm-ok)_45%,transparent)] transition-all duration-150 ease-out inset-y-1 left-1 w-[calc(50%-0.375rem)]',
  right: 'absolute pointer-events-none rounded-md bg-tm-ok/20 border-2 border-tm-ok/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.4),inset_0_0_32px_color-mix(in_srgb,var(--tm-ok)_45%,transparent)] transition-all duration-150 ease-out inset-y-1 right-1 w-[calc(50%-0.375rem)]',
  top: 'absolute pointer-events-none rounded-md bg-tm-ok/20 border-2 border-tm-ok/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.4),inset_0_0_32px_color-mix(in_srgb,var(--tm-ok)_45%,transparent)] transition-all duration-150 ease-out inset-x-1 top-1 h-[calc(50%-0.375rem)]',
  bottom: 'absolute pointer-events-none rounded-md bg-tm-ok/20 border-2 border-tm-ok/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.4),inset_0_0_32px_color-mix(in_srgb,var(--tm-ok)_45%,transparent)] transition-all duration-150 ease-out inset-x-1 bottom-1 h-[calc(50%-0.375rem)]',
}

export { HOME_WORKSPACE_ID, HOME_WORKSPACE_NAME } from '../../../constants'
