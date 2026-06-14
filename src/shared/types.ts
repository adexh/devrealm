import { WORKSPACE_EXPORT_VERSION } from './constants'

export type AIConfig = {
  provider: string
  model: string
  temperature: number
  promptTemplates: Record<string, string>
}

export type AIConfigOverride = Partial<AIConfig>

export type ClaudeSettingsScope = 'shared' | 'local'

export type ClaudeSettingsFile = {
  path: string
  exists: boolean
  values: Record<string, unknown>
  error?: string | null
}

export type ClaudeSettingsSnapshot = {
  shared: ClaudeSettingsFile
  local: ClaudeSettingsFile
}

export type Workspace = {
  id: string
  name: string
  description?: string
  rootPath?: string
  github?: WorkspaceGithubConfig
  createdAt: number
  aiConfig?: AIConfig
  importedClaudeSettings?: ImportedClaudeSettings
}

export type WorkspaceGithubConfig = {
  repoUrl: string
  branch: string
}

export type WorkspaceGithubSyncStatus =
  | 'skipped'
  | 'cloned'
  | 'up-to-date'
  | 'pulled'
  | 'error'

export type WorkspaceGithubSyncResult = {
  workspaceId: string
  workspaceName: string
  status: WorkspaceGithubSyncStatus
  message?: string
}

export type WorkspaceGithubChangeSummary = {
  workspaceId: string
  branch: string
  additions: number
  deletions: number
  changedFiles: number
  hasChanges: boolean
}

export type WorkspaceGithubDiffFile = {
  path: string
  status: string
  additions: number
  deletions: number
}

export type WorkspaceGithubDiff = WorkspaceGithubChangeSummary & {
  files: WorkspaceGithubDiffFile[]
}

export type WorkspaceGithubPushResult = {
  workspaceId: string
  branch: string
  commitHash: string
  message: string
}

export type WorkspaceFileTreeNode = {
  id: string
  name: string
  relativePath: string
  absolutePath: string
  type: 'file' | 'directory'
  children?: WorkspaceFileTreeNode[]
}

export type Repo = {
  id: string
  workspaceId: string
  name: string
  path: string
  cloneUrl?: string
  lastOpenedAt: number
  size: number
  aiConfigOverride?: AIConfigOverride
}

export type CodeEditorId = string

export type CodeEditorExecutablePath =
  | {
      env: string
      segments: string[]
      absolutePath?: never
    }
  | {
      env?: never
      segments?: never
      absolutePath: string
    }

export type CodeEditorConfig = {
  id: CodeEditorId
  label: string
  macAppName?: string
  macCommand?: string
  linuxCommand: string
  windowsCommand?: string
  windowsExecutablePaths?: CodeEditorExecutablePath[]
  installUrl?: string
}

export type OpenInEditorRequest = {
  targetPath: string
  editorId?: CodeEditorId
  repoId?: string
  workspaceId?: string | null
}

export type CodeEditorSettings = {
  defaultEditorId: CodeEditorId
  editors: CodeEditorConfig[]
}

export type AppData = {
  schemaVersion: number
  workspaces: Workspace[]
  repos: Repo[]
  insights: AppInsights
}

export type AppInsights = {
  totalWorkspaceCount: number
  totalRepoCount: number
  totalDiskSize: number
  staleRepoCount: number
  activeWorkspaceCount7d: number
  updatedAt: number
}

export type AppConfig = {
  editorSettings?: CodeEditorSettings
  darkMode?: boolean
  authToken?: string
}

export type ClaudeMdFile = {
  name: string
  relativePath: string
  absolutePath: string
  exists: boolean
}

export type ClaudeMdFolder = {
  folderRelPath: string
  files: ClaudeMdFile[]
}

export type ClaudeMdSnapshot = {
  rootFiles: ClaudeMdFile[]
  folders: ClaudeMdFolder[]
}

export type MarkdownFileIdentity =
  | {
      absolutePath: string
      workspacePath?: never
      relativePath?: never
    }
  | {
      absolutePath?: never
      workspacePath: string
      relativePath: string
    }

export type MarkdownFileMetadata = {
  absolutePath: string
  workspacePath?: string
  relativePath?: string
  exists: boolean
  createdAt?: number
  updatedAt?: number
}

export type MarkdownFileContent = MarkdownFileMetadata & {
  content: string
}

export type MarkdownFileWriteRequest = MarkdownFileIdentity & {
  content: string
}

export type ImportedClaudeSettings = {
  shared?: Record<string, unknown>
  local?: Record<string, unknown>
}

export type WorkspaceExportRepository = {
  name: string
  cloneUrl: string
}

export type WorkspaceExportFile = {
  relativePath: string
  content: string
}

export type WorkspaceExport = {
  version: typeof WORKSPACE_EXPORT_VERSION
  exportedAt: string
  workspace: {
    name: string
    description?: string
    github?: WorkspaceGithubConfig
    aiConfig?: AIConfig
    claudeSettings?: ImportedClaudeSettings
  }
  repositories: WorkspaceExportRepository[]
  claudeFiles?: WorkspaceExportFile[]
}
