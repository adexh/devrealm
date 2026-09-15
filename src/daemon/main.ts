import os from 'os'
import path from 'path'
import { Registry } from './registry'
import { Server } from './server'

/**
 * Daemon entrypoint. Logs go to stderr; stdout stays dark so it can carry a
 * protocol later without a stray console.log corrupting it.
 */
function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`
  const match = process.argv.find(argument => argument.startsWith(prefix))
  return match?.slice(prefix.length)
}

async function start(): Promise<void> {
  const socketPath = parseArg('socket')
  const dataDir = parseArg('data-dir') ?? path.join(os.homedir(), '.workspace-manager', 'terminals')
  if (!socketPath) {
    process.stderr.write('[pty-daemon] --socket=<path> is required\n')
    process.exit(2)
    return
  }

  const registry = new Registry(dataDir)
  const server = new Server(socketPath, registry, parseArg('build-id') ?? '')

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => server.shutdown(0))
  }
  process.on('uncaughtException', error => {
    process.stderr.write(`[pty-daemon] uncaught: ${String(error)}\n`)
  })

  await server.listen()
  process.stderr.write(`[pty-daemon] listening on ${socketPath} (pid ${process.pid})\n`)
}

void start()
