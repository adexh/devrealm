import os from 'os'

/**
 * Variables that must never reach a user's shell.
 *
 * The daemon inherits its environment from whatever launched DevRealm, and
 * passes it to every shell. Three families have to be dropped:
 *
 * 1. ELECTRON_RUN_AS_NODE, which the daemon itself runs with. Left in place,
 *    any `node` the user runs becomes Electron in node mode.
 * 2. The launching tool's *session* state. Start DevRealm from a Claude Code
 *    session in VS Code and its shells inherit CLAUDE_CODE_CHILD_SESSION,
 *    CLAUDE_CODE_MESSAGING_TOKEN, VSCODE_IPC_HOOK and about twenty more. Tools
 *    then believe they are running inside that session: `claude` turns off
 *    transcript saving, and a session token sits in the environment of every
 *    command the user runs.
 * 3. Terminal identity from the parent emulator, which now describes the wrong
 *    terminal.
 *
 * Stripping is safe because shells start as login and interactive shells, so
 * anything the user actually configured in their profile is set again. Only
 * state injected at launch is lost, which is exactly the state we want gone.
 *
 * User *configuration* is deliberately kept: ANTHROPIC_API_KEY and
 * CLAUDE_CONFIG_DIR are settings, not session markers.
 */
const STRIPPED_ENV_KEYS = [
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_NO_ATTACH_CONSOLE',
  'ELECTRON_FORCE_IS_PACKAGED',
  'NODE_OPTIONS',
  'NODE_CHANNEL_FD',
  'NODE_UNIQUE_ID',
  'GDK_BACKEND',
  'CLAUDECODE',
  'CLAUDE_PID',
  'CLAUDE_EFFORT',
  'CLAUDE_PLUGIN_DATA',
  'CLAUDE_AGENT_SDK_VERSION',
  'GIT_ASKPASS',
  'TERM_SESSION_ID',
  'ITERM_SESSION_ID',
  'ITERM_PROFILE',
]

const STRIPPED_ENV_PREFIXES = ['ELECTRON_', 'CLAUDE_CODE_', 'VSCODE_']

export function sanitizeEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base }
  for (const key of STRIPPED_ENV_KEYS) delete env[key]
  for (const key of Object.keys(env)) {
    if (STRIPPED_ENV_PREFIXES.some(prefix => key.startsWith(prefix))) delete env[key]
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
