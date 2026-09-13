import os from 'os'

/**
 * Variables that must never reach a user's shell.
 *
 * The daemon itself runs with ELECTRON_RUN_AS_NODE=1. Without stripping it,
 * every shell inherits it and any `node` the user runs inside becomes Electron
 * in node mode, which fails in confusing, far-away ways.
 */
const STRIPPED_ENV_KEYS = [
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_NO_ATTACH_CONSOLE',
  'ELECTRON_FORCE_IS_PACKAGED',
  'NODE_OPTIONS',
  'NODE_CHANNEL_FD',
  'NODE_UNIQUE_ID',
  'GDK_BACKEND',
]

export function sanitizeEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base }
  for (const key of STRIPPED_ENV_KEYS) delete env[key]
  for (const key of Object.keys(env)) {
    if (key.startsWith('ELECTRON_')) delete env[key]
  }
  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  env.TERM_PROGRAM = 'DevRealm'
  return env
}

export function resolveShell(preferred?: string): string {
  if (preferred) return preferred
  if (process.platform === 'win32') {
    return process.env.COMSPEC ?? 'cmd.exe'
  }
  if (process.env.SHELL) return process.env.SHELL
  return process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash'
}

/**
 * A GUI-launched app does not inherit the PATH set by .zprofile, so pnpm, nvm
 * shims, pyenv and Homebrew binaries would all be missing. Starting a login
 * shell is what makes the terminal behave like the user's own.
 */
export function loginShellArgs(shell: string): string[] {
  if (process.platform === 'win32') return []
  const name = shell.split('/').pop() ?? ''
  if (name === 'fish') return ['--login', '--interactive']
  return ['-l', '-i']
}

export function resolveCwd(requested: string): string {
  return requested && requested.length > 0 ? requested : os.homedir()
}
