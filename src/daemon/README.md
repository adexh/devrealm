# DevRealm PTY daemon

Long-lived process that owns every terminal PTY. The Electron main process is a
client over a Unix socket, so quitting or updating the app does not kill shells.

Runs under `process.execPath` with `ELECTRON_RUN_AS_NODE=1`, the app's own
Electron binary in Node mode. That keeps the native `node-pty` ABI matched and
ships no second runtime.

```
main.ts       entrypoint: parse --socket, install signal handlers, listen
server.ts     accept loop, handshake, frame dispatch
connection.ts per-client state: ref allocation, subscriptions
session.ts    one PTY + headless xterm + flow control + output coalescing
registry.ts   session map, manifest persistence, reaping
```

Imports nothing from `src/main` or `src/renderer`. Shares only
`src/shared/node/terminalProtocol.ts`, `src/shared/terminalConstants.ts` and
`src/shared/terminal.ts`.
