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
