# Terminals

Everything a developer or coding agent needs to work on the Terminals feature:
what it does, how it is built, and the traps that already caught someone.

Visual reference: [terminals-ui-design.html](./terminals-ui-design.html).

---

## 1. What it is

The problem: opening a terminal in the right place is manual work. You read a
path, you `cd`, you `cd ..`, you `cd` again, and only then start doing the thing
you opened the terminal for. **The navigation is the friction, not the terminal.**

DevRealm already knows where every repo lives, so a terminal there should be one
click. Shells also outlive the app, so quitting DevRealm does not kill a running
build.

### The model

```
Workspace          a registered root folder, and the scope for the whole screen
  └─ Repo          a directory inside it, already tracked by the app
       └─ Session  one shell, already sitting in that repo
```

Workspace is the top-level scope. Tabs across the top are the **open** workspaces,
one earning a tab by having a shell in it. Everything else follows the selected
tab: the left rail lists its sessions, the right drawer lists its repos, the
centre shows its terminal. Nothing is selected on first open, so the centre shows
a picker of every registered workspace.

### Entry points

| Path | Where |
|---|---|
| Repo row in the workspace screen | a terminal button left of the `open` control |
| Right drawer | click a repo, or its `+ Launch` on hover |
| `⌘T` | another shell in the current repo |
| Workspace picker | pick a workspace, then either of the above |

### Shortcuts

`⌘1` rail, `⌘B` drawer, `⌘T` new shell, `⌥↑` / `⌥↓` cycle tabs, `/` focus the
drawer filter, `⌘⇧T` reach the Terminals tab.

---

## 2. Architecture

```
DevRealm.app  (Electron main + renderer)      quit this, shells keep running
     │  AF_UNIX socket, ~/.workspace-manager/term.sock, mode 0600
     ▼
drtermd  (one per user, detached)
     ├── /bin/zsh -l -i   ← a real shell, cwd = repo A
     ├── /bin/zsh -l -i   ← a real shell, cwd = repo B
     └── /bin/zsh -l -i
```

One **daemon** per user, not one per terminal. Each **terminal is an ordinary
shell session**: a node-pty PTY with the user's login shell as its child.

### Why a daemon

Electron main dies with the app. The requirement is that a build or an agent
survives quitting DevRealm, and that reopening reattaches to the live shell. Only
an out-of-process, detached owner gives that.

This is **VS Code's pty host running on tmux's process model**. The persistence
and flow-control machinery is VS Code's; VS Code's pty host is a child of main
and dies with it, so the lifecycle comes from tmux instead.

### Why it runs under `process.execPath`

```ts
spawn(process.execPath, [daemonEntry, ...], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  detached: true, stdio: 'ignore',
}).unref()
```

Three reasons, all load-bearing:

- **ABI match.** node-pty is compiled against Electron's ABI. Running it under
  the app's own Electron binary in Node mode guarantees the same ABI.
- **No extra runtime.** The binary is already in the bundle.
- **Code signing.** On macOS the executable is inside the signed, notarised app
  bundle, so nothing extra needs signing.

---

## 3. Wire protocol

`src/shared/node/terminalProtocol.ts`. One socket carries every frame. Control
operations use a JSON frame type; PTY bytes use a binary one, so JSON never
appears on the data path.

```
 0        1        2            4                8
 +--------+--------+------------+----------------+-------------+
 | type   | rsvd   | ref u16 LE | length u32 LE  |  payload    |
 +--------+--------+------------+----------------+-------------+
```

`ref` is a u16 handle assigned at attach. Session ids never appear on the hot
path: a 36-byte uuid alongside a 1-byte keystroke is pure waste.

| Frame | Direction | Payload |
|---|---|---|
| `Hello` / `HelloAck` | both | JSON, version negotiation |
| `ControlRequest` / `ControlResponse` | both | JSON, see below |
| `ControlEvent` | daemon to client | JSON, `sessions-changed` |
| `Data` | daemon to client | raw pty output |
| `Input` | client to daemon | raw stdin |
| `Resize` | client to daemon | `u16 cols`, `u16 rows` |
| `Ack` | client to daemon | `u32 charCount`, flow control |
| `Snapshot` | daemon to client | serialised screen and scrollback |
| `Exit` | daemon to client | `i32 exitCode` |

Control operations: `list`, `open`, `close`, `rename`, `attach`, `detach`.

The socket's file mode `0600` is the entire auth boundary. No in-band tokens:
the daemon trusts whoever can open the socket.

---

## 4. Data plane

**PTY bytes never touch `ipcMain`.** `terminals:attach` creates a
`MessageChannelMain`, keeps port1 in main, and hands port2 to the renderer. After
that, input, output, resize and acks all ride that port, so terminal traffic does
not serialise behind the rest of the app's IPC. The main-side pump routes frames
by `ref` and never decodes one.

Port messages, main to renderer: `{t:'snapshot'|'data', b:Uint8Array}`,
`{t:'exit', code}`. Renderer to main: `{t:'input', b}`, `{t:'resize', cols, rows}`,
`{t:'ack', chars}`.

### Flow control

Ack-based, using VS Code's `FlowControlConstants` verbatim. **Do not retune these
without measuring.**

```
HighWatermarkChars = 100000   // pause the pty above this many unacked chars
LowWatermarkChars  = 5000     // resume below this
CharCountAckSize   = 5000     // the client acks every this many chars
```

The daemon counts unacknowledged chars and calls `pty.pause()` past the high
watermark, `pty.resume()` below the low one. The renderer acks from xterm's
`write` callback. **Acks are suppressed during snapshot replay**, or the daemon's
counter desynchronises.

### Snapshots

Each session pairs its pty with an `@xterm/headless` instance holding
authoritative screen state. `SerializeAddon` turns it into a replay string on
attach, so a client that attaches late paints correct terminal state rather than
a byte window that may start mid escape sequence.

Only the **visible** session has a live xterm in the renderer. `TerminalSurface`
is keyed by session id, so switching tabs disposes the instance and mounts a
fresh one that replays the snapshot. Background shells cost the renderer nothing.

### Coalescing

Output is batched into roughly one frame per 30fps tick, or 64KB, whichever comes
first. This is **our addition, not VS Code's**, justified by the extra socket hop
their architecture does not have. Treat it as unproven and measure before
trusting it.

---

## 5. Persistence

Session metadata is written to `~/.workspace-manager/terminals/manifest.json`
atomically, write to a temp file then rename, so a crash mid-write cannot
truncate it.

**Scrollback lives only in memory**, in the daemon's headless xterm. So:

| Event | Sessions | Scrollback |
|---|---|---|
| Quit the app | survive | survives |
| Close a tab | that one dies | gone |
| Close a workspace tab | all in it die | gone |
| Daemon crash or reboot | all die | gone |

The daemon exits when it has zero sessions **and** zero clients for 5 minutes.

---

## 6. Code map

```
src/daemon/                      the PTY daemon, imports nothing from main or renderer
  main.ts        entrypoint: --socket, --data-dir, signal handlers
  server.ts      accept loop, idle shutdown, broadcast
  connection.ts  per-client refs, handshake, frame dispatch
  session.ts     one pty + headless xterm + flow control + coalescing
  registry.ts    session map, manifest persistence
  shellEnv.ts    shell resolution and env sanitisation

src/main/terminals/
  daemonClient.ts  spawn, connect, handshake, control RPC, frame routing
  bridge.ts        MessagePort per session
  ipc.ts           control plane handlers only

src/shared/
  terminal.ts           session and control-plane types
  terminalConstants.ts  protocol values, Buffer-free so the renderer can import
  node/terminalProtocol.ts  framing, Node-only, excluded from renderer tsconfig

src/renderer/components/XtermHost.tsx   shared xterm primitive and theme reader
src/renderer/features/terminals/        the UI, standard feature folder layout
```

---

## 7. Gotchas

Every one of these was a real bug, not a hypothetical.

**The launching environment leaks into every shell.** This bit twice.

`ELECTRON_RUN_AS_NODE` is the obvious one: the daemon runs with it set, so
without stripping it every shell inherits it and any `node` the user runs becomes
Electron in node mode. It also breaks `npm start` from a VS Code integrated
terminal, which sets the same variable.

The wider problem is the **launching tool's session state**. Start DevRealm from
a Claude Code session inside VS Code and its shells inherited about twenty-five
variables: `CLAUDE_CODE_CHILD_SESSION` (so `claude` disabled transcript saving
and said so), `CLAUDE_CODE_MESSAGING_TOKEN` (a session token sitting in the
environment of every command the user runs), `CLAUDE_CODE_SESSION_ID`,
`VSCODE_IPC_HOOK`, `GIT_ASKPASS` pointing at a VS Code helper, and more.

`shellEnv.ts` strips the `ELECTRON_`, `CLAUDE_CODE_` and `VSCODE_` prefixes plus
an explicit list. It deliberately keeps `ANTHROPIC_API_KEY` and
`CLAUDE_CONFIG_DIR`, which are user configuration rather than session state.

Stripping is safe because shells start login and interactive, so anything the
user configured in their profile is set again. Only launch-time injection is
lost, which is the point. `smoke:daemon` asserts both halves: the markers do not
arrive, and an ordinary variable still does.

**Preload runs sandboxed.** `require` there is limited to `electron` and a few
Node builtins. A relative import throws "module not found" and takes the **whole
preload** with it, so the renderer loses `window.electronAPI` entirely, not just
terminals. Only type-only imports belong in `preload.ts`.

**A MessagePort cannot cross `contextBridge`.** It clones its arguments, and a
cloned port is inert: no `start`, no `postMessage`, no `close`. Preload forwards
the live port into the main world with `window.postMessage` instead.

**The daemon sends the snapshot before the attach response.** Frames can arrive
for a ref whose handler is not registered yet. `DaemonClient` queues per ref,
bounded, and drains on registration.

**The `dark` class is on a div, not `<html>`.** `getComputedStyle(documentElement)`
always returns the light palette. Read CSS custom properties from an element
inside the themed subtree. `XtermHost` uses its own container.

**Login shells are required on macOS.** A GUI-launched app does not inherit the
PATH from `.zprofile`, so pnpm, nvm shims, pyenv and Homebrew are all missing
without `-l`.

**Do not import one feature from another for a shared component.** It drags the
whole chunk into the entry bundle. `XtermHost` lives in `src/renderer/components/`
and `vite.config.ts` splits `@xterm/*` into its own async chunk.

---

## 8. Running and testing

```bash
npm run dev            # vite + tsc main + tsc daemon + electron
npm run lint           # all three tsconfigs
npm run smoke          # all three suites below

npm run smoke:daemon   # drives the daemon over its socket
npm run smoke:main     # drives the main-process DaemonClient under Electron
npm run smoke:renderer # drives a real BrowserWindow with the real preload
```

After a fresh install or an Electron upgrade:
`npx electron-rebuild -f -w node-pty`.

The smoke tests run real code under the real Electron binary, so a broken native
node-pty build fails them. `smoke:renderer` is the one that covers the preload
and MessagePort path, where three of the bugs above lived.

**A stale daemon serves old code.** After editing `src/daemon`, kill it:
`pkill -f dist/daemon/main.js`. Nothing does this automatically yet.

---

## 9. Not built

- **Scrollback on disk.** Sessions do not survive a daemon crash or a reboot.
- **fd handoff across daemon upgrades.** An app update leaves the old daemon
  running from a bundle path that may no longer exist.
- **Activity detection.** Session state is `running` or `exited`; there is no
  "working" or "needs your input", so the left rail is navigation, not a glance.
- **Dev-server port detection.** `boundPort` exists on the type and is never set.
- **Split panes**, `⌘\` is a placeholder button.
- **Per-tab diff, secrets injection, isolated worktrees, session replay.**
- `detachAll()` in `bridge.ts` is defined and never called.

---

## 10. References

| Repo | Licence | What to take |
|---|---|---|
| [superset-sh/superset](https://github.com/superset-sh/superset) | Elastic 2.0 | `packages/pty-daemon/` is the closest match to this design |
| [microsoft/vscode](https://github.com/microsoft/vscode) | MIT | `src/vs/platform/terminal/` for `ptyService`, `terminalProcess`, `FlowControlConstants` |
| [microsoft/node-pty](https://github.com/microsoft/node-pty) | MIT | `typings/node-pty.d.ts` for the real API |
| [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) | MIT | renderer, addons, headless |
| [Eugeny/tabby](https://github.com/Eugeny/tabby) | MIT | a shipping Electron terminal on the same two libraries |

**Licence warning.** VS Code, node-pty, xterm.js and Tabby are MIT. Superset is
Elastic 2.0. Read it for architecture, do not copy source into DevRealm.
