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
npm run lint         # runs both lint:main and lint:renderer
npm run lint:main    # tsc -p tsconfig.main.json --noEmit
npm run lint:renderer  # tsc -p tsconfig.renderer.json --noEmit

# No test suite is defined.
```

## Architecture

This is an **Electron desktop app** for managing developer workspaces, git repos, and Claude AI configurations.

### Two-Process Model

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

**Shared** (`src/shared/types.ts`): TypeScript types shared across both processes — `Workspace`, `Repo`, `ClaudeSettingsFile`, `MarkdownFileIdentity`, etc.

### Key Data Flows

- **Workspace/repo data**: persisted to `~/.workspace-manager/workspaces.json` by `store.ts`; read/written exclusively through IPC.
- **Claude settings**: `ipc.ts` reads and writes `.claude/settings.json` and `.claude/settings.local.json` inside each workspace directory.
- **Plugins/Skills**: discovered from `~/.claude/plugins/`; marketplace manifests fetched from GitHub raw content URLs.
- **Markdown files**: edited with Lexical (`src/renderer/features/markdown-editor/`); paths can be absolute or workspace-relative.
- **Git operations**: `simple-git` for clone/pull; `code` CLI spawned for VSCode integration.

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

Two separate `tsconfig` files with different targets:
- `tsconfig.main.json` — ES2020, Node16 modules, strict.
- `tsconfig.renderer.json` — ES2020, ESNext modules, DOM libs, JSX `react-jsx`, `moduleResolution: bundler`.

Run the appropriate `lint:main` or `lint:renderer` when editing files in `src/main/` vs `src/renderer/`.
