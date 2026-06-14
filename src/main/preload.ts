import { contextBridge, ipcRenderer } from 'electron'
import type { AuthUser } from '../shared/types'

const initialData = ipcRenderer.sendSync('workspaces:initial-data')

const api = {
  settings: {
    getEditorSettings: () => ipcRenderer.invoke('settings:get-editor-settings'),
    saveEditorSettings: (settings: unknown) => ipcRenderer.invoke('settings:save-editor-settings', settings),
    setDarkMode: (dark: boolean) => ipcRenderer.invoke('settings:set-dark-mode', dark),
  },
  workspaces: {
    snapshot: () => ipcRenderer.invoke('workspaces:snapshot'),
    list: () => ipcRenderer.invoke('workspaces:list'),
    listFiles: (rootPath: string) => ipcRenderer.invoke('workspaces:list-files', rootPath),
    create: (data: { name: string; description?: string; rootPath?: string; github?: { repoUrl: string; branch?: string } }) => ipcRenderer.invoke('workspaces:create', data),
    update: (ws: unknown) => ipcRenderer.invoke('workspaces:update', ws),
    delete: (id: string) => ipcRenderer.invoke('workspaces:delete', id),
    export: (id: string) => ipcRenderer.invoke('workspaces:export', id),
    import: (data: { rootPath: string; filePath: string }) => ipcRenderer.invoke('workspaces:import', data),
    syncGithub: (workspaceId?: string) => ipcRenderer.invoke('workspaces:sync-github', workspaceId),
    githubStatus: (workspaceId: string) => ipcRenderer.invoke('workspaces:github-status', workspaceId),
    githubDiff: (workspaceId: string) => ipcRenderer.invoke('workspaces:github-diff', workspaceId),
    githubPush: (data: { workspaceId: string; message: string }) => ipcRenderer.invoke('workspaces:github-push', data),
    cloneGithub: (workspaceId: string) => ipcRenderer.invoke('workspaces:clone-github', workspaceId),
    browseDir: () => ipcRenderer.invoke('workspaces:browse-dir'),
    browseImportFile: () => ipcRenderer.invoke('workspaces:browse-import-file'),
    openFromDir: (data: { dirPath: string; github?: { repoUrl: string; branch?: string } }) => ipcRenderer.invoke('workspaces:open-from-dir', data),
  },
  repos: {
    list: () => ipcRenderer.invoke('repos:list'),
    add: (data: { repoPath: string; workspaceId: string }) => ipcRenderer.invoke('repos:add', data),
    browse: () => ipcRenderer.invoke('repos:browse'),
    clone: (data: { url: string; destDir: string; workspaceId: string; repoId?: string }) => ipcRenderer.invoke('repos:clone', data),
    onCloneProgress: (cb: (line: string) => void) => {
      const handler = (_: unknown, line: string) => cb(line)
      ipcRenderer.on('repos:clone:progress', handler)
      return () => ipcRenderer.removeListener('repos:clone:progress', handler)
    },
    stopClone: () => ipcRenderer.invoke('repos:clone:stop'),
    pathExists: (folderPath: string) => ipcRenderer.invoke('repos:path-exists', folderPath),
    deleteFolder: (folderPath: string) => ipcRenderer.invoke('repos:delete-folder', folderPath),
    removeFromWorkspace: (data: { repoId: string; workspaceId: string }) => ipcRenderer.invoke('repos:remove-from-workspace', data),
    delete: (id: string) => ipcRenderer.invoke('repos:delete', id),
    update: (repo: unknown) => ipcRenderer.invoke('repos:update', repo),
    openInEditor: (data: { targetPath: string; editorId?: string }) => ipcRenderer.invoke('repos:open-editor', data),
    openVSCode: (repoPath: string) => ipcRenderer.invoke('repos:open-vscode', repoPath),
    openTerminal: (repoPath: string) => ipcRenderer.invoke('repos:open-terminal', repoPath),
    pull: (repoPath: string) => ipcRenderer.invoke('repos:pull', repoPath),
    checkAiCoverage: (repos: { id: string; path: string }[]) => ipcRenderer.invoke('repos:check-ai-coverage', repos),
    scanWorkspace: (data: { workspacePath: string; existingRepoPaths: string[] }) => ipcRenderer.invoke('repos:scan-workspace', data),
  },
  browse: {
    destDir: () => ipcRenderer.invoke('browse:dest-dir'),
  },
  markdown: {
    readFile: (data: { absolutePath: string } | { workspacePath: string; relativePath: string }) => ipcRenderer.invoke('markdown:read-file', data),
    writeFile: (data: ({ absolutePath: string } | { workspacePath: string; relativePath: string }) & { content: string }) => ipcRenderer.invoke('markdown:write-file', data),
    createFile: (data: ({ absolutePath: string } | { workspacePath: string; relativePath: string }) & { content: string }) => ipcRenderer.invoke('markdown:create-file', data),
  },
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),
    openReleasePage: () => ipcRenderer.invoke('updater:open-release-page'),
    onUpdateAvailable: (cb: (info: { version: string }) => void) => {
      const handler = (_: unknown, info: { version: string }) => cb(info)
      ipcRenderer.on('updater:update-available', handler)
      return () => ipcRenderer.removeListener('updater:update-available', handler)
    },
    onUpdateNotAvailable: (cb: () => void) => {
      ipcRenderer.on('updater:update-not-available', cb)
      return () => ipcRenderer.removeListener('updater:update-not-available', cb)
    },
    onError: (cb: (message: string) => void) => {
      const handler = (_: unknown, message: string) => cb(message)
      ipcRenderer.on('updater:error', handler)
      return () => ipcRenderer.removeListener('updater:error', handler)
    },
  },
  auth: {
    getUser: () => ipcRenderer.invoke('auth:get-user'),
    signOut: () => ipcRenderer.invoke('auth:sign-out'),
    openSignIn: () => ipcRenderer.invoke('auth:open-sign-in'),
    getSignInUrl: () => ipcRenderer.invoke('auth:get-sign-in-url') as Promise<string>,
    onChanged: (cb: (user: AuthUser) => void) => {
      const handler = (_: unknown, user: AuthUser) => cb(user)
      ipcRenderer.on('auth:changed', handler)
      return () => ipcRenderer.removeListener('auth:changed', handler)
    },
    onError: (cb: (message: string) => void) => {
      const handler = (_: unknown, message: string) => cb(message)
      ipcRenderer.on('auth:error', handler)
      return () => ipcRenderer.removeListener('auth:error', handler)
    },
  },
  claude: {
    pluginsAndSkills: (workspacePath?: string) => ipcRenderer.invoke('claude:plugins-and-skills', workspacePath),
    readSettings: (workspacePath?: string) => ipcRenderer.invoke('claude:read-settings', workspacePath),
    writeSettings: (data: { workspacePath: string; scope: 'shared' | 'local'; values: Record<string, unknown> }) => ipcRenderer.invoke('claude:write-settings', data),
    readMdFiles: (workspacePath: string) => ipcRenderer.invoke('claude:read-md-files', workspacePath),
    createMdFile: (data: { workspacePath: string; relativePath: string; content: string }) => ipcRenderer.invoke('claude:create-md-file', data),
    openFileInEditor: (data: { targetPath: string; editorId?: string }) => ipcRenderer.invoke('claude:open-file-editor', data),
    openFileVSCode: (filePath: string) => ipcRenderer.invoke('claude:open-file-vscode', filePath),
    setPluginEnabled: (data: { workspacePath: string; pluginId: string; enabled: boolean }) => ipcRenderer.invoke('claude:set-plugin-enabled', data),
    removePlugin: (data: { workspacePath: string; pluginId: string }) => ipcRenderer.invoke('claude:remove-plugin', data),
    listMarketplaces: () => ipcRenderer.invoke('claude:list-marketplaces'),
    fetchMarketplacePlugins: (source: { source: string; repo: string }) => ipcRenderer.invoke('claude:fetch-marketplace-plugins', source),
    fetchMcpRegistry: (search?: string, cursor?: string) => ipcRenderer.invoke('claude:fetch-mcp-registry', search, cursor),
    openMarketplaceWindow: () => ipcRenderer.invoke('claude:open-marketplace-window'),
  },
}

contextBridge.exposeInMainWorld('electronAPI', {
  ...api,
  platform: process.platform,
  initialData,
})
