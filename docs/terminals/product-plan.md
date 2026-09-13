# DevRealm Terminals - product plan (v0 draft)

**Status:** draft, product perspective only. Implementation is planned separately.
**Date:** 2026-09-13
**Owner:** Adesh
**Target:** the DevRealm desktop app

> This is a **feature inside the shipped DevRealm app**, not a new product. DevRealm
> already is "your workspaces manager": it owns the workspace and repo model, the
> dashboard, and the global search. Terminals plug into all three.

---

## The problem

In cmux, opening a terminal in the right place is manual work. You read a path, you `cd`,
you `cd ..`, you `cd` again, and only then do you start doing the thing you opened the
terminal for. Multiply that by every context switch in a day.

**The navigation is the friction, not the terminal.**

DevRealm already removed exactly this friction for *editors*: `⌘K`, three characters,
Enter, and the editor opens on the right repo. The feature is to give terminals the same
treatment, and then keep them organised once they are open.

## Decided constraints

- **Local only.** No remote sessions, no hosted backend.
- **No mobile.** Checking a session from a phone is out.
- **No collaborator.** Single user, no sharing.

Already true of DevRealm, so nothing new to design around.

---

## What DevRealm already does for us

The feature is small because most of the surrounding product exists:

- **Workspaces and repos are already the app's model.** Users already register workspace
  folders, and repos inside them are already discovered, listed, and tracked with a last
  opened time. Terminals inherit that hierarchy rather than inventing one.
- **Global search already exists.** `⌘K` already fuzzy-matches workspaces and repos and
  opens the chosen repo in the user's editor. Terminals add a verb to a search that is
  already built and already in the user's fingers.
- **Tabs already exist.** The app already opens, names, closes, and confirms closing
  dynamic tabs for its markdown editor. Terminal tabs behave the same way.
- **Repo rows already have actions.** The workspace screen already lists each repo with
  an `open` action next to it.
- **There is already an "open terminal" action, and it is misleading.** Today it opens
  the operating system's file manager at the repo path, not a terminal. Part of this
  feature is making that promise true.

**The starting point to be honest about:** the app today can only *display* command
output, read-only, as it does while cloning a repo. A terminal you can actually type into
is new.

---

## The model

Reuse DevRealm's existing nouns. No new hierarchy:

```
Workspace        already exists
  └─ Repo        already exists
       └─ Terminal tab    NEW: one shell, already sitting in that repo

Session group    NEW: one per workspace, holds every terminal tab in that workspace
```

**The grouping rule, stated precisely:**

1. You open a terminal for a repo.
2. That repo belongs to a workspace.
3. If a session group for that workspace is open, the new tab joins it.
4. If not, a new group named after the workspace is created, and the tab is its first.
5. A group disappears when its last tab closes.

Group names are never typed. They are the workspace name, which already exists and is
already editable in the dashboard.

---

## The layout

DevRealm's shell today is a title bar, then a tab bar carrying `Dashboard | AI | Editor -
x` plus a centred search box, then the active screen. Terminals add a tab and a
two-drawer screen inside it.

```
┌─ DevRealm ──────────────────────────────────────────────── auth  ⚙  ☀ ─┐
├─ Dashboard │ AI │ Terminals │ Editor - notes ──  [ Switch workspace ] ──┤
├──────────────┬───────────────────────────────────────────┬─────────────┤
│ SESSIONS     │ [vault ×] [md-notes ×] [api: tests ×] [+]  │ REPOS       │
│              ├───────────────────────────────────────────┤             │
│ ▾ Side Proj. │ $ pnpm dev                                │ ▾ Side Proj.│
│   • vault    │ ▲ Next.js 16.3.3                          │   vault.dev…│
│   • md-notes │ - Local: http://localhost:3000            │   md-notes  │
│ ▾ alphaform  │ ✓ Ready in 1.2s                           │   portfolio │
│   • backend  │ █                                         │ ▾ alphaform │
│   • cloud-iac│                                           │   backend   │
│              │                                           │   cloud-iac │
└──────────────┴───────────────────────────────────────────┴─────────────┘
   left rail             active session group                right drawer
 (open terminals)         (tab bar + terminal)               (all repos)
```

- **Left collapsible rail: open sessions.** Grouped by workspace. Click a group to switch
  to it, click a tab to focus it. A busy indicator per tab.
- **Centre: the active session group.** A tab bar plus the focused terminal. The tab bar
  shows only the active group's tabs, so it stays short and readable.
- **Right collapsible drawer: repos.** The launcher, listing every workspace and its
  repos, with a filter box at the top.
- Both drawers collapse to nothing, leaving a full-width terminal. Their state is
  remembered.

**Open question, flagged:** the app's tab bar is global today. The terminal tab bar is a
second, nested bar inside the Terminals screen, so that is two rows of tabs. The
alternative is terminals as top-level tabs, which matches the existing pattern but makes
the global bar unusable with eight terminals open, and loses the workspace grouping that
is the whole point. Recommendation: nested, with the left rail carrying group switching.

---

## Four ways to open a terminal, all with zero path typing

### 1. Workspace screen repo list - the discoverable one

This is where you already are when you are thinking about a repo, so it is the entry path
people will find first.

Each repo row in the workspace screen shows its name, last opened time, size, AI status,
and then its actions. Today the actions are an `open` control that launches the editor,
and a remove control.

**The terminal button sits immediately to the left of the `open` control.**

```
  vault.devrealm.in    2h ago   184 MB   ✓     [ >_ ]  [ </> open ]  🗑
                                                  new     existing    existing
```

- Clicking it opens a terminal tab and switches to the Terminals screen, grouped under
  the workspace you are already looking at, which is by definition the right group
- A repo that is listed but **not yet cloned keeps showing `clone`** and offers no
  terminal, matching how the `open` action already behaves
- Hover label: "Open terminal here"
- The row has room for it, so no layout rework is needed

**Why this path matters beyond convenience:** the workspace screen is the only place in
the app that shows repos with context, staleness, size, and AI status. Putting the
terminal next to `open` makes the two read as a pair: editor or shell, same repo, same
click cost.

### 2. Global search, `⌘K` - the fastest one

Today `⌘K` fuzzy-matches workspaces and repos and opens the chosen repo in the editor.
The change is small:

- A repo result gains a **second action**: Enter opens the editor as it does now,
  `⇧Enter` (or a visible "Open terminal" affordance) opens a terminal
- **Open terminal tabs become a third result type**, so `⌘K` jumps to a running tab as
  well as launching a new one
- Ranking uses the last opened time the app already tracks, so the thing you touched five
  minutes ago is first
- The panel's title changes to reflect the third verb

**Speed promise:** `⌘K`, three characters, Enter, live shell in the right directory.
Under five keystrokes.

### 3. Right drawer - the visual one

- A tree of workspaces, then their repos
- One click on a repo opens a terminal there
- A dot or count on repos that already have terminals open
- A filter box, needed because the real machine has 44 repos
- Right-click for "open second terminal here", "open in editor", "reveal in Finder"

### 4. Left rail - getting back to what is already open

- Groups are workspaces, children are tabs
- A live activity indicator per tab, so you can see which shell is busy
- Drag to reorder tabs
- Collapse a group you are done with without closing its tabs

---

## Tabs

The tab is the unit of work, so it gets real attention:

- **Auto-named** on open, from the repo name
- **Renamed** by double-clicking the tab, for example `vault: shiki theme`
- **Auto-suffixed** when a repo has more than one tab: `backend 1`, `backend 2`, until you
  name them
- **Findable:** `⌘K` searches open tabs alongside repos, plus a recency cycler
- **Reorderable** by drag
- **Persistent:** name, working directory, and scrollback survive an app restart
- **Close-confirmed** when something is still running, the way the markdown editor already
  confirms unsaved work

---

## Requirements grounded in the actual machine

I surveyed the real filesystem. These are not hypothetical edge cases, they are the
current state of this laptop: **44 git repos across 7 workspace roots under
`~/Workspace`**, plus project folders outside it (`~/devrealm`, `~/IdeaProjects`,
`~/AndroidStudioProjects`, `~/go`, `~/interview`).

| Finding | Evidence | Requirement |
|---|---|---|
| **Repos are not all one level deep** | `alphaform-workspace` is itself a repo *and* holds 10 nested repos; most repos sit two levels below `~/Workspace`; `Alphaform/AI-POC/bedrock-token-estimation-tool` and `notes/repositories/admin-panel-fe-remix` sit three levels down | Repo discovery today only looks one level in, so the deeper ones never appear and can never get a terminal. Either discovery goes deeper, or a terminal can target any folder, not only a registered repo |
| **A workspace root can itself be a repo containing repos** | `alphaform-workspace` | Grouping must not break when a workspace and a repo are the same folder |
| **Duplicate repo names across workspaces** | `md-notes` in both `Side Projects/` and `repositories/`; `admin-panel-fe-remix` in both `repositories/` and `notes/repositories/` | Search results must show the workspace underneath the name. Tab labels must disambiguate, or show the full path on hover |
| **Many non-git folders need terminals too** | `Alphaform/RFCs`, `alphaform-workspace/{specs,planning,scripts,md-files,decision_records,meeting-notes}`, `notes/Notes` | A repos-only launcher hides a meaningful share of the places you actually work. Decide whether terminals target repos only, or any folder in a workspace |
| **Noise folders sit alongside real ones** | `.venv`, `.venv312`, `.obsidian`, `.claude`, `node_modules` | The launcher list must exclude them or the drawer becomes unusable |
| **A workspace name contains a space** | `~/Workspace/Side Projects/` | This is literally part of why typing `cd` here is annoying, and a good argument for the feature |
| **The same repo can appear under two paths** | `vault.devrealm.in/content` is a link to `md-notes` | Do not list the same repo twice |
| **Project roots exist outside `~/Workspace`** | `~/devrealm`, `~/IdeaProjects`, `~/go` | Workspaces are arbitrary registered folders, which DevRealm already supports. No change needed |

---

## What users can do

**Opening**

1. Open a terminal from the repo row in the workspace screen, one click, next to `open`
2. Open a terminal in any repo from `⌘K`, alongside the existing "open in editor"
3. Open a terminal in any repo with one click from the right drawer
4. Open a second or third terminal in the same repo
5. Have new workspaces and repos appear in the launcher automatically

**Organising**

6. See tabs grouped automatically by workspace, with no manual grouping
7. Rename any tab
8. Reorder tabs, and switch groups from the left rail
9. Collapse either drawer for a full-width terminal

**Finding**

10. Search repos *and* open terminal tabs from the one existing `⌘K` field
11. Cycle recent tabs by keyboard
12. Filter the repo tree, necessary at 44 repos
13. See which repos already have terminals open, in both the drawer and the repo rows

**Living in it**

14. Come back after an app restart to the same tabs, names, directories, and scrollback
15. See which tabs are busy from the left rail
16. Get a clickable local URL when a tab starts a dev server

---

## The "managed" part, stated as things users never do

- Never type a path, a `cd`, or a `cd ..` to start working
- Never remember where a repo lives on disk, DevRealm already knows
- Never hunt through a flat list of identical-looking shells
- Never manually create or name a group, it follows from the repo you opened
- Never lose a tab's context to an app restart
- Never quote a path containing a space

---

## Non-goals for v1

- Remote sessions, mobile, sharing
- **Isolated sandboxes or per-tab worktrees.** A tab is a shell in the real repo folder.
  Isolation is a different problem from navigation
- Splits and panes inside one tab. One tab, one shell
- Replacing the user's terminal emulator for heavy work. This is for the quick,
  context-switching 80 percent
- A shell profile or configuration UI. Inherit the user's existing shell and environment
- Running arbitrary untrusted code

---

## Deferred

Interesting, not now:

- **Agent-aware tabs:** the tab knows it is running Claude Code and shows "needs your
  input" as a state in the left rail, rather than just output. This is what would make
  the rail worth glancing at, and it is the natural tie-in with DevRealm's existing AI
  Configs feature
- Per-tab git diff against base, commit, and open PR from the tab
- Isolated worktrees so several agents can work one repo in parallel, the actual cmux use
  case
- Parking idle terminals to reclaim memory
- Session replay and export

---

## Phasing

**v0, the whole point.** Interactive terminal tabs, a terminal button on every repo row
next to `open`, `⌘K` gains "open terminal", automatic grouping by workspace, the left
rail, the right drawer. The existing "open terminal" action stops opening the file
manager.

If v0 has to be cut further, the repo row button and `⌘K` are the two entry paths that
earn their keep first. The drawer is a convenience layered on top of them.

**v1, living in it.** Tab renaming, drag reorder, recency cycler, busy indicators,
open-tab dots, drawer filter, persistence of tabs and scrollback across restart,
clickable dev-server URLs.

**v2, beyond navigation.** Pick from Deferred, most likely agent-aware tab states.

## Success signals

- v0: you stop typing `cd` in DevRealm, and the "open terminal" action stops being a lie
- v1: you keep 8 or more tabs open across 3 workspaces without losing track of any
- v2: the left rail is something you glance at, not just navigate with

---

## Open questions

1. **Do terminals target repos only, or any folder in a workspace?** The machine survey
   says repos-only hides `RFCs`, `specs`, `planning`, `meeting-notes`, and the rest. The
   cheap answer is repos-only for v0, plus a "terminal here" action on any folder later.
2. **Nested tab bar, or terminals as top-level tabs?** Recommendation above is nested,
   but it means two rows of tabs.
3. **How deep should repo discovery go?** It looks one level in today. The real tree needs
   at least three levels, with noise folders excluded.
4. **What happens to open terminals when their workspace is deleted?** Workspaces can be
   removed at any time while their terminals are running.

## Next passes

- [ ] Answer the open questions, revise this doc
- [ ] Technical design, planned separately
- [ ] v0 scope cut and build order
