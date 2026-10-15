import type {
  Workspace,
  Repo,
  ClaudeSettingsSnapshot,
  ClaudeSettingsScope,
  ClaudeMdSnapshot,
  MarkdownFileContent,
  MarkdownFileIdentity,
  MarkdownFileMetadata,
  MarkdownFileWriteRequest,
  CodeEditorSettings,
  OpenInEditorRequest,
  AppData,
  WorkspaceGithubConfig,
  WorkspaceGithubChangeSummary,
  WorkspaceGithubDiff,
  WorkspaceGithubPushResult,
  WorkspaceGithubSyncResult,
  WorkspaceFileTreeNode,
  AuthUser,
  UpdateCheckResult,
} from '../shared/types'
import type {
  AttachResult,
  ControlEvent,
  TerminalOpenRequest,
  TerminalSessionInfo,
} from '../shared/terminal'

interface ElectronAPI {
  platform: string
  initialData: AppData
  settings: {
    getEditorSettings: () => Promise<CodeEditorSettings>
    saveEditorSettings: (settings: CodeEditorSettings) => Promise<CodeEditorSettings>
    setDarkMode: (dark: boolean) => Promise<void>
  }
  workspaces: {
    snapshot: () => Promise<AppData>
    list: () => Promise<Workspace[]>
    listFiles: (rootPath: string) => Promise<WorkspaceFileTreeNode[]>
    createFile: (data: { rootPath: string; relativePath: string }) => Promise<void>
    createFolder: (data: { rootPath: string; relativePath: string }) => Promise<void>
    deleteEntry: (data: { rootPath: string; relativePath: string }) => Promise<void>
    create: (data: { name: string; description?: string; rootPath?: string; github?: Partial<WorkspaceGithubConfig> }) => Promise<Workspace>
    update: (ws: Workspace) => Promise<Workspace>
    delete: (id: string) => Promise<void>
    export: (id: string) => Promise<string | null>
    import: (data: { rootPath: string; filePath: string }) => Promise<{ workspace: Workspace; repos: Repo[] } | null>
    syncGithub: {
      (workspaceId: string): Promise<WorkspaceGithubSyncResult | null>
      (): Promise<WorkspaceGithubSyncResult[]>
    }
    githubStatus: (workspaceId: string) => Promise<WorkspaceGithubChangeSummary | null>
    githubDiff: (workspaceId: string) => Promise<WorkspaceGithubDiff | null>
    githubPush: (data: { workspaceId: string; message: string }) => Promise<WorkspaceGithubPushResult>
    cloneGithub: (workspaceId: string) => Promise<Workspace>
    browseDir: () => Promise<string | null>
    browseImportFile: () => Promise<string | null>
    openFromDir: (data: { dirPath: string; github?: Partial<WorkspaceGithubConfig> }) => Promise<{ workspace: Workspace; repos: Repo[] }>
  }
  repos: {
    list: () => Promise<Repo[]>
    add: (data: { repoPath: string; workspaceId: string }) => Promise<Repo>
    browse: () => Promise<string | null>
    clone: (data: { url: string; destDir: string; workspaceId: string; repoId?: string }) => Promise<Repo>
    onCloneProgress: (cb: (line: string) => void) => () => void
    stopClone: () => Promise<void>
    pathExists: (folderPath: string) => Promise<boolean>
    deleteFolder: (folderPath: string) => Promise<void>
    removeFromWorkspace: (data: { repoId: string; workspaceId: string }) => Promise<void>
    delete: (id: string) => Promise<void>
    update: (repo: Repo) => Promise<Repo>
    openInEditor: (data: OpenInEditorRequest) => Promise<void>
    openVSCode: (repoPath: string) => Promise<void>
    openTerminal: (repoPath: string) => Promise<void>
    pull: (repoPath: string) => Promise<void>
    checkAiCoverage: (repos: { id: string; path: string }[]) => Promise<Record<string, boolean>>
    scanWorkspace: (data: { workspacePath: string; existingRepoPaths: string[] }) => Promise<{ name: string; path: string }[]>
  }
  browse: {
    destDir: () => Promise<string | null>
  }
  shell: {
    openExternal: (url: string) => Promise<void>
  }
  terminals: {
    list: () => Promise<TerminalSessionInfo[]>
    open: (request: TerminalOpenRequest) => Promise<TerminalSessionInfo>
    close: (id: string) => Promise<void>
    rename: (data: { id: string; title: string }) => Promise<void>
    attach: (data: { id: string; cols: number; rows: number }) => Promise<AttachResult | null>
    detach: (id: string) => Promise<void>
    clear: (id: string) => Promise<void>
    onEvent: (cb: (event: ControlEvent) => void) => () => void
  }
  markdown: {
    readFile: (data: MarkdownFileIdentity) => Promise<MarkdownFileContent>
    writeFile: (data: MarkdownFileWriteRequest) => Promise<MarkdownFileMetadata>
    createFile: (data: MarkdownFileWriteRequest) => Promise<MarkdownFileMetadata>
  }
  auth: {
    getUser: () => Promise<AuthUser | null>
    signOut: () => Promise<void>
    openSignIn: () => Promise<void>
    getSignInUrl: () => Promise<string>
    onChanged: (cb: (user: AuthUser) => void) => () => void
    onError: (cb: (message: string) => void) => () => void
  }
  updater: {
    checkForUpdates: () => Promise<UpdateCheckResult>
    openReleasePage: () => Promise<void>
    onUpdateAvailable: (cb: (info: { latestVersion: string }) => void) => () => void
  }
  claude: {
    pluginsAndSkills: (workspacePath?: string) => Promise<{ id: string; name: string; version: string; description: string; enabled: boolean; skills: { name: string; description: string }[] }[]>
    readSettings: (workspacePath?: string) => Promise<ClaudeSettingsSnapshot>
    writeSettings: (data: { workspacePath: string; scope: ClaudeSettingsScope; values: Record<string, unknown> }) => Promise<ClaudeSettingsSnapshot>
    readMdFiles: (workspacePath: string) => Promise<ClaudeMdSnapshot>
    createMdFile: (data: { workspacePath: string; relativePath: string; content: string }) => Promise<string>
    openFileInEditor: (data: OpenInEditorRequest) => Promise<void>
    openFileVSCode: (filePath: string) => Promise<void>
    setPluginEnabled: (data: { workspacePath: string; pluginId: string; enabled: boolean }) => Promise<void>
    removePlugin: (data: { workspacePath: string; pluginId: string }) => Promise<void>
    listMarketplaces: () => Promise<{ id: string; source: { source: string; repo: string }; installLocation: string; lastUpdated: string; pluginCount: number }[]>
    fetchMarketplacePlugins: (source: { source: string; repo: string }) => Promise<{ name: string; description: string; category: string; homepage: string; sourceLabel: string }[]>
    fetchMcpRegistry: (search?: string, cursor?: string) => Promise<{ servers: { name: string; title: string; description: string; version: string; websiteUrl: string; repositoryUrl: string; officialStatus: string; remotes: { type: string; url: string }[]; packages: { registryType: string; identifier: string; label: string }[] }[]; nextCursor: string | null; count: number }>
    openMarketplaceWindow: () => Promise<void>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
