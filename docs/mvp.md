# 🧱 Dev Workspace Manager (AI-Ready) — MVP Specification

## 🎯 Goal

Build a lightweight desktop application that:
- Manages local developer workspaces (folders + repos)
- Provides visibility into repo usage and disk space
- Enables global and per-project AI configuration (Claude/OpenAI)
- Improves developer productivity without enforcing heavy policies

---

## 🚀 MVP Scope (V1)

### 1. 📁 Workspace Management

> A **workspace** is a named logical group of git repositories or projects. Repos in a workspace may live at different paths on disk — the workspace is not tied to a single root directory.

#### Features
- Create new workspace:
  - Name
  - Description (optional)
- Add existing repos or projects to a workspace (by path)
- List all workspaces with their member repos

#### Actions
- Open individual project from the workspace in VSCode
- Open all repos in workspace in VSCode (opens each as a separate VSCode window)
- Remove a repo from the workspace
- Delete workspace (does not delete repos on disk)

---

### 2. 🔄 Repository Management

#### Features
- Clone repository via UI
  - Input: Git URL
  - Choose destination path
  - Assign to a workspace
- Add existing repo by path → assign to a workspace
- Display repo metadata:
  - Name
  - Last opened
  - Last commit date (optional)
  - Size (MB)

#### Sorting / Filtering
- Sort by:
  - Last opened
  - Size
  - Name

---

### 3. 📊 Workspace Insights

#### Features
- Show:
  - Total size per workspace
  - Repo size breakdown
- Highlight:
  - Unused repos (not opened in X days)
  - Large repos

#### Actions
- Delete repo
- Archive (move to `/archive` folder)

---

### 4. 🤖 AI Configuration (Workspace → Project)

AI config is hierarchical. A workspace defines the default config for all its repos; a project can override any field. Effective config = workspace config merged with project overrides.

#### Levels

| Level | Scope | Stored in |
|---|---|---|
| Workspace | Default for all repos in the workspace | `workspaces.json` |
| Project | Overrides for a specific repo | `.ai-config.json` in the repo root |

#### Config Shape (same at both levels)

```json
{
  "provider": "claude",
  "model": "claude-sonnet-4-6",
  "temperature": 0.2,
  "promptTemplates": {
    "generate-api": "...",
    "write-tests": "..."
  }
}
```

All fields are optional at the project level — only overrides need to be specified.

#### UI

- Edit workspace-level config from the Workspace settings screen
- Edit project-level overrides from the Repo Details screen
- Show the **effective config** (merged) so the developer knows what will actually be used

---

### 5. ⚡ Quick Actions

For each repo:

* Open in VSCode (`code <repo-path>`)
* Open terminal
* Pull latest changes
* Copy path

---

## 🧩 Tech Stack

### Desktop App

* Electron or Tauri

### Backend (Local)

* Node.js (TypeScript)
* File system: `fs`, `path`
* Git: `simple-git`

### Storage

* Local JSON or SQLite

---

## 🏗️ Architecture

```
[ UI (Electron/Tauri) ]
        ↓
[ Local Node.js Service ]
        ↓
-------------------------
| File System (Workspaces)
| Git Repos
| AI Config Files
-------------------------
```

---

## 📂 Folder Structure

Repos can live anywhere on disk. The app maintains its own metadata store (JSON/SQLite) that tracks which repos belong to which workspace.

```
~/.workspace-manager/
  workspaces.json   ← workspace definitions + membership
  config.json       ← app-level settings

/anywhere/on/disk/
  /repo-a/.git
  /other/path/repo-b/.git
```

---

## 📦 Data Model

### Workspace

```ts
type Workspace = {
  id: string
  name: string
  description?: string
  repoIds: string[]   // ordered list of member repo IDs
  createdAt: number
}
```

### Repo

```ts
type Repo = {
  id: string
  name: string
  path: string        // absolute path on disk
  lastOpenedAt: number
  size: number        // bytes
}
```

### AIConfig

```ts
// Full config — defined at workspace level
type AIConfig = {
  provider: string
  model: string
  temperature: number
  promptTemplates: Record<string, string>
}

// Partial overrides — defined at project level, merged over workspace config
type AIConfigOverride = Partial<AIConfig>
```

`Workspace` gains an `aiConfig: AIConfig` field. `Repo` gains an optional `aiConfigOverride: AIConfigOverride` field (also written to `.ai-config.json` in the repo root).

---

## 🖥️ UI Screens

### 1. Dashboard

* List of workspaces
* Total disk usage

### 2. Workspace View

* Repo list
* Sorting + filters
* Actions

### 3. Repo Details

* Metadata
* AI config editor

---

## 🔐 Non-Goals (V1)

* No enterprise role-based access
* No enforced AI workflows
* No cloud sync
* No CI/CD integration

---

## 🧪 Future Scope (V2+)

### Team Features

* Shared workspace configs
* Sync across machines

### Enterprise Features

* Role-based AI configs
* Enforced workflows
* Audit logs

### Advanced AI

* Built-in AI assistant panel
* Workflow execution (e.g., generate API → test → docs)

---

## ⚡ Success Metrics

* Time saved managing repos
* Reduction in unused disk space
* Daily active usage
* Number of AI configs created

---

## 🧠 MVP Philosophy

* Keep it **local-first**
* Keep it **fast**
* Avoid over-engineering
* Solve **real dev pain**:

  * "Where is my repo?"
  * "Which project is eating space?"
  * "How do I standardize AI usage?"

---

## 🚀 Launch Strategy

* Target: Indie devs / backend engineers
* Distribution:

  * GitHub release
  * Product Hunt
* Positioning:

  > "A clean workspace manager for modern devs using AI"
