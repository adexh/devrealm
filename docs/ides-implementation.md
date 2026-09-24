# IDEs: implementation

How the IDEs section is built, why each data source was chosen, and the traps
found while building it. The product side lives in
[ides-product.md](./ides-product.md).

---

## 1. Shape

```
Renderer  features/ides           polls a snapshot, renders groups, fires actions
   │  ipcMain  ides:*             control plane only, small JSON payloads
   ▼
Main      src/main/ides
   ├── processes.ts               ps → VS Code process tree, CPU and memory totals
   ├── vscodeCli.ts               find the `code` CLI, `--status` fallback, open folder
   ├── macWindows.ts              AppleScript: list, raise, close, quit (macOS only)
   ├── titles.ts                  pure: window title → folder name candidates
   ├── knownFolders.ts            folder basename → path index (DevRealm repos, VS Code state)
   ├── snapshot.ts                orchestration and caching
   └── ipc.ts                     handlers
Shared    src/shared/ide.ts        IdeSnapshot, IdeWindow, IdeUsage
```

Nothing here touches the terminal daemon or the data plane. Every call is a
request/response over `ipcMain.handle`, and the renderer polls.

## 2. Data sources, and why

There is no public API that says "these are VS Code's windows and their
folders". Everything below was verified against VS Code 1.107 on macOS.

### 2.1 Window list

| Source | Gives | Cost | Needs |
|---|---|---|---|
| **Accessibility** (`System Events` via `osascript`) | every window title, live; can raise and close | ~100 ms | macOS Accessibility + Automation consent |
| **`code --status`** | title of every window that has a folder, plus folder *basenames* | 2 s for 5 windows and growing with repo size; it walks each folder to count files | the CLI |
| `storage.json` `windowsState` | folder URIs of the windows open at the **last quit** | free | nothing |

Accessibility is preferred when granted. `--status` is the fallback everywhere
else. It is called at most every 10 s, only while the tab is visible, and never
concurrently. When VS Code is not running the CLI is **not** invoked at all:
`code --status` with no instance launches one.

Note that `--status` skips windows with no folder, and its process tree is
unreliable on long-running instances (children with a recycled pid lower than
the parent's never attach, and its memory column is broken in 1.107), so only
its `Workspace Stats` block is parsed.

### 2.2 Window → folder

VS Code's default title is
`${dirty}${activeEditorShort} — ${rootName} — ${profileName} — ${appName}` with
empty parts and their separators dropped. `rootName` is the folder basename, or
the `.code-workspace` name. Separator is ` — ` on macOS and ` - ` elsewhere.

`titles.ts` strips a leading `●`, drops the trailing app name, and returns the
remaining segments right to left as candidates. `knownFolders.ts` resolves the
first candidate that matches a known basename, looking up:

1. DevRealm repos, with relative paths resolved against their workspace root.
2. Folders in VS Code's `storage.json` `windowsState.openedWindows`, which
   covers windows restored at launch that DevRealm does not track.

A window whose title matches nothing keeps `folderPath: null` and lands in
**Other windows**. When two known folders share a basename, the one VS Code's
own state lists as open wins; if that does not settle it, the window is marked
`ambiguous` and gets no path, so no action can land on the wrong repo.

Multi-root windows show the `.code-workspace` name. Those files are indexed
from VS Code's state under that name: `folderPath` is the file's directory
(for the terminal) and `openPath` is the file itself (for focus, since
`code <folder>` would open a new window rather than the workspace).

### 2.3 Resource usage

`ps -axww -o pid=,ppid=,pcpu=,rss=,command=` once per snapshot. The VS Code main
process is the `.../Contents/MacOS/Electron` (or `code`, `Code.exe`) row without
`--type=`. Descendants are classified from the command line:

| Kind | Match |
|---|---|
| `renderer` | `--type=renderer` (windows **and** webviews, so it over-counts windows) |
| `gpu` | `--type=gpu-process` |
| `extension-host` | macOS: `Code Helper (Plugin)`; elsewhere `--type=utility` with `node.mojom.NodeService` |
| `utility` | other `--type=` rows: shared process, pty host, file watcher, network |
| `child` | anything else under the tree: language servers, shells, agents |

Memory is the RSS sum, which over-counts shared pages the same way Activity
Monitor's per-process view does. CPU is the `ps` sample, which is a recent
average, not instantaneous. Windows has no `ps`, so the list comes from
`Get-CimInstance Win32_Process` through PowerShell: working set and command
line, but no CPU percentage, so `cpuPercent` is `null` there and the UI omits
it. The Windows path is written to the documented API and has not been run on
a Windows machine.

### 2.4 Actions

| Action | macOS | Linux / Windows |
|---|---|---|
| Focus, folder known | `code <folder>`: VS Code reuses the window that already has the folder open and focuses it | same |
| Focus, folder unknown | AppleScript `AXRaise` by title and position | unavailable |
| Close | AppleScript: click the window's `AXCloseButton`, by title and position | unavailable |
| Quit | `tell application id "com.microsoft.VSCode" to quit` | `SIGTERM` to the main pid / `taskkill /PID` without `/F` |
| Open repo | existing `repos:open-editor` | same |

Closing by clicking the close button, rather than sending `⌘W` keystrokes or
killing the renderer, means VS Code runs its own save prompt and never shows a
crash page.

Two windows can share a title ("Welcome — Code" twice). Each window carries a
`titleIndex`, its position among same-titled windows in the order System Events
listed them, and the action scripts address `item N of matches` rather than
the first. Both are re-queried at click time; a window that has since changed
title is reported as gone.

Everything the renderer sends is checked in `actions.ts` before it reaches a
process: the ref's shape, the position as a positive integer, and the path as
an existing absolute folder or `.code-workspace` file. The CLI is always run
with `execFile` and no shell. On Windows the `.cmd` wrapper would need one, so
`Code.exe resources\app\out\cli.js` is run directly with
`ELECTRON_RUN_AS_NODE=1`, which is all the wrapper does.

### 2.5 CLI resolution

On macOS the CLI is `<bundle>/Contents/Resources/app/bin/code`. The bundle is
taken from the running main process's executable path first, which also handles
an app running from an App Translocation path, then `/Applications`,
`~/Applications`. `code` on `PATH` is the last resort, since a GUI-launched app
rarely has one. Linux tries `code` then the usual install paths. Windows takes
`Code.exe` from the running process or the editor settings and runs
`resources\app\out\cli.js` under it directly (see 2.4).

## 3. Snapshot lifecycle

```
renderer                              main
  useIdeSnapshot ── ides:snapshot ──▶ captureSnapshot()
     every 3 s (accessibility)            ├─ ps           (always)
     every 10 s (cli fallback)            ├─ windows      (accessibility | cached --status)
     paused when document hidden          ├─ resolve folders
                                          └─ IdeSnapshot
```

`snapshot.ts` serialises capture: a second request while one is in flight gets
the same promise. The `--status` result is cached for 10 s so a manual refresh
during that window returns quickly with fresh `ps` numbers and the last title
list. Reads of `storage.json` are cached by mtime.

After an action the renderer asks for `{ fresh: true }`, which never joins a
capture already in flight (it began before the action) and skips the cache.
Invalidation bumps a generation counter, so a `--status` that was already
running when a window closed cannot write its stale list back afterwards.

If `ps` itself fails the capture rejects, and the renderer keeps its last
snapshot with an error and Retry. If processes list fine but no window source
works, the snapshot comes back with `source: 'none'`; the renderer then keeps
the previous window list, marks it stale, and still shows the live totals.
Listing through System Events is the same Automation route Close takes, so
`capabilities.close` is true only once that listing has actually worked.

## 4. Permissions on macOS

Two separate consents are involved and the code treats them separately:

- **Automation** ("DevRealm wants to control System Events"): macOS prompts on
  the first Apple Event to each target app. If denied, `osascript` fails with
  `-1743`. The snapshot then falls back to the CLI and warns.
- **Accessibility**: required for `System Events` to see another app's windows.
  Checked with `systemPreferences.isTrustedAccessibilityClient(false)`; the
  **Grant access** button calls it with `true`, which shows the system prompt.
  `ides:open-accessibility-settings` deep-links to the Privacy pane.

In `npm run dev` the trusted client is the Electron binary in `node_modules`,
so the permission is granted to "Electron", not "DevRealm". A packaged build
asks again under its own name.

## 5. Renderer

Standard feature layout under `src/renderer/features/ides/`. `IdesScreen` is
layout only; `useIdeWorkbench` holds the poll (via `useIdeSnapshot`), the
groups (via `useIdeGroups`, one group per workspace that has a window), the
action state and every handler. The screen renders:

```
IdeSummaryBar        counts, CPU, memory, captured-ago, Refresh, Quit, breakdown toggle
IdeUsageBreakdown    per-kind table, collapsed by default
AccessibilityBanner  macOS only, dismissible, persisted in uiStore
IdeWorkspaceGroup    header, IdeWindowCard × n
IdeEmptyState        not installed / not running
QuitIdeModal         confirmation
```

A table layout was tried beside the cards, one flat sortable list with the
workspace as a column, and the cards were kept: grouping by workspace is what
turns eight windows into two or three projects at a glance, and a table
flattens that away.

The workbench palette (`tm-*` tokens) is used so the tab reads as a sibling of
Terminals. Window ids are `folder:<path>` when resolved and `title:<title>`
otherwise, so a card keeps its identity while the active editor changes.

`Terminal` on a card calls the shared `useTerminalStore.openSession` with the
window's folder and repo, then `navigateToTerminals`. Untracked folders open
under the Home scope, whose id now lives in `src/renderer/constants.ts` so this
feature does not import from `features/terminals`.

## 6. Refactors made alongside

- `fmtSize` and `relTime` moved out of `DashboardScreen.tsx` into
  `src/renderer/utils/format.ts`; `SessionCard`'s private seconds-granularity
  helper became `relTimeFine` there.
- `HOME_WORKSPACE_ID` / `HOME_WORKSPACE_NAME` moved to `src/renderer/constants.ts`
  and re-exported from the terminals constants.

## 7. Testing

`npm run smoke:ides` loads the compiled pure modules under plain Node and checks:
title parsing against real titles captured from 1.107 (including truncated ones
and a title without the app suffix), `--status` parsing against a captured
fixture, process classification against a captured `ps` fixture with a recycled
low pid, and CLI resolution from a translocated bundle path.

The AppleScript path cannot run from a headless test: it needs Automation
consent granted to the test's parent process. It was written against the
documented `System Events` API and must be exercised in the app once. Steps:

1. `npm run dev`, open the IDEs tab.
2. Accept the "control System Events" prompt; if the banner shows, Grant access.
3. Confirm the window count matches VS Code and that refresh is ~3 s.
4. Click a card: the window comes forward. Click Close on a window with an
   unsaved file: VS Code's save dialog appears.

## 8. Gotchas found while building

- **`code --status` launches VS Code when none is running.** Guard every CLI
  call on the process check.
- **`ps` without `-ww` truncates command lines** on macOS, which loses the
  `--type=` flag and misclassifies everything.
- **Renderer count is not window count.** Webviews get their own renderer
  processes under site isolation. Use the title list for the count and the
  process list for cost.
- **Titles are truncated by VS Code itself** (`Location service public …`) and
  may lack the app suffix. Parse from the right and never assume a fixed number
  of segments.
- **AppleScript titles are compared exactly.** A title can change between the
  list and the click when the active editor changes. Actions look the window
  up again by title at click time and report "window not found" rather than
  acting on the wrong one.

## 9. Not built

- Per-window resource attribution (no public window → renderer mapping).
- Close and title-based focus outside macOS.
- CPU on Windows (`Win32_Process` has cumulative time only; a sampled
  percentage needs two reads). The Windows listing itself is unverified.
- IDEs other than VS Code. `IdeId` is a union with one member on purpose.
