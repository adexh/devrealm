# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (runs all three concurrently: Vite renderer, tsc main, Electron)
npm run dev

# Build
npm run build        # builds both renderer and main
npm run build:renderer  # Vite production build → dist/renderer/
npm run build:main      # tsc → dist/main/

# Start (requires build first)
npm start            # electron dist/main/main.js

# Type-checking (no separate lint tool)
npm run lint         # runs lint:main, lint:renderer and lint:daemon
npm run lint:main    # tsc -p tsconfig.main.json --noEmit
npm run lint:renderer  # tsc -p tsconfig.renderer.json --noEmit
npm run lint:daemon  # tsc -p tsconfig.daemon.json --noEmit

# Smoke tests (no unit test suite)
npm run smoke          # all three of the below
npm run smoke:daemon   # drives the real PTY daemon over its socket
npm run smoke:main     # drives the main-process DaemonClient under Electron
npm run smoke:renderer # drives a real BrowserWindow with the real preload
```

Tests live in `tests/`, suites in `tests/smoke/` and shared code in
`tests/helpers/`. `scripts/` is build tooling only. See `tests/README.md`.

`node-pty` is a native module built against Electron's ABI. After a fresh
install or an Electron upgrade, run `npx electron-rebuild -f -w node-pty`.

## Architecture

This is an **Electron desktop app** for managing developer workspaces, git repos, and Claude AI configurations.

### Three-Process Model

**Main process** (`src/main/`):
- `main.ts` — Window creation, loads Vite dev server (`http://localhost:5173`) in dev or `dist/renderer/index.html` in production.
- `ipc.ts` — All business logic: ~40 `ipcMain.handle()` handlers covering workspaces, repos, markdown files, Claude settings, and plugin/marketplace operations.
- `preload.ts` — Context-isolated bridge that exposes `window.electronAPI` to the renderer with five handler groups: `workspaces`, `repos`, `browse`, `markdown`, and `claude`.
- `store.ts` — JSON persistence at `~/.workspace-manager/workspaces.json`.

**Renderer process** (`src/renderer/`):
- React 19, bundled by Vite with Tailwind CSS 4.
- All communication to the main process goes through `window.electronAPI` (never `require` or Node APIs directly).
- `App.tsx` — Root component; drives the two-tab layout (Dashboard / AI Configs), global fuzzy search (Fuse.js), and workspace/repo state.
- `features/` — Domain modules: `dashboard`, `workspace`, `ai-config`, `markdown-editor`, `marketplace`.
- `components/ui.tsx` — Shared primitives (Tabs, Modal, Box, icons).
- `theme.ts` — Tailwind CSS custom properties.

**PTY daemon** (`src/daemon/`): a detached, long-lived process owning every terminal PTY, so shells survive quitting or updating the app. Runs under `process.execPath` with `ELECTRON_RUN_AS_NODE=1`, which keeps node-pty's native ABI matched and ships no second runtime. Speaks a length-prefixed binary protocol over a Unix socket (named pipe on Windows) whose file mode `0600` is the whole auth boundary. **Read `docs/terminals.md` before working on this feature**; it covers the protocol, flow control, and the traps that have already caught someone.

**Shared** (`src/shared/`): types shared across processes — `types.ts` (`Workspace`, `Repo`, `ClaudeSettingsFile`, ...), `terminal.ts` (session and control-plane shapes), `terminalConstants.ts` (protocol values, Buffer-free so the renderer can import it).

**Node-only shared** (`src/shared/node/`): code the main process and the daemon both need but the renderer must never load, currently `terminalProtocol.ts` (frame encode/decode, uses `Buffer`). The whole directory is excluded from the renderer's tsconfig. Put anything touching Node builtins here, not in `src/shared/`.

### Key Data Flows

- **Workspace/repo data**: persisted to `~/.workspace-manager/workspaces.json` by `store.ts`; read/written exclusively through IPC.
- **Terminal sessions**: written to `~/.workspace-manager/terminals/manifest.json` by the daemon's `Registry`, atomically (write to a temp file, then rename), so a crash mid-write cannot truncate it.
- **Claude settings**: `ipc.ts` reads and writes `.claude/settings.json` and `.claude/settings.local.json` inside each workspace directory.
- **Plugins/Skills**: discovered from `~/.claude/plugins/`; marketplace manifests fetched from GitHub raw content URLs.
- **Markdown files**: edited with Lexical (`src/renderer/features/markdown-editor/`); paths can be absolute or workspace-relative.
- **Git operations**: `simple-git` for clone/pull; `code` CLI spawned for VSCode integration.
- **Terminal control plane**: `terminals:*` IPC handlers in `src/main/terminals/ipc.ts` cover list, open, close, rename, attach and detach only.
- **Terminal data plane**: PTY bytes never touch `ipcMain`. `attach` opens a `MessageChannelMain` and hands the renderer one MessagePort per session; input, output, resize and flow-control acks all ride that port.
- **Flow control**: ack-based, using VS Code's `FlowControlConstants` values (high 100000 chars, low 5000, ack every 5000). The daemon pauses the pty above the high watermark and resumes below the low one. Do not retune these without measuring.

## Code Conventions

- Every new component goes in its own file. Do not define multiple exported components in one file.
- Style with Tailwind CSS. Prefer static utility classes — avoid dynamic class construction (e.g. template literals, computed class names, `clsx`/`cn` conditionals) unless strictly necessary.
- When the user asks to change a code pattern, convention or refactor during a session, update this CLAUDE.md file immediately so the rule persists for future sessions.
- Always perform a small refactor pass alongside every implementation task; keep new code aligned with this file and don't leave known structural debt untouched.

### Feature Folder Structure

Each feature under `src/renderer/features/<feature>/` must use this internal layout:

```
features/<feature>/
  components/   # React components
  hooks/        # Custom React hooks
  types/        # TypeScript types local to the feature
  constants/    # Constants and static config
  ipc/          # Functions that call window.electronAPI (one file per domain)
  index.ts      # Public re-exports
```

- IPC calls must not be made inline in components or hooks — wrap them in an `ipc/` file and import from there.
- Only export from `index.ts`; consumers of a feature import from the feature root, not from internal paths.

### TypeScript Configuration

Three separate `tsconfig` files with different targets:
- `tsconfig.main.json` — ES2020, Node16 modules, strict.
- `tsconfig.renderer.json` — ES2020, ESNext modules, DOM libs, JSX `react-jsx`, `moduleResolution: bundler`. Excludes `src/shared/node`, which is Node-only.
- `tsconfig.daemon.json` — ES2020, Node16 modules, `types: ["node"]`, covering `src/daemon` and `src/shared`.

Run the matching `lint:main`, `lint:renderer` or `lint:daemon` for the area you edited.

### Shared UI Primitives

A component used by more than one feature goes in `src/renderer/components/`, not in a feature. Importing one feature from another drags its whole chunk into the entry bundle. `XtermHost.tsx` is the example: both `terminals` and `workspace` use it, and `vite.config.ts` splits `@xterm/*` into its own async chunk so a user who never opens a terminal never downloads one.
