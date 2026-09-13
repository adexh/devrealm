# DevRealm Terminals - implementation plan

**Status:** draft. Engineering only. Product scope lives in `sessions-product-plan.md`.
**Date:** 2026-09-13
**Target repo:** `~/Workspace/Side Projects/devrealm`

Two hard requirements drive every decision below:

1. **Long-lived sessions.** Shells outlive the window, the renderer, and the app process.
   That means a **detached daemon** owns the PTYs, not the Electron main process.
2. **Very performant.** Terminal bytes must never touch React, never be decoded in the
   main process, and never round-trip through promise-based IPC.

---

## 0. Prior art, and what is borrowed from where

Nothing below is invented architecture where an established one exists. Each piece names
its source so it can be checked against a real implementation rather than taken on trust.

| Piece | Established pattern | Source |
|---|---|---|
| A separate process owns every PTY, clients attach and detach | VS Code's **pty host** | `src/vs/platform/terminal/node/ptyService.ts` |
| Headless terminal in that process holds authoritative state; reconnect replays a serialized buffer | VS Code's **`XtermSerializer`**, `@xterm/headless` + `@xterm/addon-serialize`, `generateReplayEvent()` | same file, verified |
| Ack-based flow control with high and low watermarks, pausing the pty | VS Code's **`FlowControlConstants`** and `acknowledgeDataEvent` | `common/terminal.ts`, `node/terminalProcess.ts`, verified |
| Daemon **survives the app quitting**, clients attach later | **tmux / screen / Zellij** client-server split | not VS Code, see below |
| MessagePort for a high-throughput renderer channel | Electron's own recommendation for streaming, and VS Code's utility-process messaging | Electron `MessageChannelMain` docs |
| Terminal handles outside React, one xterm per visible pane | Standard xterm.js integration practice | xterm.js docs |

**The one real deviation:** VS Code's pty host is a **child of the main process and dies
with the app**. It persists terminals across window reloads, not across quitting. Our
requirement is stronger, so the lifecycle model comes from tmux instead: a detached daemon
that outlives every client, with attach, detach, and reconnect.

So this is **tmux's process model running VS Code's terminal machinery**. Both halves are
proven. The seam between them, a detached daemon that also serves serialized replays, is
the part that is genuinely ours and therefore the part to be most suspicious of.

### Reference implementations, with exact repos

Read these before writing code. The first one is close enough to our design that it should
be treated as the reference build.

| Repo | License | What to take from it |
|---|---|---|
| **[superset-sh/superset](https://github.com/superset-sh/superset)** | **Elastic 2.0** | `packages/pty-daemon/` is almost exactly this plan, already shipped. See below |
| [microsoft/vscode](https://github.com/microsoft/vscode) | MIT | `src/vs/platform/terminal/node/ptyService.ts`, `node/terminalProcess.ts`, `common/terminal.ts`. Headless-xterm serialization and flow control |
| [microsoft/node-pty](https://github.com/microsoft/node-pty) | MIT | The PTY itself, and `typings/node-pty.d.ts` for the real API surface |
| [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js) | MIT | Renderer, addons, `@xterm/headless` |
| [Eugeny/tabby](https://github.com/Eugeny/tabby) | MIT | A shipping Electron terminal on node-pty + xterm. `tabby-local/`, `tabby-terminal/` |
| [manaflow-ai/cmux](https://github.com/manaflow-ai/cmux) | **GPL-3.0** | The thing being emulated. Swift/AppKit, not Electron. Useful for product behaviour, not code |

**Licence warning.** VS Code, node-pty, xterm.js and Tabby are MIT and safe to borrow code
from with attribution. **Superset is Elastic 2.0 and cmux is GPL-3.0.** Read them for
architecture, do not copy source into DevRealm.

#### superset-sh/superset `packages/pty-daemon/` - the closest match

Independently arrived at the same architecture, which is the strongest signal this plan is
not a guess. Verified from its README:

- **Runs under `process.execPath`**, Electron's bundled Node, spawned by a coordinator in
  the Electron main process. Same trick, same reasoning, "no new runtime in the desktop
  app bundle".
- **AF_UNIX SOCK_STREAM, length-prefixed framing, 4-byte big-endian prefix.**
- **`hello` / `hello-ack` handshake picking the highest mutually supported version**, with
  a `protocol/version.ts` holding `CURRENT_PROTOCOL_VERSION` and a supported list.
- **Standalone package.** It imports nothing from the app; the app consumes only protocol
  types. Worth copying as a discipline, it is what makes the daemon upgradeable.
- **Layout:** `protocol/`, `Pty/`, `SessionStore/`, `handlers/`, `Server/`. Ours in section
  5 lines up almost one to one.

Its structure is a better starting point than anything I would specify from scratch. Mirror
it.

**Explicitly extrapolated, not borrowed** (flagged so it gets measured, not assumed):

- Frame coalescing in the daemon (section 3.2). VS Code does **not** batch at the pty
  layer, it writes through immediately and relies on flow control. We add an extra socket
  hop that VS Code does not have, which is the justification, but it is a hypothesis until
  P4 measures it.
- The binary framing and `u16` session ref. VS Code uses structured RPC. Ours is a
  simplification that suits a single-purpose socket.


### Reading the references locally

Clone them once, somewhere outside the DevRealm workspace so they never get picked up as
project repos:

```sh
mkdir -p ~/reference && cd ~/reference
git clone --depth 1 https://github.com/superset-sh/superset.git
git clone --depth 1 --filter=blob:none --sparse https://github.com/microsoft/vscode.git
cd vscode && git sparse-checkout set src/vs/platform/terminal && cd ..
git clone --depth 1 https://github.com/microsoft/node-pty.git
git clone --depth 1 https://github.com/Eugeny/tabby.git
```

The VS Code sparse checkout matters. A full clone is several GB and all we need is one
directory.

#### Exact files, by phase

Open these rather than reading the repos generally. Paths verified.

**P0, spike: daemon under Electron's Node, native module packaging**

- `superset/packages/pty-daemon/README.md` - read this first, it is the whole design in one
  page
- `superset/packages/pty-daemon/build.ts` - bundling the daemon to a single file
- `superset/apps/desktop/src/main/lib/host-service-coordinator.ts` - spawning and
  supervising a detached child from Electron main
- `vscode/src/vs/platform/terminal/node/nodePtyHostStarter.ts` - how VS Code starts its pty
  host process
- `node-pty/typings/node-pty.d.ts` - the real API surface, no guessing

**P1, vertical slice: protocol, socket, one session**

- `superset/packages/pty-daemon/src/protocol/framing.ts` - 4-byte BE length prefix,
  `encodeFrame` / `FrameDecoder`
- `superset/packages/pty-daemon/src/protocol/version.ts` - handshake version negotiation
- `superset/packages/pty-daemon/src/protocol/messages.ts` - the message unions
- `superset/packages/pty-daemon/src/Server/Server.ts` - AF_UNIX accept loop, handshake,
  dispatch
- `superset/packages/pty-daemon/src/Pty/Pty.ts` - the node-pty wrapper with dimension
  validation
- `superset/apps/desktop/src/main/lib/terminal-host/client.ts` - the main-process client side

**P2, multi-session and the app side**

- `superset/packages/pty-daemon/src/SessionStore/SessionStore.ts` - session map and ring
  buffer
- `superset/packages/pty-daemon/src/handlers/handlers.ts` - open, input, resize, close,
  list, subscribe as pure functions
- `superset/apps/desktop/src/main/terminal-host/session.ts` and `terminal-host.ts` - the
  app-side session model
- `superset/apps/desktop/docs/HOST_SERVICE_BOUNDARIES.md` - where the process boundaries sit
  and why

**P3, detach, reattach, replay**

- `vscode/src/vs/platform/terminal/node/ptyService.ts` - the `XtermSerializer` class,
  `@xterm/headless` plus `@xterm/addon-serialize`, `generateReplayEvent()`
- `vscode/src/vs/platform/terminal/common/terminalRecorder.ts` - the older recorder
  approach, useful contrast
- `superset/apps/desktop/src/main/terminal-host/xterm-env-polyfill.ts` - running xterm
  outside a browser is not free, this is what it takes

**P4, performance**

- `vscode/src/vs/platform/terminal/common/terminal.ts` - `FlowControlConstants`
- `vscode/src/vs/platform/terminal/node/terminalProcess.ts` - `acknowledgeDataEvent`,
  `_unacknowledgedCharCount`, `_isPtyPaused`, the `pause()` / `resume()` calls
- `vscode/src/vs/platform/terminal/common/terminalDataBuffering.ts` - VS Code's batching,
  the closest thing to our section 3.2
- `superset/apps/marketing/content/blog/terminal-daemon-deep-dive.mdx` - the ~30fps
  batching target and the two-socket split, in prose

**P5, lifecycle and upgrades**

- `superset/apps/desktop/plans/done/20260429-pty-daemon-implementation.md` - their Phase 1
  plan, daemon owns PTYs across app restarts
- `superset/apps/desktop/plans/done/20260501-pty-daemon-phase2-implementation.md` - their
  Phase 2 plan, **fd handoff across daemon-binary upgrades**. This is the one to read
  closely
- `superset/apps/desktop/plans/done/20260106-1800-terminal-host-control-stream-sockets.md` -
  why they split control and stream onto separate sockets
- `superset/apps/desktop/src/main/terminal-host/signal-handlers.ts` - clean shutdown
- `vscode/src/vs/platform/terminal/node/ptyHostService.ts` and `heartbeatService.ts` -
  supervising a pty host, detecting an unresponsive one

**Spawn environment, the gotchas in section 6**

- `superset/packages/host-service/src/runtime/login-shell-env.ts` - resolving the user's
  login-shell environment, which is the macOS PATH problem this plan flags
- `vscode/src/vs/platform/terminal/node/terminalEnvironment.ts` and
  `common/terminalEnvironment.ts` - environment assembly and sanitisation
- `vscode/src/vs/platform/terminal/node/terminalProfiles.ts` - shell resolution per platform
- `vscode/src/vs/platform/terminal/node/windowsShellHelper.ts` - the Windows side we cannot
  skip

**Tests, section 10**

- `superset/packages/pty-daemon/src/*.test.ts` and its `test/` directory - the suite list in
  section 10 comes from here

### Five places the reference beats this plan

Adopt these over what earlier sections of this doc originally proposed.

**1. fd handoff, not "drain", for daemon upgrades.** Superset's Phase 2 passes the PTY
**master file descriptors** to the successor daemon, so sessions survive a daemon-binary
swap **with the same shell PIDs**. The predecessor skips disposal only once the successor
acknowledges. That is strictly better than section 4's drain-and-wait, which leaves old
sessions stranded on an old binary. Their `handoff.test.ts` and `signal-recovery.test.ts`
prove it end to end.

**2. The Unix socket's file mode is the entire auth boundary.** `0600`, no in-band tokens.
The daemon trusts whoever can open the socket. This plan did not mention auth at all, which
was a gap.

**3. Stateless from the client's perspective.** Every protocol call carries full context.
No client tracking, no session tombstones, no business rules in the daemon. This is what
keeps the daemon upgradeable and testable.

**4. Pin `node-pty` deliberately.** Superset pins `1.2.0-beta.14` because `1.1.0` leaked
the temporary `/dev/ptmx` descriptor on macOS once per spawn. They also found node-pty does
not work under Bun at all, which is why their daemon runs under Node. Do not pick a version
casually, and re-run an fd-churn test if changing it.

**5. Batching is coarser than this doc guessed.** Their write-up targets roughly **30fps**
updates, about 33ms, not the 4ms in section 3.2. A human cannot see faster than the frame
rate, and coarser batching means far fewer frames. Start at one frame, not 4ms.

### One deliberate divergence: scrollback on disk

Superset keeps its buffer **in memory only**, a 64KB ring per session, explicitly no
SQLite and no scrollback files, on the reasoning that the buffer survives app restarts
because the daemon does.

That is not enough for us. Our product requirement includes surviving a **machine reboot**,
which cmux also does via a versioned snapshot under its application-support directory. So
section 4's on-disk snapshots stay, but understand it is a deliberate divergence from the
reference and carries its own cost: bounded file sizes, atomic writes, and a cap on how
much history is worth keeping.

### And one place we cannot follow it

Superset puts **Windows ConPTY out of scope**: "not in the protocol; defer until Windows
users justify it." DevRealm already ships an NSIS installer, so Windows cannot be punted.
Budget for it from P1 rather than discovering it at the end.

---

## 1. Process architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ drtermd  (detached, long-lived, survives app quit)               │
│   owns node-pty PTYs                                             │
│   owns one @xterm/headless instance per session (for snapshots)  │
│   owns the ring buffer + on-disk snapshot/manifest               │
│   listens on a unix socket / named pipe                          │
└───────────────────────────┬──────────────────────────────────────┘
                            │ framed binary protocol over
                            │ AF_UNIX socket (mac/linux)
                            │ named pipe (windows)
┌───────────────────────────┴──────────────────────────────────────┐
│ Electron main                                                     │
│   daemonClient.ts   spawn / connect / supervise                   │
│   bridge.ts         dumb pump: socket frame -> MessagePort        │
│                     routes by session ref, parses nothing         │
│   ipc.ts            rare control ops only (list/create/close)     │
└───────────────────────────┬──────────────────────────────────────┘
                            │ MessagePortMain, one port per session
                            │ transfers ArrayBuffer (zero copy)
┌───────────────────────────┴──────────────────────────────────────┐
│ Renderer                                                          │
│   module-level Map<sessionId, XtermHandle>, outside React         │
│   one attached xterm per VISIBLE tab, WebGL renderer              │
│   zustand holds metadata only (id, title, busy), never bytes      │
└──────────────────────────────────────────────────────────────────┘
```

### Why a separate daemon and not the main process

Main dies with the app. The requirement is that a `pnpm build` or a running agent survives
quitting DevRealm, and that reopening the app reattaches to a live shell. Only an
out-of-process, detached owner gives that.

### Which runtime runs the daemon

**`process.execPath` with `ELECTRON_RUN_AS_NODE=1`.** Not a system `node`, not a bundled
second runtime.

```ts
spawn(process.execPath, [daemonEntry], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  detached: true,
  stdio: 'ignore',
}).unref()
```

Three reasons this is the right call:

- **ABI match.** The native PTY module is compiled against Electron's ABI. Running it
  under the app's own Electron binary in Node mode guarantees the same ABI. A system
  `node` would need a second, differently-built copy of the module.
- **No extra runtime to ship.** The binary is already in the bundle.
- **Code signing.** On macOS the daemon executable lives inside the signed, notarised app
  bundle, so nothing extra needs signing or a hardened-runtime exception.

---

## 2. Transport and protocol

### Daemon socket

- macOS/Linux: `~/.workspace-manager/term.sock`
- Windows: `\\.\pipe\devrealm-term`

Singleton discipline on app start:

1. Try to connect.
2. `ECONNREFUSED` or `ENOENT` means stale. `unlink` the socket file, then spawn.
3. Spawn, then retry connect with backoff, 10ms up to 500ms total.
4. A lockfile holding the daemon pid guards against a double spawn race.

### Frame format

Fixed 8-byte header, little endian, then payload. No JSON on the data path.

```
 0      1        3                8
 +------+--------+----------------+---------------------------+
 | type | ref u16| payloadLen u32 |  payload (raw bytes)      |
 +------+--------+----------------+---------------------------+
```

`ref` is a `u16` handle assigned at attach time. **Session UUIDs never appear on the hot
path** - shipping a 36-byte string with every 20-byte keystroke frame is pure waste.

| type | direction | payload |
|---|---|---|
| `DATA` | daemon to client | raw PTY output bytes |
| `INPUT` | client to daemon | raw stdin bytes |
| `RESIZE` | client to daemon | `u16 cols`, `u16 rows` |
| `ACK` | client to daemon | `u32 charCount`, flow control, see 3.1 |
| `EXIT` | daemon to client | `i32 exitCode` |
| `SNAPSHOT` | daemon to client | serialized screen + scrollback |
| `PING` / `PONG` | both | empty, liveness |

Control operations that happen rarely (list, create, close, rename) use a separate
length-prefixed JSON channel. Mixing them into the binary path buys nothing.

### Main to renderer: MessagePort, not `ipcRenderer`

`ipcRenderer.on` and `invoke` both structured-clone through main's event loop and
serialise against every other IPC message the app sends. For a terminal that is the wrong
primitive.

Instead, `terminals:attach` creates a `MessageChannelMain`, keeps port1 in main, and
hands port2 to the renderer via `webContents.postMessage(channel, null, [port2])`. After
that, PTY bytes flow renderer to main to socket without touching `ipcMain` at all, and
`ArrayBuffer` payloads are **transferred, not copied**.

The main-side pump does exactly one thing: read a frame, look up `ref` in a `Map`, forward
the payload to that port. It never decodes UTF-8, never allocates a string, never parses
escape sequences.

---

## 3. Performance design

This is the part the requirement lives or dies on. Seven measures, in the order they
matter:

### 3.1 Ack-based flow control, copied exactly from VS Code

This is the mechanism that keeps `cat bigfile` from pinning the UI, and it is the single
most important item in this section. Use VS Code's numbers, which are verified from
`src/vs/platform/terminal/common/terminal.ts`:

```ts
const enum FlowControlConstants {
  HighWatermarkChars = 100000,  // pause the pty above this many unacknowledged chars
  LowWatermarkChars  = 5000,    // resume below this
  CharCountAckSize   = 5000,    // client acks every this many chars
}
```

How it works, matching `terminalProcess.ts`:

- The daemon keeps `_unacknowledgedCharCount` per session. In the `onData` handler, once it
  exceeds `HighWatermarkChars`, call **`ptyProcess.pause()`**. `node-pty`'s `IPty` exposes
  `pause()` and `resume()` directly, verified in its typings.
- The renderer counts characters it has handed to xterm and sends an `ACK` frame every
  `CharCountAckSize`. The daemon subtracts, and once below `LowWatermarkChars` calls
  `ptyProcess.resume()`.
- Acks must be suppressed during snapshot replay, or the counter desynchronises. VS Code
  guards this with an `_inReplay` flag; do the same.

**Correction to an earlier draft of this doc:** it proposed 512KB / 128KB byte watermarks
and "the daemon stops reading the PTY fd". Those numbers were invented and the mechanism
was vague. The values above are the ones that have survived years of production use, and
`pause()` / `resume()` is the real API. Do not substitute guesses here.

`node-pty` also has an experimental `handleFlowControl` option with XON/XOFF characters.
Ignore it. The explicit ack path is what VS Code ships.

### 3.2 Frame coalescing in the daemon (our addition, must be measured)

A build emits thousands of sub-100-byte writes. Per session, accumulate and flush when
either ~4ms has elapsed or the buffer reaches 64KB, collapsing a 5000-write build into
roughly 100 frames.

**Be honest about the status of this one.** VS Code does not batch at this layer, it writes
through immediately and lets flow control do the work. The justification here is the extra
socket hop that VS Code's architecture does not have. Treat it as a hypothesis: implement
flow control first, measure, and only keep coalescing if the numbers in section 9 improve.
The 4ms and 64KB figures are starting points, not proven constants.

### 3.3 Minimise encode and decode on the data path

A correction worth stating plainly, because it invalidates a claim in an earlier draft:
**`node-pty`'s `onData` is `IEvent<string>`, not bytes.** It emits UTF-8 decoded strings by
default. "`Uint8Array` all the way from `pty.onData`" was wrong.

The realistic path, matching how VS Code handles it:

- Daemon receives a `string` from `onData`. Count its length for flow control, since VS
  Code's watermarks are in **chars**, which is why the constant is `CharCountAckSize`.
- Encode to a `Buffer` **once**, at the daemon boundary, before the socket write.
- Main forwards that buffer opaquely. It never decodes, never allocates a string, never
  parses escape sequences. This part of the original claim stands.
- Renderer passes the `Uint8Array` straight to `term.write()`. xterm accepts `string |
  Uint8Array` and its internal UTF-8 decoder handles multibyte sequences split across chunk
  boundaries, which a naive `toString()` per chunk does not.

Net: one encode, one decode, both at the ends where they are unavoidable.

`node-pty` accepts `encoding: null` to emit raw `Buffer`s instead, which would remove even
that one encode. It is a less-travelled path and the flow-control accounting would switch
from chars to bytes. Evaluate it during P4 as an optimisation, not as the baseline.

### 3.4 WebGL rendering

`@xterm/addon-webgl`, with a `canvas` fallback when context creation fails and an
automatic fallback if the context is lost. This is the difference between smooth and
visibly janky scrollback on a high-DPI display.

Also load `addon-fit`, `addon-serialize`, `addon-unicode11`, and `addon-search`. Lazily,
in the Terminals chunk only.

### 3.5 Background tabs cost zero renderer CPU

**Do not keep a parsing xterm instance for a hidden tab.** The daemon already maintains
authoritative state per session via a headless xterm. So:

- On **detach** (tab hidden or app closed): dispose the renderer xterm entirely.
- On **attach** (tab shown): request `SNAPSHOT`, `term.write()` it once, then start
  streaming live.

The snapshot is produced by `SerializeAddon` over the daemon's `@xterm/headless` instance,
which yields the current screen plus N lines of scrollback as a compact escape-sequence
string. Attach cost becomes O(visible scrollback), not O(session history), and eight
background builds consume no renderer time at all.

A raw byte ring buffer replayed on attach is the cheaper alternative, but replaying an
arbitrary byte window mid-escape-sequence corrupts terminal state. The headless instance
is the correct mechanism and is the same approach VS Code uses for terminal reconnect.

### 3.6 Terminal state lives outside React

- A module-level `Map<sessionId, XtermHandle>` owns the `Terminal`, its addons, and its
  port. React renders an empty `<div ref>` and nothing else.
- Output **never** triggers a render. Zustand stores `{id, title, repoId, workspaceId,
  busy}` only.
- The `busy` flag is derived from output activity and **throttled to 250ms**, otherwise
  the left rail re-renders thousands of times during a build.
- Tab switching moves the existing DOM node rather than remounting, so no
  `term.dispose()` / `term.open()` churn on every click.

### 3.7 Resize discipline

`FitAddon.fit()` is layout-thrashing. Debounce to 50ms behind a `ResizeObserver`, and only
emit a `RESIZE` frame when `cols` or `rows` actually changed. Resizing the window with
eight tabs open must not send eight resize storms: only the visible terminal is fitted,
hidden ones are fitted on attach.

### Startup path

- Daemon start is **lazy**, on first terminal open, but **prewarmed**: the first time the
  Terminals screen mounts, ping the daemon so the socket and process are already up when
  the user clicks.
- On app launch, fetch session **metadata only** (cheap JSON) and render the tab bar
  immediately. Snapshots stream in per tab as each is focused. Launch never blocks on
  session restore.
- The Terminals screen is code-split behind the existing `lazy()` pattern, so xterm and
  its addons never enter the initial bundle.

### Performance budget

Numbers to hold the implementation to. Anything missed here is a bug, not a tradeoff.

| Metric | Budget |
|---|---|
| Keystroke to echo, local shell | under 16ms, one frame |
| `create` to first prompt byte | under 150ms, shell spawn dominates |
| Attach to painted snapshot, 10k lines scrollback | under 100ms |
| Sustained throughput without UI stall | 50MB/s |
| Idle CPU, 8 attached but quiet sessions | under 1% |
| Daemon RSS per idle session, 10k scrollback | under 8MB |
| App launch overhead with 8 live sessions | under 50ms added |

---

## 4. Daemon lifecycle

### Ownership and reaping

- Daemon is a singleton per user, not per window.
- It **survives app quit**. On quit, main just closes its socket.
- It exits when it has **zero sessions and zero clients** for 5 minutes.
- A sweep closes sessions idle beyond a configurable TTL, default off, with a 7-day
  ceiling as a safety valve.

### Version skew across auto-update

The app auto-updates from GitHub Releases while a daemon from the previous build may still
be running, possibly from an app bundle path that no longer exists.

- The handshake carries a protocol version.
- **Target state, fd handoff.** The successor daemon **adopts the PTY master file
  descriptors** from the predecessor, so shells survive the swap with unchanged PIDs. The
  predecessor disposes nothing until the successor acknowledges. This is
  `superset-sh/superset` Phase 2, and it is the correct end state.
- **Interim, drain.** The old daemon stops accepting new sessions, the app spawns a new one
  for everything new, and the old exits when its last session ends. Simpler, but old
  sessions stay stranded on the old binary.
- **v0 blunt path only if neither is ready:** surface "terminals need a restart after
  update", and kill on confirm. Do not announce the feature while this is the behaviour.

Note the trap: the daemon was spawned from the **old** `process.execPath`. After an
update replaces the bundle, that path can be gone. The daemon must therefore hold no
assumptions about re-reading files from its own bundle after start, and must have loaded
everything it needs at boot.

### Crash recovery

PTYs die with the daemon, that is unavoidable. What must not die is the user's context.

- **Manifest** at `~/.workspace-manager/terminals/manifest.json`: `{id, repoId,
  workspaceId, cwd, title, shell, createdAt, lastActiveAt}` per session. Written by atomic
  `write` + `rename` on every change.
- **Snapshots** at `~/.workspace-manager/terminals/<id>.snap`: the serialized scrollback,
  flushed every 10s when dirty and on every detach, capped at a configurable size.
- On next daemon start, sessions whose PTY is gone are listed as `dead`. The renderer still
  shows the tab, still renders the snapshot, and offers a restart in the same cwd.

---

## 5. Module layout

Respects the mandatory feature-folder convention in `devrealm/CLAUDE.md`.

### New: daemon

```
src/daemon/
  index.ts        server bootstrap, socket, client registry
  session.ts      one PTY + headless xterm + ring buffer + flush timer
  registry.ts     session map, manifest persistence, reaping
  snapshot.ts     serialize / restore
```

### Main

```
src/main/terminals/
  daemonClient.ts  spawn, connect, backoff, handshake, supervision
  bridge.ts        MessagePortMain <-> socket pump, ref routing
  ipc.ts           control handlers, registered from registerIpcHandlers()
```

### Shared

```
src/shared/
  terminalProtocol.ts   frame encode/decode, type enum, version constant
  types.ts              + TerminalSession, TerminalSessionState
```

Framing must be shared, since all three processes encode and decode it.

### Renderer

```
src/renderer/features/terminals/
  components/  TerminalsScreen, SessionRail, TerminalTabBar,
               TerminalHost, RepoLauncherDrawer
  hooks/       useTerminalAttach, useSessionList
  ipc/         terminals.ts        (no inline electronAPI calls anywhere else)
  types/
  constants/
  index.ts     public re-exports only
```

### Required refactor

`CloneTerminal.tsx` and the new terminal both instantiate xterm with near-identical setup.
Per the CLAUDE.md rule that every implementation carries a refactor pass, extract a shared
`XtermHost` primitive:

- `components/XtermHost.tsx` owns creation, theme binding, addon loading, disposal.
- The clone case passes `readOnly: true` and keeps `disableStdin`.
- The session case passes a port and wires input.

This also fixes the hardcoded `#0d1117` background in `CloneTerminal`, which ignores the
app's dark mode and should read from `theme.ts`.

### Preload surface

```ts
terminals: {
  list:    ()                                  => Promise<TerminalSession[]>,
  create:  (d: { repoId, workspaceId, cwd, cols, rows }) => Promise<string>,
  attach:  (id: string)                        => Promise<void>,  // transfers a port
  detach:  (id: string)                        => Promise<void>,
  close:   (id: string)                        => Promise<void>,
  rename:  (id: string, title: string)         => Promise<void>,
  onSessionsChanged: (cb) => () => void,
}
```

`INPUT`, `DATA`, and `RESIZE` are deliberately **absent**. They travel over the port.

`repos:openTerminal` in the current preload keeps its name but changes meaning, from
`shell.openPath` to creating a session.

---

## 6. Build and packaging

### Dependencies

Settled: **`node-pty`** for the PTY, **`xterm`** for rendering. The repo already has
`@xterm/xterm` 6.0.0, so the renderer half is partly paid for.

| Package | Process | Why |
|---|---|---|
| `node-pty` | daemon | The PTY. Native module |
| `@xterm/headless` | daemon | Authoritative terminal state for snapshots, VS Code's approach |
| `@xterm/addon-serialize` | daemon | Produces the replay buffer on attach |
| `@xterm/xterm` **6.0.0, already installed** | renderer | Rendering |
| `@xterm/addon-webgl` | renderer | The renderer perf win |
| `@xterm/addon-canvas` | renderer | Fallback when WebGL context creation fails or is lost |
| `@xterm/addon-fit` | renderer | Sizing to the container |
| `@xterm/addon-unicode11` | renderer | Correct width for wide glyphs |
| `@xterm/addon-search` | renderer | In-terminal find |

Match every addon's major to the installed `@xterm/xterm` 6.x. Mismatched addon majors fail
at runtime, not at install.

### node-pty specifics that will bite

**Spawn shape:**

```ts
pty.spawn(shell, args, {
  name: 'xterm-256color',
  cwd: repo.path,
  cols, rows,
  env: sanitizedEnv,
})
```

**1. Strip `ELECTRON_RUN_AS_NODE` from the child env.** The daemon itself runs with that
variable set. Every shell it spawns would inherit it, and then any `node` the user runs
inside that shell behaves as an Electron-in-node-mode process. Delete it, along with
`NODE_OPTIONS` and the `ELECTRON_*` variables Electron injects. This is a silent,
maddening class of bug.

**2. Use a login shell on macOS.** A GUI-launched app does not inherit the PATH from
`.zprofile`, so `pnpm`, `nvm` shims, `pyenv`, and Homebrew binaries are all missing.
Resolve `process.env.SHELL`, fall back to `/bin/zsh` on macOS and `/bin/bash` on Linux, and
pass `-l`. On Windows resolve `pwsh` then `powershell.exe` then `cmd.exe`.

**3. `onData` gives strings**, see section 3.3.

**4. `pause()` and `resume()` exist on `IPty`** and are the flow-control handles, see 3.1.

**5. Windows uses ConPTY.** Exit codes and resize behave differently enough that Windows
must stay in the loop from P1, not be deferred to the end.

### Building the native module

It is a **native module built against Electron's ABI**, because the daemon runs under the
Electron binary in Node mode.

- Dev: `@electron/rebuild` after install, wired into a `postinstall` script.
- Packaging: `electron-builder` rebuilds native deps for Electron by default, so this is
  mostly handled, but verify rather than assume.

### electron-builder

`build.files` is currently `["dist/**/*", "package.json"]`, which picks up the compiled
daemon automatically. Two additions are needed:

```jsonc
"asarUnpack": ["**/node_modules/node-pty/**"],
```

A native `.node` cannot be loaded from inside an asar archive. Verify the unpacked path
resolves in a **packaged** build, not just `npm run dev`, because this is the classic
"works locally, broken in the dmg" failure.

### Build pipeline

- New `tsconfig.daemon.json`, ES2020 / Node16 like the main config, output `dist/daemon/`.
- `build:daemon` script, added to `build` and to the `concurrently` set in `dev`.
- **Dev caveat:** an already-running daemon will serve stale code after an edit. In dev,
  set the protocol version to the build timestamp so a changed daemon forces a respawn.
  Without this, hours get lost debugging code that is not running.

### CI

The existing three-platform release workflow already covers the matrix. Add a
**packaged-app smoke test**: install the artifact, open one terminal, assert a prompt
appears. A native module regression must not reach a release.

---

## 7. Risks, highest first

| Risk | Why it bites | Mitigation |
|---|---|---|
| `node-pty` native build across mac x64/arm64, win, linux, plus auto-update | The most common way this feature fails to ship | Spike it first, before any UI. Packaged-build smoke test in CI |
| Daemon orphaned by an app update, old `execPath` gone | Silent breakage after auto-update | Version handshake and drain; daemon loads everything at boot |
| Windows ConPTY differences and named pipe permissions | Divergent behaviour, resize and exit-code edge cases | Keep Windows in the loop from phase 1, do not defer it |
| Snapshot memory with large scrollback across many sessions | Daemon RSS creep over days | Cap scrollback per session, cap snapshot file size, measure against the budget |
| Zombie daemon after an unclean app crash | Stale socket, spawn race | pid lockfile plus socket probe plus stale-socket unlink |
| Terminal bytes leaking into React state | Death by a thousand re-renders, the classic xterm-in-React mistake | Module-level handle map, throttled busy flag, code review rule |
| No test suite in the repo | Regressions land silently | The daemon is pure Node and testable without Electron. Copy the reference's suite, see section 10 |

---

## 8. Build order

Each phase ends in something runnable.

**P0 - Spike, throwaway.** `node-pty` under `ELECTRON_RUN_AS_NODE`, detached, one hardcoded
session, echo over a socket. Package a dmg and confirm the native module loads from the
unpacked path. **Do not proceed until this is green**, it is the whole technical risk.

**P1 - Vertical slice.** Daemon with one session, protocol module, main bridge,
MessagePort attach, `XtermHost`, opened from the repo row button. No persistence, no tabs.
Type in it, it works, it survives closing the window.

**P2 - Multi-session.** Session registry, ref allocation, per-session ports, tab bar,
workspace grouping, the left rail and the right drawer.

**P3 - Detach and reattach.** Headless xterm in the daemon, `SerializeAddon` snapshots,
attach/detach on tab visibility, manifest and snapshot persistence, restore on app launch,
dead-session handling.

**P4 - Performance pass.** Coalescing, backpressure, WebGL addon, throttled busy flags,
resize debounce. Then measure against section 3's budget table and record the numbers.

**P5 - Lifecycle hardening.** Reaping, idle TTL, version handshake and drain, stale socket
and lockfile handling, crash recovery.

**P6 - Remaining entry points.** `⌘K` terminal action and open-tab results, tab rename,
recency cycler, drawer filter, dev-server URL detection.

## 9. Measurement harness

"Very performant" needs a repeatable check, not a vibe. Build it during P4 and keep it:

- **Throughput:** `cat` a 50MB text file, measure wall time to settle and peak renderer
  RSS. Compare against the same file in the system terminal.
- **Latency:** a dev-only probe that timestamps a synthetic keystroke at `INPUT` and at the
  matching `DATA` echo, reporting p50 and p99.
- **Idle cost:** 8 sessions open and quiet, sample main and renderer CPU for 60s.
- **Attach:** time from `attach()` to first paint at 1k, 10k, and 50k lines of scrollback.

Run it on every phase after P4 and record the numbers in this doc, so regressions are
visible rather than argued about.

---

## 10. Test suite

DevRealm has no tests today, and that is survivable for UI but not for a daemon holding
someone's running build. The daemon is **pure Node with no Electron dependency**, so it is
the cheapest thing in the repo to test properly.

`superset-sh/superset` publishes exactly which suites earn their keep. Copy the list:

| Test | What it proves |
|---|---|
| `protocol.test.ts` | Framing survives split chunks and hostile input. Pure, fast, no PTY |
| `control-plane.test.ts` | Handshake and version negotiation; session lifecycle including invalid dimensions, duplicate ids, ENOENT, instant exit, hung shell; resize; multi-subscriber fan-out; detach and reattach replay |
| `byte-fidelity.test.ts` | **Random bytes, including non-UTF-8, arrive byte-perfect** on both live and replay paths. This is the canary for the whole encode/decode design in 3.3 |
| `fd-lifecycle.test.ts` | Master fds close idempotently under repeated natural-exit churn. Catches descriptor leaks before they exhaust the process |
| `handoff.test.ts` | Sessions survive a daemon-binary swap with the same shell PIDs |
| `signal-recovery.test.ts` | `SIGKILL` of the daemon mid-flight leaves clients with a clean close, not a hang |
| `no-encoding-hops.test.ts` | A **source-level grep** that fails the moment anyone reintroduces a base64 hop or a per-chunk `toString("utf8")` on the data path |

That last one is the cheapest high-value test in the list. The "no decode in main" rule in
section 3.3 is exactly the kind of invariant that quietly erodes during a refactor, and a
grep-based guard costs ten lines.

Add on top, specific to us:

- **Packaged-app smoke test** in the existing release workflow: install the artifact, open
  one terminal, assert a prompt appears. Guards the `asarUnpack` and native-ABI failure
  mode, which is the one most likely to reach a release.
- **Windows ConPTY parity test**, since the reference punts on Windows and we cannot.
