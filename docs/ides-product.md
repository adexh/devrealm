# IDEs: product definition

What the IDEs section is for, who it serves, and what a user must be able to do
there. The engineering side lives in [ides-implementation.md](./ides-implementation.md).

---

## 1. The problem

A developer working across microservices opens one VS Code window per service.
Five, six, eight windows are normal. Past three or four, the set stops fitting in
one head:

- You do not know how many windows are open, or which repos they hold.
- Finding the right one means the Dock's right-click menu, Mission Control, or
  `⌘\`` cycling and squinting at title bars.
- You do not know which of them you stopped needing an hour ago, and VS Code
  costs real memory per window, so the machine slows down for no visible reason.
- Nothing tells you which repos in the workspace you are working on are **not**
  open, so you re-open one that already has a window, and now there are two.

VS Code has no cross-window view of itself. macOS has one, but it is a picture of
thumbnails, not a list you can act on, and it knows nothing about repos or
workspaces.

DevRealm already knows every repo and which workspace it belongs to. Putting the
running IDE windows next to that knowledge turns a pile of windows into a list of
repos with a state: open here, unsaved changes, or not open at all.

## 2. Who it is for

The DevRealm user who keeps many editor windows open at once because the work
spans many repos. They value seeing the whole set at a glance more than any one
window's detail. They run macOS today; the section must not break on other
platforms, but its full power ships on macOS first.

## 3. What we stand for

- **One list, always current.** Every open VS Code window, with the repo it
  holds, refreshed while you look at it. No manual "scan".
- **Act from the list.** Bring a window to the front, close it, open a terminal
  in its repo, or quit the whole IDE, without leaving DevRealm.
- **Workspace context, not just windows.** Windows are grouped by the DevRealm
  workspace whose repo they hold, so eight windows read as two or three
  projects. Only what is open appears; the Dashboard is where repos are opened.
- **Honest about cost.** Total CPU and memory VS Code is using, and what kind of
  processes it is spending them on, so "my laptop is slow" has a number.
- **Ask for nothing until it is worth it.** The list works out of the box. macOS
  Accessibility permission unlocks faster refresh and window close, and the
  screen explains exactly what it buys before asking.

## 4. Scope of this release

Supported IDE: **VS Code** (stable). The design is per-IDE so Cursor and other
VS Code forks can follow by configuration, but only VS Code is wired up now.

## 5. What the user can do

### 5.1 See every open window

The fourth tab in the top bar is **IDEs**. It shows:

- A **summary strip**: number of windows, number of VS Code processes, total
  CPU, total memory, and how long ago the list was captured.
- **Window cards**, grouped by DevRealm workspace. A card shows the repo (or
  folder) name, the window title as VS Code shows it, the path, and a marker
  when the window has unsaved changes. A window whose name matches more than
  one known folder is marked ambiguous rather than pinned to the wrong repo.
- An **Other windows** group for windows whose folder DevRealm does not track,
  and for windows with no folder at all.

The list refreshes on its own while the tab is visible and pauses when it is
not. A **Refresh** button forces one. If a refresh cannot list windows, the
last good list stays on screen, marked as such, instead of vanishing.

Without macOS Accessibility (see 5.7) the list comes from the VS Code command
line, which does not report windows that have no folder open, so an empty
"Welcome" window is missing from the count until the permission is granted.

### 5.2 Bring a window to the front

Click a card. The window comes to the front and gets focus. Works for every
window whose folder is known; on macOS with Accessibility granted it works for
any window, including folderless ones.

### 5.3 Close a window

Each card has a **Close** action. It closes that VS Code window the same way the
red traffic light does, so VS Code's own "save changes?" dialog appears when
there is unsaved work. DevRealm never force-kills a window.

Available on macOS once Accessibility permission is granted. Elsewhere the
action is disabled and its tooltip says why.

### 5.4 Open a terminal in the window's repo

A **Terminal** action on each card opens a DevRealm shell already sitting in
that folder and switches to the Terminals tab. The two features share the same
idea: DevRealm knows where the code is, so you should never type a path.

### 5.5 Quit VS Code

A **Quit VS Code** action in the summary strip, behind a confirmation, asks
VS Code to quit cleanly. VS Code prompts for unsaved files itself.

### 5.6 See where the cost goes

The summary strip expands into a breakdown by process kind: windows, extension
hosts, GPU, other helpers, and processes extensions spawned. Per-window cost is
not shown; VS Code does not expose which renderer belongs to which window in a
way DevRealm can read without private APIs, and a wrong number is worse than
none.

### 5.7 Grant Accessibility (macOS)

Without the permission the screen still lists windows, but does so through the
VS Code command line, which is slower (a few seconds per refresh), leaves out
windows with no folder, and cannot close windows. A banner explains this and offers **Grant access**, which shows
the system prompt, and **Open System Settings**. The banner can be dismissed
and stays dismissed.

### 5.8 Keyboard

`⌘⇧I` jumps to the IDEs tab, matching `⌘⇧D`, `⌘⇧A` and `⌘⇧T`.

## 6. States the screen must handle

| State | What the user sees |
|---|---|
| VS Code not installed | Empty state saying so, with a link to install |
| VS Code installed, not running | Empty state pointing to the Dashboard to open a repo |
| Running, no windows | Same, plus the process totals |
| Running, windows open | The full list |
| Refresh failed | Last good list stays, with an inline error and a Retry |
| Action failed (focus, close, quit) | Inline error on the card or strip; the list is refreshed so it reflects reality |
| Accessibility not granted (macOS) | Banner, slower refresh, folderless windows missing, Close disabled with a reason |
| Accessibility granted but Automation to System Events denied | Warning naming the toggle, list falls back to the command line, Close disabled |
| Window list failed, processes fine | Last good list stays, marked stale, with a Retry |

## 7. What we deliberately do not do

- **Per-window CPU or memory.** See 5.6.
- **Force-kill a window or the IDE.** Data loss is not a feature.
- **List or open repos that have no window.** The tab shows what is open and
  nothing else; opening repos is the Dashboard's job.
- **Move or resize windows.** Out of scope; macOS does this well already.
- **Track IDEs other than VS Code.** Next up, not now.

## 8. How we know it works

The user can look at the IDEs tab and answer, without touching another app:

1. How many VS Code windows are open, and which repos they hold.
2. Roughly how much memory and CPU VS Code is using.

And can, with one click each: bring a window forward, close it, open a shell in
its repo, and quit VS Code.

## 9. Later

- Cursor, Windsurf and other VS Code forks, by adding them to the IDE config.
- Windows in the global `⌘K` switcher, so "jump to the frontend window" is a
  keystroke.
- Marking a window's repo as "add to workspace" when it is not tracked.
- Per-window resource cost if VS Code ever exposes the window to renderer
  mapping publicly.
