# DevRealm

**Your workspaces manager.**

Stop juggling folders. Organize all your local repositories into intelligent workspaces with built-in insights, instant access, AI Configs, and easy team sharing.

DevRealm is an Electron desktop app for developers who manage more than one local codebase. Group related repos into clean workspaces, understand each one before you open your editor, and keep your Claude AI configuration visible and manageable.

> Built for developers managing more than one local codebase.

---

## Features

### 01 · Stop losing track of local repositories
Keep related repositories grouped into clean workspaces instead of scattering them across random folders.

- Create a workspace from a new or existing folder.
- Organize repos by client, product, team, or service.
- See all workspaces from one central dashboard.
- Track size, activity, and stale repositories at a glance.

### 02 · Understand every workspace before opening your editor
See what is inside a workspace, how much space it uses, and which repositories need attention.

- View all repositories inside a workspace.
- See size, last opened time, and AI status for each repo.
- Understand disk usage with repository-wise breakdowns.
- Open any repository directly in your preferred editor.

### 03 · Open any repo without hunting through folders
Search across every workspace and jump into the right repository instantly.

- Search workspaces and repositories from anywhere.
- Use `Cmd + K` / `Ctrl + K` for quick access.
- Open repos directly in VS Code or your configured editor.
- Switch between projects faster during daily development.

### 04 · Make AI configuration visible and manageable
Inspect and manage your Claude setup without digging through hidden folders, markdown files, or JSON settings.

- View AI setup for each workspace or repository.
- Check Claude files, tools, plugins, MCP servers, and rules.
- Create, edit, and preview `CLAUDE.md` files in the app.
- Review important Claude settings from a readable UI.

### 05 · Share workspace setup with your team
Export a complete workspace structure so teammates can import it and clone missing repositories easily.

- Export workspace setup as a JSON file.
- Share repository structure with teammates.
- Import workspaces on another machine.
- Clone missing repositories directly from the app.

---

## Download

Grab the latest release for macOS, Windows, or Linux:

**[Download the latest release →](https://github.com/adexh/devrealm/releases/latest)**

| Platform | Format |
| -------- | ------ |
| macOS    | `.dmg` (Intel & Apple Silicon) |
| Windows  | `.exe` (NSIS installer) |
| Linux    | `.AppImage`, `.deb` |

The app checks for updates automatically and notifies you when a new version is available.

---

## Tech Stack

DevRealm is a two-process Electron application.

- **Main process** — Electron + Node, handles all business logic over IPC, JSON persistence, git operations (`simple-git`), and Claude settings.
- **Renderer process** — React 19, Vite, Tailwind CSS 4, Fuse.js for fuzzy search, and Lexical for the markdown editor.
- **Shared** — TypeScript types shared across both processes.
- **Auto-update** — `electron-updater` against GitHub Releases.

## Development

```bash
# Install dependencies
npm install

# Run renderer (Vite), main (tsc), and Electron together
npm run dev

# Build both renderer and main
npm run build

# Start the built app
npm start

# Type-check (no separate lint tool)
npm run lint
```

Workspace and repo data is persisted to `~/.workspace-manager/workspaces.json`. Claude configuration is read from each workspace's `.claude/` directory and `~/.claude/plugins/`.

## Releasing

Releases are produced by the **Build Electron App** GitHub Actions workflow (`.github/workflows/build.yml`). It bumps the version, creates a draft release, builds and uploads installers for all three platforms, then publishes the release.

---

Developed by [@adexh](https://github.com/adexh)
