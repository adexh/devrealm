import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import * as store from '../store'

export const VSCODE_BUNDLE_ID = 'com.microsoft.VSCode'
export const VSCODE_APP_NAMES = ['Code', 'Visual Studio Code']
const MAC_BUNDLE_NAME = 'Visual Studio Code.app'
const MAC_CLI_IN_BUNDLE = 'Contents/Resources/app/bin/code'
const STATUS_TIMEOUT_MS = 30_000

/** The `.app` path out of a running executable's command line, translocated or not. */
export function bundleFromExecutable(command: string): string | null {
  const marker = `${MAC_BUNDLE_NAME}/Contents/MacOS/`
  const index = command.indexOf(marker)
  return index === -1 ? null : command.slice(0, index + MAC_BUNDLE_NAME.length)
}

function cliCandidates(mainCommand: string | null): string[] {
  if (process.platform === 'darwin') {
    const bundle = mainCommand ? bundleFromExecutable(mainCommand) : null
    return [
      ...(bundle ? [path.join(bundle, MAC_CLI_IN_BUNDLE)] : []),
      path.join('/Applications', MAC_BUNDLE_NAME, MAC_CLI_IN_BUNDLE),
      path.join(os.homedir(), 'Applications', MAC_BUNDLE_NAME, MAC_CLI_IN_BUNDLE),
      '/usr/local/bin/code',
      '/opt/homebrew/bin/code',
    ]
  }
  if (process.platform === 'win32') {
    const editor = store.getEditorSettings().editors.find(item => item.id === 'vscode')
    return (editor?.windowsExecutablePaths ?? []).flatMap(candidate => {
      const exe = 'absolutePath' in candidate
        ? candidate.absolutePath ?? ''
        : path.join(process.env[candidate.env] ?? '', ...candidate.segments)
      return exe ? [path.join(path.dirname(exe), 'bin', 'code.cmd')] : []
    })
  }
  return [
    '/usr/share/code/bin/code',
    '/usr/bin/code',
    '/snap/bin/code',
    '/var/lib/flatpak/exports/bin/com.visualstudio.code',
    path.join(os.homedir(), '.local/bin/code'),
  ]
}

function onPath(name: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue
    const candidate = path.join(dir, name)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

/**
 * The bundle of the running process is tried first so a VS Code launched from
 * a Downloads folder, or through App Translocation, is found where it runs.
 * PATH comes last: a GUI-launched app rarely has a useful one.
 */
export function resolveVsCodeCli(mainCommand: string | null): string | null {
  const found = cliCandidates(mainCommand).find(candidate => fs.existsSync(candidate))
  if (found) return found
  return onPath(process.platform === 'win32' ? 'code.cmd' : 'code')
}

/**
 * The CLI is a shell script that forwards to a remote CLI whenever
 * VSCODE_IPC_HOOK_CLI is set, which it is inside a VS Code terminal. Strip the
 * whole family so `npm run dev` from such a terminal still talks to the desktop
 * instance and not to one window's extension host.
 */
function cliEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('VSCODE_') || key.startsWith('ELECTRON_')) continue
    env[key] = value
  }
  return env
}

function runCli(cli: string, args: string[], timeout: number): Promise<string> {
  const command = process.platform === 'win32' ? 'cmd.exe' : cli
  const fullArgs = process.platform === 'win32' ? ['/c', cli, ...args] : args
  return new Promise((resolve, reject) => {
    execFile(command, fullArgs, { env: cliEnv(), timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const detail = (stderr || error.message).trim().split('\n')[0]
        reject(new Error(`VS Code CLI failed: ${detail}`))
        return
      }
      resolve(stdout)
    })
  })
}

/** Only the `Workspace Stats` block is trusted; see docs/ides-implementation.md. */
export function parseStatusWindowTitles(output: string): string[] {
  const titles: string[] = []
  for (const line of output.split('\n')) {
    const match = line.match(/^\|\s{2}Window \((.*)\)\s*$/)
    if (match) titles.push(match[1])
  }
  return titles
}

/** Never call this without a running instance: `--status` starts one. */
export async function readStatusWindowTitles(cli: string): Promise<string[]> {
  return parseStatusWindowTitles(await runCli(cli, ['--status'], STATUS_TIMEOUT_MS))
}

/** VS Code reuses the window that already has the folder open, which is how focus works without Accessibility. */
export async function openFolderWithCli(cli: string, folderPath: string): Promise<void> {
  await runCli(cli, [folderPath], 15_000)
}
