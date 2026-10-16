import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookmarkPlus, ChevronDown, ChevronRight, ChevronsDownUp, FilePlus, FileText, Folder, FolderInput, FolderPlus, PanelLeftClose, PanelLeftOpen, RefreshCw, Trash2 } from 'lucide-react'
import { Tree, type NodeRendererProps, type TreeApi } from 'react-arborist'
import type { ClaudeSettingsScope, ClaudeSettingsSnapshot, McpServer, Workspace, Repo, ClaudeMdSnapshot, WorkspaceGithubChangeSummary, WorkspaceGithubDiff, WorkspaceFileTreeNode } from '../../../../shared/types'
import { useWorkspaceStore } from '../../../stores/workspaceStore'
import { useNavigationStore } from '../../../stores/navigationStore'
import { useUiStore } from '../../../stores/uiStore'
import { Box, Btn, Chip, Heading, Label, Mono, FolderIcon, GitIcon, AIIcon, InfoPopover, Modal } from '../../../components/ui'
import { CLAUDE_SETTINGS_CATALOG, CLAUDE_SETTINGS_MAP, type ClaudeSettingDefinition } from '../catalog/claudeSettingsCatalog'
import { SettingCard } from './SettingCard'
import { SettingEditor } from './SettingEditor'
import { ClaudeMdSection } from './ClaudeMdSection'
import { PluginsSkillsSection, type Plugin } from './PluginsSkillsSection'
import { ScrollTable } from './ScrollTable'
import { listMcpServers } from '../ipc/mcpServers'
import { createWorkspaceFile, createWorkspaceFolder, deleteWorkspaceEntry, listWorkspaceFiles } from '../ipc/workspaceFiles'
import { SaveTemplateModal } from './SaveTemplateModal'
import { GLOBAL_AI_CONFIG_ID, GLOBAL_AI_CONFIG_LABEL } from '../constants/scope'
import { TemplatesModal } from './TemplatesModal'

type DraftState = {
  shared: Record<string, unknown>
  local: Record<string, unknown>
}

type EditorState = {
  key: string
  value: string
  error: string | null
}

type ClaudeBridge = Window['electronAPI']['claude']

type FileTreeNodeProps = NodeRendererProps<WorkspaceFileTreeNode> & {
  onOpenFile: (file: WorkspaceFileTreeNode) => void
  onRequestDelete: (file: WorkspaceFileTreeNode) => void
}

function cloneObject<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {})) as T
}

function hasOwnSetting(values: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(values, key)
}

function matchesQuery(setting: { key: string; label: string; description: string }, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return `${setting.key} ${setting.label} ${setting.description}`.toLowerCase().includes(normalized)
}

function isAvailableInScope(definition: ClaudeSettingDefinition, scope: ClaudeSettingsScope): boolean {
  return definition.availability !== 'localOnly' || scope === 'local'
}

function getInitialEditorValue(definition: ClaudeSettingDefinition | undefined, currentValue: unknown): string {
  const nextValue = currentValue ?? definition?.example
  if (definition?.type === 'boolean') return String(Boolean(nextValue))
  if (definition?.type === 'number') return typeof nextValue === 'number' ? String(nextValue) : String(definition?.example ?? '')
  if (definition?.type === 'select' || definition?.type === 'string') return String(nextValue ?? '')
  return JSON.stringify(nextValue ?? {}, null, 2)
}

function parseEditorValue(definition: ClaudeSettingDefinition | undefined, rawValue: string): unknown {
  if (!definition || definition.type === 'json') return JSON.parse(rawValue)
  if (definition.type === 'boolean') return rawValue === 'true'
  if (definition.type === 'number') {
    const parsed = Number(rawValue)
    if (Number.isNaN(parsed)) throw new Error('Enter a valid number.')
    return parsed
  }
  return rawValue
}

function groupByCategory(definitions: ClaudeSettingDefinition[]) {
  const grouped = new Map<string, ClaudeSettingDefinition[]>()
  for (const definition of definitions) {
    const bucket = grouped.get(definition.category) ?? []
    bucket.push(definition)
    grouped.set(definition.category, bucket)
  }
  return [...grouped.entries()]
}

function formatPreview(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function formatCount(value: number): string {
  return value.toLocaleString()
}

function getCustomDefinition(key: string): ClaudeSettingDefinition {
  return {
    key,
    label: key,
    description: 'This key already exists in the settings file but is not part of the built-in catalog, so it is editable as raw JSON.',
    category: 'Custom',
    type: 'json',
  }
}

function getClaudeBridge(): ClaudeBridge {
  const bridge = window.electronAPI?.claude
  if (
    !bridge
    || typeof bridge.pluginsAndSkills !== 'function'
    || typeof bridge.readSettings !== 'function'
    || typeof bridge.writeSettings !== 'function'
  ) {
    throw new Error('Claude settings bridge is unavailable. Restart the Electron app so the updated preload script is loaded.')
  }
  return bridge
}

function WorkspaceFileTreeRow({ node, style, dragHandle, onOpenFile, onRequestDelete }: FileTreeNodeProps) {
  const data = node.data
  const isDirectory = data.type === 'directory'
  const isOpen = node.isOpen
  const Icon = isDirectory ? Folder : FileText
  const Chevron = isOpen ? ChevronDown : ChevronRight
  const [menuOpen, setMenuOpen] = useState(false)

  function handleClick() {
    if (isDirectory) {
      node.toggle()
      return
    }
    onOpenFile(data)
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    node.select()
    setMenuOpen(true)
  }

  return (
    <div
      ref={dragHandle}
      style={style}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      className={node.isSelected
        ? 'relative flex items-center gap-1.5 px-2 text-[12px] text-t-ink bg-t-panel-alt cursor-pointer min-w-0'
        : 'relative flex items-center gap-1.5 px-2 text-[12px] text-t-ink hover:bg-t-panel-alt cursor-pointer min-w-0'}
      title={data.relativePath}
    >
      <span className="w-3.5 h-3.5 inline-flex items-center justify-center shrink-0 text-t-ink-softer">
        {isDirectory && <Chevron size={12} strokeWidth={2.2} aria-hidden="true" />}
      </span>
      <Icon size={13} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-t-ink-soft" />
      <span className="truncate">{data.name}</span>
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={e => { e.stopPropagation(); setMenuOpen(false) }}
            onContextMenu={e => { e.preventDefault(); setMenuOpen(false) }}
          />
          <div
            className="absolute right-2 top-6 z-50 bg-t-bg border border-t-line rounded-[3px] p-1 min-w-32"
            style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}
            onClick={e => e.stopPropagation()}
          >
            <div
              onClick={() => { setMenuOpen(false); onRequestDelete(data) }}
              className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-[#e05252] cursor-pointer rounded-[3px] hover:bg-t-panel-alt"
            >
              <Trash2 size={13} aria-hidden="true" />
              Delete
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export function AIConfigPopulated({ workspace, repos, selectedRepo, onSelectRepo, onSelect, userScope = false }: {
  workspace: Workspace
  repos: Repo[]
  selectedRepo: Repo | null
  onSelectRepo: (id: string | null) => void
  onSelect: (id: string | null) => void
  userScope?: boolean
}) {
  const { workspaces, repos: allRepos, fetch: onRefresh } = useWorkspaceStore()
  const [showWSDropdown, setShowWSDropdown] = useState(false)
  const [showRepoDropdown, setShowRepoDropdown] = useState(false)
  const wsDropdownRef = useRef<HTMLDivElement>(null)
  const repoDropdownRef = useRef<HTMLDivElement>(null)
  const [scope, setScope] = useState<ClaudeSettingsScope>('shared')
  const [settings, setSettings] = useState<ClaudeSettingsSnapshot | null>(null)
  const [drafts, setDrafts] = useState<DraftState>({ shared: {}, local: {} })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [screenError, setScreenError] = useState<string | null>(null)
  const [showConfigureModal, setShowConfigureModal] = useState(false)
  const [configureSearch, setConfigureSearch] = useState('')
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [mcpServers, setMcpServers] = useState<McpServer[]>([])
  const knowledgeBaseCollapsed = useUiStore(state => state.knowledgeBaseCollapsed)
  const toggleKnowledgeBase = useUiStore(state => state.toggleKnowledgeBase)
  const knowledgeBaseWidth = useUiStore(state => state.knowledgeBaseWidth)
  const setKnowledgeBaseWidth = useUiStore(state => state.setKnowledgeBaseWidth)
  const [mdSnapshot, setMdSnapshot] = useState<ClaudeMdSnapshot | null>(null)
  const [viewingKey, setViewingKey] = useState<string | null>(null)
  const [githubSummary, setGithubSummary] = useState<WorkspaceGithubChangeSummary | null>(null)
  const [githubDiff, setGithubDiff] = useState<WorkspaceGithubDiff | null>(null)
  const [showGithubDiff, setShowGithubDiff] = useState(false)
  const [githubDiffLoading, setGithubDiffLoading] = useState(false)
  const [githubDiffError, setGithubDiffError] = useState<string | null>(null)
  const [githubStatusError, setGithubStatusError] = useState<string | null>(null)
  const [showPushModal, setShowPushModal] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [pushing, setPushing] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)
  const [fileTree, setFileTree] = useState<WorkspaceFileTreeNode[]>([])
  const [fileTreeLoading, setFileTreeLoading] = useState(false)
  const [fileTreeError, setFileTreeError] = useState<string | null>(null)
  const treeRef = useRef<TreeApi<WorkspaceFileTreeNode> | null>(null)
  const [selectedNode, setSelectedNode] = useState<WorkspaceFileTreeNode | null>(null)
  const [creating, setCreating] = useState<'file' | 'folder' | null>(null)
  const [newEntryName, setNewEntryName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceFileTreeNode | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [templateModal, setTemplateModal] = useState<'save' | 'scaffold' | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const { openMarkdownEditor } = useNavigationStore()

  const activePath = selectedRepo?.path ?? workspace.rootPath
  const treeHeight = Math.max(360, window.innerHeight - 170)

  async function loadGithubSummary() {
    if (!workspace.github) {
      setGithubSummary(null)
      setGithubStatusError(null)
      return
    }

    try {
      const summary = await window.electronAPI.workspaces.githubStatus(workspace.id)
      setGithubSummary(summary)
      if (!summary?.hasChanges) {
        setGithubDiff(null)
        setShowGithubDiff(false)
      }
      setGithubStatusError(null)
    } catch (error) {
      setGithubSummary(null)
      setGithubStatusError(error instanceof Error ? error.message : 'Unable to read git changes.')
    }
  }

  async function loadGithubDiff() {
    if (!workspace.github) {
      setGithubDiff(null)
      setGithubDiffError(null)
      return
    }

    setGithubDiffLoading(true)
    setGithubDiffError(null)
    try {
      const diff = await window.electronAPI.workspaces.githubDiff(workspace.id)
      setGithubDiff(diff)
    } catch (error) {
      setGithubDiffError(error instanceof Error ? error.message : 'Unable to read git diff.')
    } finally {
      setGithubDiffLoading(false)
    }
  }

  useEffect(() => {
    if (!showWSDropdown) return
    function handleOutsideClick(e: MouseEvent) {
      if (wsDropdownRef.current && !wsDropdownRef.current.contains(e.target as Node)) {
        setShowWSDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [showWSDropdown])

  useEffect(() => {
    if (!showRepoDropdown) return
    function handleOutsideClick(e: MouseEvent) {
      if (repoDropdownRef.current && !repoDropdownRef.current.contains(e.target as Node)) {
        setShowRepoDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [showRepoDropdown])

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!workspace.github) {
        if (!cancelled) {
          setGithubSummary(null)
          setGithubStatusError(null)
        }
        return
      }

      try {
        const summary = await window.electronAPI.workspaces.githubStatus(workspace.id)
        if (!cancelled) {
          setGithubSummary(summary)
          if (!summary?.hasChanges) {
            setGithubDiff(null)
            setShowGithubDiff(false)
          }
          setGithubStatusError(null)
        }
      } catch (error) {
        if (!cancelled) {
          setGithubSummary(null)
          setGithubStatusError(error instanceof Error ? error.message : 'Unable to read git changes.')
        }
      }
    }

    void load()
    return () => { cancelled = true }
  }, [workspace.github, workspace.id])

  useEffect(() => {
    let cancelled = false

    async function loadWorkspaceSettings() {
      if (!activePath) {
        if (!cancelled) {
          setSettings(null)
          setDrafts({ shared: {}, local: {} })
          setPlugins([])
          setMdSnapshot(null)
          setLoading(false)
        }
        return
      }

      setLoading(true)
      setScreenError(null)
      setEditor(null)

      try {
        const claudeBridge = getClaudeBridge()
        const [snapshot, pluginData, mdData, servers] = await Promise.all([
          claudeBridge.readSettings(activePath),
          claudeBridge.pluginsAndSkills(activePath),
          claudeBridge.readMdFiles(activePath),
          listMcpServers(activePath),
        ])

        if (cancelled) return
        setSettings(snapshot)
        setDrafts({
          shared: cloneObject(snapshot.shared.values),
          local: cloneObject(snapshot.local.values),
        })
        setPlugins(pluginData)
        setMdSnapshot(mdData)
        setMcpServers(servers)
      } catch (error) {
        if (cancelled) return
        setScreenError(error instanceof Error ? error.message : 'Failed to load Claude settings.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadWorkspaceSettings()
    return () => { cancelled = true }
  }, [activePath, reloadToken])

  const refreshFileTree = useCallback(async () => {
    if (!workspace.rootPath) {
      setFileTree([])
      setFileTreeError(null)
      setFileTreeLoading(false)
      return
    }

    setFileTreeLoading(true)
    setFileTreeError(null)
    try {
      const tree = await listWorkspaceFiles(workspace.rootPath)
      setFileTree(tree)
    } catch (error) {
      setFileTree([])
      setFileTreeError(error instanceof Error ? error.message : 'Unable to list workspace files.')
    } finally {
      setFileTreeLoading(false)
    }
  }, [workspace.rootPath])

  useEffect(() => {
    void refreshFileTree()
  }, [refreshFileTree])

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    const handle = event.currentTarget
    const startX = event.clientX
    const startWidth = knowledgeBaseWidth
    handle.setPointerCapture(event.pointerId)
    const move = (moveEvent: PointerEvent) => setKnowledgeBaseWidth(startWidth + moveEvent.clientX - startX)
    const stop = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', stop)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', stop)
  }

  function startCreate(type: 'file' | 'folder') {
    setCreating(type)
    setNewEntryName('')
    setCreateError(null)
  }

  function cancelCreate() {
    setCreating(null)
    setNewEntryName('')
    setCreateError(null)
  }

  // Directory the new file/folder will be created inside, mirroring VSCode:
  // a selected folder is the target; a selected file targets its parent folder;
  // nothing selected targets the workspace root.
  function creationParentDir(): string {
    if (!selectedNode) return userScope ? '.claude' : ''
    if (selectedNode.type === 'directory') return selectedNode.relativePath
    const lastSlash = selectedNode.relativePath.lastIndexOf('/')
    return lastSlash === -1 ? '' : selectedNode.relativePath.slice(0, lastSlash)
  }

  async function submitCreate() {
    const name = newEntryName.trim()
    if (!creating || !name || !workspace.rootPath) return
    const parentDir = creationParentDir()
    const relativePath = parentDir ? `${parentDir}/${name}` : name
    setCreateError(null)
    try {
      if (creating === 'folder') {
        await createWorkspaceFolder(workspace.rootPath, relativePath)
      } else {
        await createWorkspaceFile(workspace.rootPath, relativePath)
      }
      cancelCreate()
      await refreshFileTree()
      if (parentDir) treeRef.current?.open(parentDir)
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Unable to create entry.')
    }
  }

  function requestDelete(node: WorkspaceFileTreeNode) {
    setDeleteError(null)
    setDeleteTarget(node)
  }

  async function confirmDelete() {
    if (!deleteTarget || !workspace.rootPath) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteWorkspaceEntry(workspace.rootPath, deleteTarget.relativePath)
      if (selectedNode?.relativePath === deleteTarget.relativePath) setSelectedNode(null)
      setDeleteTarget(null)
      await refreshFileTree()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Unable to delete entry.')
    } finally {
      setDeleting(false)
    }
  }

  const currentFile = settings?.[scope] ?? null
  const currentDraft = drafts[scope]
  const dirty = currentFile ? JSON.stringify(currentDraft) !== JSON.stringify(currentFile.values) : false

  const configuredDefinitions = useMemo(() => (
    CLAUDE_SETTINGS_CATALOG
      .filter(definition => isAvailableInScope(definition, scope))
      .filter(definition => hasOwnSetting(currentDraft, definition.key))
  ), [currentDraft, scope])

  const availableDefinitions = useMemo(() => (
    CLAUDE_SETTINGS_CATALOG
      .filter(definition => isAvailableInScope(definition, scope))
      .filter(definition => !hasOwnSetting(currentDraft, definition.key))
      .filter(definition => matchesQuery(definition, configureSearch))
  ), [currentDraft, scope, configureSearch])

  const customDefinitions = useMemo(() => (
    Object.keys(currentDraft)
      .filter(key => !CLAUDE_SETTINGS_MAP[key])
      .map(getCustomDefinition)
  ), [currentDraft])

  const groupedAvailableDefinitions = useMemo(() => groupByCategory(availableDefinitions), [availableDefinitions])

  function startEditing(key: string) {
    const definition = CLAUDE_SETTINGS_MAP[key] ?? getCustomDefinition(key)
    setViewingKey(null)
    setEditor({
      key,
      value: getInitialEditorValue(definition, currentDraft[key]),
      error: null,
    })
  }

  function cancelEditing() {
    setEditor(null)
  }

  function applySetting() {
    if (!editor) return
    const definition = CLAUDE_SETTINGS_MAP[editor.key]
    try {
      const parsedValue = parseEditorValue(definition, editor.value)
      setDrafts(prev => ({
        ...prev,
        [scope]: { ...prev[scope], [editor.key]: parsedValue },
      }))
      setEditor(null)
    } catch (error) {
      setEditor(prev => prev ? {
        ...prev,
        error: error instanceof Error ? error.message : 'Unable to parse this value.',
      } : prev)
    }
  }

  function removeSetting(key: string) {
    setDrafts(prev => {
      const nextScope = { ...prev[scope] }
      delete nextScope[key]
      return { ...prev, [scope]: nextScope }
    })
    if (editor?.key === key) setEditor(null)
  }

  function resetCurrentScope() {
    if (!currentFile) return
    setDrafts(prev => ({ ...prev, [scope]: cloneObject(currentFile.values) }))
    setEditor(null)
  }

  async function saveCurrentScope() {
    if (!activePath) return
    setSaving(true)
    setScreenError(null)
    try {
      const claudeBridge = getClaudeBridge()
      const snapshot = await claudeBridge.writeSettings({
        workspacePath: activePath,
        scope,
        values: currentDraft,
      })
      setSettings(snapshot)
      setDrafts(prev => ({ ...prev, [scope]: cloneObject(snapshot[scope].values) }))
      const [pluginData, servers] = await Promise.all([claudeBridge.pluginsAndSkills(activePath), listMcpServers(activePath)])
      setPlugins(pluginData)
      setMcpServers(servers)
      void loadGithubSummary()
      if (showGithubDiff) void loadGithubDiff()
      onRefresh()
    } catch (error) {
      setScreenError(error instanceof Error ? error.message : 'Failed to save Claude settings.')
    } finally {
      setSaving(false)
    }
  }

  async function pushGithubChanges() {
    if (!commitMessage.trim()) return
    setPushing(true)
    setPushError(null)
    try {
      await window.electronAPI.workspaces.githubPush({
        workspaceId: workspace.id,
        message: commitMessage,
      })
      setShowPushModal(false)
      setCommitMessage('')
      await loadGithubSummary()
      setGithubDiff(null)
      setShowGithubDiff(false)
    } catch (error) {
      setPushError(error instanceof Error ? error.message : 'Failed to push changes.')
    } finally {
      setPushing(false)
    }
  }

  async function toggleGithubDiff() {
    const nextShow = !showGithubDiff
    setShowGithubDiff(nextShow)
    if (!nextShow || githubDiff || githubDiffLoading) return

    await loadGithubDiff()
  }

  function openWorkspaceFile(file: WorkspaceFileTreeNode) {
    if (!workspace.rootPath || file.type !== 'file') return
    openMarkdownEditor({
      workspacePath: workspace.rootPath,
      relativePath: file.relativePath,
      name: file.name,
      pathLabel: file.relativePath,
      content: '',
      savedContent: '',
      loading: true,
      saving: false,
      error: null,
    })
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-6 py-3.5 border-b border-t-line flex items-center gap-3 flex-none">
        {workspace.github && githubSummary?.hasChanges && (
          <>
            <Btn onClick={() => { setPushError(null); setShowPushModal(true) }} className="shrink-0">Push</Btn>
            <button
              type="button"
              onClick={toggleGithubDiff}
              className="h-7 shrink-0 flex items-center gap-1.5 px-2.5 bg-t-panel border border-t-line rounded cursor-pointer hover:bg-t-panel-alt whitespace-nowrap"
              title="Show git differences"
            >
              <GitIcon size={12} />
              <Mono size={11} style={{ color: '#148a37' }}>
                +{formatCount(githubSummary.additions)}
              </Mono>
              <Mono size={11} style={{ color: '#d33f49' }}>
                -{formatCount(githubSummary.deletions)}
              </Mono>
            </button>
          </>
        )}
        {workspace.github && githubStatusError && (
          <Mono size={11} soft className="min-w-0 truncate whitespace-nowrap">{githubStatusError}</Mono>
        )}

        <div className="flex items-center gap-1.5 min-w-0">
        <Label className="shrink-0 whitespace-nowrap">Workspace:</Label>
        <div ref={wsDropdownRef} className="relative flex items-center min-w-0 shrink">
          <div
            onClick={() => setShowWSDropdown(v => !v)}
            className="h-7 min-w-0 flex items-center gap-1.5 px-2.5 bg-t-panel border border-t-line rounded-l cursor-pointer"
            title={workspace.name}
          >
            {userScope ? <AIIcon size={12} /> : <FolderIcon size={12} />}
            <span className="text-xs font-medium whitespace-nowrap truncate max-w-56">{workspace.name}</span>
            <Mono size={11} soft>▾</Mono>
          </div>
          <div
            onClick={() => { onSelect(null); setShowWSDropdown(false) }}
            className="h-7 shrink-0 flex items-center px-1.5 bg-t-panel border border-l-0 border-t-line rounded-r cursor-pointer text-t-ink-soft hover:text-t-ink"
            title="Clear workspace"
          >
            <span className="text-[11px] leading-none">✕</span>
          </div>
          {showWSDropdown && (
            <Box
              className="absolute top-8 left-0 z-100 bg-t-bg min-w-50 p-1"
              style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}
            >
              <div
                onClick={() => { onSelect(GLOBAL_AI_CONFIG_ID); setShowWSDropdown(false) }}
                className={userScope
                  ? 'flex items-center gap-2 px-2.5 py-2 text-[13px] cursor-pointer rounded-[3px] bg-t-panel'
                  : 'flex items-center gap-2 px-2.5 py-2 text-[13px] cursor-pointer rounded-[3px] bg-transparent'}
              >
                <AIIcon size={12} />
                <span className="flex-1">{GLOBAL_AI_CONFIG_LABEL}</span>
                <Mono size={10} soft>~/.claude</Mono>
              </div>
              <div className="my-1 border-t border-t-line" />
              {workspaces.map(ws => (
                <div
                  key={ws.id}
                  onClick={() => { onSelect(ws.id); setShowWSDropdown(false) }}
                  className={`flex items-center gap-2 px-2.5 py-2 text-[13px] cursor-pointer rounded-[3px]
                    ${ws.id === workspace.id ? 'bg-t-panel' : 'bg-transparent'}`}
                >
                  <FolderIcon size={12} />
                  <span className="flex-1">{ws.name}</span>
                  <Mono size={10} soft>{allRepos.filter(repo => repo.workspaceId === ws.id).length}</Mono>
                </div>
              ))}
            </Box>
          )}
        </div>

        </div>

        {!userScope && (
        <div className="flex items-center gap-1.5 min-w-0">
        <Label className="shrink-0 whitespace-nowrap">Repo:</Label>
        <div ref={repoDropdownRef} className="relative flex items-center min-w-0 shrink">
          <div
            onClick={() => repos.length > 0 && setShowRepoDropdown(v => !v)}
            className={`h-7 min-w-0 flex items-center gap-1.5 px-2.5 bg-t-panel border border-t-line
              ${selectedRepo ? 'rounded-l' : 'rounded'}
              ${repos.length > 0 ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
          >
            <GitIcon size={12} />
            <span className="text-xs font-medium whitespace-nowrap truncate max-w-56">
              {selectedRepo ? selectedRepo.name : repos.length === 0 ? 'No repos' : 'All (workspace)'}
            </span>
            <Mono size={11} soft>▾</Mono>
          </div>
          {selectedRepo && (
            <div
              onClick={() => { onSelectRepo(null); setShowRepoDropdown(false) }}
              className="h-7 shrink-0 flex items-center px-1.5 bg-t-panel border border-l-0 border-t-line rounded-r cursor-pointer text-t-ink-soft hover:text-t-ink"
              title="Clear repo"
            >
              <span className="text-[11px] leading-none">✕</span>
            </div>
          )}
          {showRepoDropdown && (
            <Box
              className="absolute top-8 left-0 z-100 bg-t-bg min-w-50 p-1"
              style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}
            >
              <div
                onClick={() => { onSelectRepo(null); setShowRepoDropdown(false) }}
                className={`flex items-center gap-2 px-2.5 py-2 text-[13px] cursor-pointer rounded-[3px]
                  ${selectedRepo === null ? 'bg-t-panel' : 'bg-transparent'}`}
              >
                <FolderIcon size={12} />
                <span className="flex-1 text-t-ink-soft italic">All (workspace)</span>
              </div>
              {repos.map(repo => (
                <div
                  key={repo.id}
                  onClick={() => { onSelectRepo(repo.id); setShowRepoDropdown(false) }}
                  className={`flex items-center gap-2 px-2.5 py-2 text-[13px] cursor-pointer rounded-[3px]
                    ${repo.id === selectedRepo?.id ? 'bg-t-panel' : 'bg-transparent'}`}
                >
                  <GitIcon size={12} />
                  <span className="flex-1">{repo.name}</span>
                </div>
              ))}
            </Box>
          )}
        </div>

        </div>
        )}

        <div className="flex-1" />
        {activePath && (
          <>
            <Btn onClick={() => setTemplateModal('scaffold')} className="shrink-0">
              <FolderInput size={13} aria-hidden="true" />
              Scaffold from Template
            </Btn>
            <Btn onClick={() => setTemplateModal('save')} className="shrink-0">
              <BookmarkPlus size={13} aria-hidden="true" />
              Save as Template
            </Btn>
          </>
        )}
      </div>

      <div className="flex-1 min-h-0 flex">
        {knowledgeBaseCollapsed ? (
        <aside className="border-r border-t-line bg-t-bg flex-none w-11 flex flex-col items-center pt-4">
          <button
            type="button"
            onClick={toggleKnowledgeBase}
            className="h-7 w-7 inline-flex items-center justify-center rounded text-t-ink-soft hover:text-t-ink hover:bg-t-panel-alt cursor-pointer"
            title="Show AI Knowledge base"
            aria-label="Show AI Knowledge base"
          >
            <PanelLeftOpen size={15} aria-hidden="true" />
          </button>
        </aside>
        ) : (
        <aside className="relative border-r border-t-line bg-t-bg flex-none" style={{ width: knowledgeBaseWidth }}>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize AI Knowledge base"
            title="Drag to resize"
            onPointerDown={startResize}
            className="absolute -right-1 top-0 bottom-0 w-2 z-10 cursor-col-resize hover:bg-t-line/60 active:bg-t-line"
          />
          <div className="h-full flex flex-col min-h-0">
            <div className="border-b border-t-line px-5 pt-5 pb-2.5">
              <div className="flex items-center gap-2">
                <Heading size={15}>AI Knowledge base</Heading>
                <div className="flex-1" />
                <Mono size={10} soft>{fileTree.length}</Mono>
                <button
                  type="button"
                  onClick={toggleKnowledgeBase}
                  className="h-7 w-7 -mr-1.5 inline-flex items-center justify-center rounded text-t-ink-soft hover:text-t-ink hover:bg-t-panel-alt cursor-pointer"
                  title="Hide AI Knowledge base"
                  aria-label="Hide AI Knowledge base"
                >
                  <PanelLeftClose size={15} aria-hidden="true" />
                </button>
              </div>
              <div className="mt-2.5 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => startCreate('file')}
                  className="h-7 w-7 inline-flex items-center justify-center rounded text-t-ink-soft hover:text-t-ink hover:bg-t-panel-alt cursor-pointer"
                  title="New file"
                >
                  <FilePlus size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => startCreate('folder')}
                  className="h-7 w-7 inline-flex items-center justify-center rounded text-t-ink-soft hover:text-t-ink hover:bg-t-panel-alt cursor-pointer"
                  title="New folder"
                >
                  <FolderPlus size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => void refreshFileTree()}
                  className="h-7 w-7 inline-flex items-center justify-center rounded text-t-ink-soft hover:text-t-ink hover:bg-t-panel-alt cursor-pointer"
                  title="Refresh"
                >
                  <RefreshCw size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => treeRef.current?.closeAll()}
                  className="h-7 w-7 inline-flex items-center justify-center rounded text-t-ink-soft hover:text-t-ink hover:bg-t-panel-alt cursor-pointer"
                  title="Collapse all"
                >
                  <ChevronsDownUp size={15} aria-hidden="true" />
                </button>
              </div>
            </div>
            {creating && (
              <div className="px-3 pt-2">
                <Mono size={10} soft className="block mb-1 truncate">
                  Creating in {creationParentDir() ? `${creationParentDir()}/` : 'workspace root'}
                </Mono>
                <input
                  autoFocus
                  value={newEntryName}
                  onChange={e => setNewEntryName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') void submitCreate()
                    if (e.key === 'Escape') cancelCreate()
                  }}
                  onBlur={cancelCreate}
                  placeholder={creating === 'folder' ? 'New folder name' : 'New file name'}
                  className="w-full h-7 px-2 text-[12px] bg-t-panel border border-t-line rounded outline-none focus:border-t-ink-soft"
                />
                {createError && (
                  <div className="mt-1 text-[11px] text-[#e05252]">{createError}</div>
                )}
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-hidden py-2 pl-3">
                {fileTreeLoading ? (
                  <Mono size={11} soft className="block px-3 py-1">Loading...</Mono>
                ) : fileTreeError ? (
                  <div className="mx-2 text-[11px] text-[#e05252] px-2 py-1.5 border border-[#e05252] rounded-[3px]">
                    {fileTreeError}
                  </div>
                ) : (
                  <Tree<WorkspaceFileTreeNode>
                    ref={treeRef}
                    data={fileTree}
                    width={knowledgeBaseWidth - 12}
                    height={treeHeight}
                    rowHeight={26}
                    indent={16}
                    overscanCount={8}
                    openByDefault={false}
                    initialOpenState={userScope ? { '.claude': true } : undefined}
                    onSelect={nodes => setSelectedNode(nodes.length ? nodes[nodes.length - 1].data : null)}
                  >
                    {(props) => (
                      <WorkspaceFileTreeRow
                        {...props}
                        onOpenFile={openWorkspaceFile}
                        onRequestDelete={requestDelete}
                      />
                    )}
                  </Tree>
                )}
            </div>
          </div>
        </aside>
        )}

        <div className="flex-1 overflow-auto p-5 flex flex-col gap-3.5">
        <Heading size={15}>AI Configurations</Heading>
        {showGithubDiff && githubSummary?.hasChanges && (
          <Box className="p-3.5 bg-t-panel">
            <div className="flex items-center gap-2">
              <GitIcon size={14} />
              <Heading size={13}>Git differences</Heading>
              <Mono size={11} soft>{githubSummary.branch}</Mono>
              <div className="flex-1" />
              <Mono size={11} style={{ color: '#148a37' }}>+{formatCount(githubSummary.additions)}</Mono>
              <Mono size={11} style={{ color: '#d33f49' }}>-{formatCount(githubSummary.deletions)}</Mono>
            </div>
            {githubDiffLoading && (
              <Mono size={11} soft className="block mt-2">Loading git diff...</Mono>
            )}
            {githubDiffError && (
              <div className="mt-2 text-[11px] text-[#e05252] px-2 py-1.5 border border-[#e05252] rounded-[3px]">
                {githubDiffError}
              </div>
            )}
            {githubDiff && (
              <div className="mt-3 border border-t-line rounded overflow-hidden">
                <div className="grid px-3 py-1.5 bg-t-bg border-b border-t-line text-[10px] font-semibold text-t-ink-softer uppercase gap-2"
                  style={{ gridTemplateColumns: '92px 1fr 70px 70px' }}>
                  <span>Status</span>
                  <span>File</span>
                  <span className="text-right">Added</span>
                  <span className="text-right">Deleted</span>
                </div>
                <div className="max-h-60 overflow-auto">
                  {githubDiff.files.map((file, index) => (
                    <div
                      key={`${file.path}-${index}`}
                      className={`grid px-3 py-1.75 text-[12px] gap-2 border-b border-t-line-soft last:border-b-0 ${index % 2 === 0 ? 'bg-t-panel' : 'bg-t-bg'}`}
                      style={{ gridTemplateColumns: '92px 1fr 70px 70px' }}
                    >
                      <Chip>{file.status}</Chip>
                      <Mono size={11} className="truncate">{file.path}</Mono>
                      <Mono size={11} style={{ color: '#148a37', textAlign: 'right' }}>
                        +{formatCount(file.additions)}
                      </Mono>
                      <Mono size={11} style={{ color: '#d33f49', textAlign: 'right' }}>
                        -{formatCount(file.deletions)}
                      </Mono>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Box>
        )}

        {!activePath && (
          <Box className="p-4 bg-t-panel">
            <Heading size={14}>Workspace path required</Heading>
            <div className="mt-2 text-[12px] text-t-ink-soft leading-[1.55]">
              This workspace does not have a root folder yet, so there is nowhere to read or write `.claude/settings.json`.
            </div>
          </Box>
        )}

        {activePath && (
          <>
            <PluginsSkillsSection
              plugins={plugins}
              mcpServers={mcpServers}
              loading={loading}
              workspacePath={activePath}
              onRefresh={async () => {
                const claudeBridge = getClaudeBridge()
                const [pluginData, servers] = await Promise.all([claudeBridge.pluginsAndSkills(activePath), listMcpServers(activePath)])
                setPlugins(pluginData)
                setMcpServers(servers)
                await loadGithubSummary()
              }}
            />

            <ClaudeMdSection
              workspacePath={activePath}
              snapshot={mdSnapshot}
              loading={loading}
              userScope={userScope}
            />

            <Box className="p-4 bg-t-panel">
              <div className="flex items-center gap-2 flex-wrap">
                <AIIcon size={15} />
                <Heading size={14}>Claude Code settings</Heading>
                <InfoPopover
                  title="Claude Code settings"
                  description={(
                    <>
                      This editor works on <Mono size={11}>.claude/settings.json</Mono> and <Mono size={11}>.claude/settings.local.json</Mono>. Global-only settings from <Mono size={11}>~/.claude.json</Mono> are intentionally left out here.
                    </>
                  )}
                />
                <Chip accent>{scope === 'shared' ? 'Shared project file' : 'Local override file'}</Chip>
                <div className="flex-1" />
                <Mono size={11} soft>{activePath}</Mono>
              </div>

              <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                {((userScope ? ['shared'] : ['shared', 'local']) as ClaudeSettingsScope[]).map(fileScope => {
                  const file = settings?.[fileScope]
                  const count = Object.keys(drafts[fileScope] ?? {}).length
                  const isActive = scope === fileScope
                  return (
                    <Box
                      key={fileScope}
                      onClick={() => { setScope(fileScope); setEditor(null); setViewingKey(null) }}
                      className={`p-3 cursor-pointer ${isActive ? 'bg-t-bg' : 'bg-transparent'}`}
                    >
                      <div className="flex items-center gap-2">
                        <Heading size={13}>{fileScope === 'shared' ? '.claude/settings.json' : '.claude/settings.local.json'}</Heading>
                        <InfoPopover
                          title={fileScope === 'shared' ? 'Shared project file' : 'Local override file'}
                          description={fileScope === 'shared'
                            ? 'Team-shared settings committed with the repository.'
                            : 'Personal overrides for this workspace only. Local settings win over shared ones.'}
                        />
                        {isActive && <Chip accent>active</Chip>}
                        {!file?.exists && <Chip>new file</Chip>}
                        {file?.error && <Chip>invalid JSON</Chip>}
                      </div>
                      <Mono size={11} soft className="block mt-1">{file?.path ?? 'Not loaded yet'}</Mono>
                      <div className="mt-3 flex items-center gap-2">
                        <Mono size={11}>{count} configured</Mono>
                        {file?.error && <Mono size={11} soft>{file.error}</Mono>}
                      </div>
                    </Box>
                  )
                })}
              </div>

              {!loading && (
                <div className="mt-3 pt-3 border-t border-t-line">
                  <div className="flex items-center gap-2 mb-2">
                    <Heading size={12}>Configured in this file</Heading>
                    <Mono size={10} soft>{configuredDefinitions.length + customDefinitions.length} settings</Mono>
                  </div>
                  {configuredDefinitions.length === 0 && customDefinitions.length === 0 ? (
                    <div className="text-[11px] text-t-ink-soft py-1">
                      Nothing configured yet. Use Configure to add settings.
                    </div>
                  ) : (
                    <ScrollTable
                      count={configuredDefinitions.length + customDefinitions.length}
                      columns={['w-[26%]', 'w-[26%]', '', 'w-56']}
                      bodyClassName="overflow-y-auto overflow-x-hidden max-h-96"
                      head={(
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-t-ink-soft">Setting</th>
                          <th className="text-left px-3 py-2 font-medium text-t-ink-soft">Key</th>
                          <th className="text-left px-3 py-2 font-medium text-t-ink-soft">Value</th>
                          <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                        </tr>
                      )}
                    >
                        {[...configuredDefinitions, ...customDefinitions].map((definition, i) => {
                          const isViewing = viewingKey === definition.key
                          const isEditingRow = editor?.key === definition.key
                          const rawValue = currentDraft[definition.key]
                          return (
                            <React.Fragment key={definition.key}>
                              <tr className={`border-b border-t-line last:border-b-0 ${isEditingRow || isViewing ? 'bg-t-panel' : i % 2 === 0 ? 'bg-t-bg' : ''}`}>
                                <td className="px-3 py-2 text-t-ink font-medium">
                                  <span className="block truncate">{definition.label}</span>
                                </td>
                                <td className="px-3 py-2">
                                  <Mono size={10} className="block truncate">{definition.key}</Mono>
                                </td>
                                <td className="px-3 py-2 text-t-ink-soft">
                                  <span className="block truncate">{formatPreview(rawValue)}</span>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  <div className="flex items-center gap-1 justify-end">
                                    <Btn onClick={() => { setViewingKey(isViewing ? null : definition.key); if (!isViewing) cancelEditing() }}>View</Btn>
                                    <Btn onClick={() => { isEditingRow ? cancelEditing() : startEditing(definition.key) }}>
                                      {isEditingRow ? 'Cancel' : 'Edit'}
                                    </Btn>
                                    <Btn onClick={() => removeSetting(definition.key)}>Remove</Btn>
                                  </div>
                                </td>
                              </tr>
                              {isViewing && (
                                <tr className="border-b border-t-line last:border-b-0">
                                  <td colSpan={4} className="px-3 py-2.5 bg-t-panel">
                                    <div className="text-[11px] text-t-ink-soft mb-1.5 leading-normal">{definition.description}</div>
                                    <pre className="m-0 p-2 rounded border border-t-line text-[10px] bg-t-bg whitespace-pre-wrap break-all font-mono">
                                      {formatPreview(rawValue)}
                                    </pre>
                                  </td>
                                </tr>
                              )}
                              {isEditingRow && (
                                <tr className="border-b border-t-line last:border-b-0">
                                  <td colSpan={4} className="px-3 py-2.5 bg-t-panel">
                                    <div className="flex flex-col gap-2">
                                      <SettingEditor
                                        definition={definition}
                                        value={editor!.value}
                                        onChange={value => setEditor(prev => prev ? { ...prev, value, error: null } : prev)}
                                      />
                                      {editor?.error && (
                                        <div className="text-[11px] text-[#e05252] px-2 py-1.5 border border-[#e05252] rounded-[3px]">
                                          {editor.error}
                                        </div>
                                      )}
                                      <div className="flex gap-2">
                                        <Btn primary onClick={applySetting}>Apply</Btn>
                                        <Btn onClick={cancelEditing}>Cancel</Btn>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          )
                        })}
                    </ScrollTable>
                  )}
                </div>
              )}

              {!loading && (
                <div className="mt-3 pt-3 border-t border-t-line flex items-center gap-2">
                  {dirty
                    ? <Chip accent>Unsaved changes</Chip>
                    : <Mono size={11} soft>Saved</Mono>}
                  <div className="flex-1" />
                  <Btn onClick={() => setShowConfigureModal(true)}>Configure</Btn>
                  <Btn onClick={resetCurrentScope} style={{ opacity: dirty ? 1 : 0.4 }}>Reset</Btn>
                  <Btn primary onClick={saveCurrentScope} style={{ opacity: dirty && !saving ? 1 : 0.4 }}>
                    {saving ? 'Saving…' : 'Save'}
                  </Btn>
                </div>
              )}
            </Box>

            {screenError && (
              <div className="text-[11px] text-[#e05252] px-3 py-2 border border-[#e05252] rounded-[3px]">
                {screenError}
              </div>
            )}

            {!loading && currentFile?.error && (
              <div className="text-[11px] text-[#e05252] px-3 py-2 border border-[#e05252] rounded-[3px]">
                The current file could not be parsed, so it was loaded as empty. Saving will replace it with valid JSON.
              </div>
            )}

            {showConfigureModal && (
              <Modal
                title={`Available to configure · ${scope === 'shared' ? '.claude/settings.json' : '.claude/settings.local.json'}`}
                width={1080}
                onClose={() => {
                  setShowConfigureModal(false)
                  setConfigureSearch('')
                  if (editor && !hasOwnSetting(currentDraft, editor.key)) setEditor(null)
                }}
              >
                <div className="flex flex-col gap-3 max-h-[75vh]">
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <Label>Filter settings</Label>
                      <input
                        autoFocus
                        value={configureSearch}
                        onChange={e => setConfigureSearch(e.target.value)}
                        placeholder="Search by key or description…"
                        className="mt-1 h-8 border border-t-line rounded px-2.5 text-[12px] bg-t-bg text-t-ink outline-none w-full box-border"
                      />
                    </div>
                    <div className="pb-0.5">
                      <Mono size={11} soft>{availableDefinitions.length} visible</Mono>
                    </div>
                  </div>

                  <div className="overflow-auto pr-1 flex flex-col gap-3">
                    {groupedAvailableDefinitions.length === 0 ? (
                      <Box className="p-4 bg-t-panel">
                        <div className="text-[12px] text-t-ink-soft leading-[1.55]">
                          Every built-in setting visible for this scope is already configured, or your filter is hiding the rest.
                        </div>
                      </Box>
                    ) : (
                      groupedAvailableDefinitions.map(([category, definitions]) => (
                        <div key={category} className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <Heading size={12}>{category}</Heading>
                            <Mono size={10} soft>{definitions.length}</Mono>
                          </div>
                          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                            {definitions.map(definition => (
                              <SettingCard
                                key={definition.key}
                                definition={definition}
                                value={undefined}
                                isEditing={editor?.key === definition.key}
                                editorValue={editor?.key === definition.key ? editor.value : ''}
                                editorError={editor?.key === definition.key ? editor.error : null}
                                onEditorChange={value => setEditor(prev => prev ? { ...prev, value, error: null } : prev)}
                                onStartEdit={() => startEditing(definition.key)}
                                onCancelEdit={cancelEditing}
                                onApply={applySetting}
                                onRemove={() => removeSetting(definition.key)}
                              />
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </Modal>
            )}

            {showPushModal && githubSummary && (
              <Modal title="Push workspace changes" width={460} onClose={() => !pushing && setShowPushModal(false)}>
                <div className="flex flex-col gap-3">
                  <div className="text-[13px] text-t-ink-soft leading-relaxed">
                    Commit and push AI config changes to branch <Mono size={12}>{githubSummary.branch}</Mono>.
                  </div>
                  <div>
                    <Label>Commit message</Label>
                    <input
                      autoFocus
                      value={commitMessage}
                      onChange={e => setCommitMessage(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') void pushGithubChanges()
                        if (e.key === 'Escape' && !pushing) setShowPushModal(false)
                      }}
                      placeholder="Describe the AI config update"
                      className="mt-1 h-8 border border-t-line rounded px-2.5 text-[12px] bg-t-bg text-t-ink outline-none w-full box-border"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Mono size={11} soft>{githubSummary.changedFiles} files</Mono>
                    <Mono size={11} style={{ color: '#148a37' }}>+{formatCount(githubSummary.additions)}</Mono>
                    <Mono size={11} style={{ color: '#d33f49' }}>-{formatCount(githubSummary.deletions)}</Mono>
                  </div>
                  {pushError && (
                    <div className="text-[11px] text-[#e05252] px-2 py-1.5 border border-[#e05252] rounded-[3px]">
                      {pushError}
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Btn onClick={() => !pushing && setShowPushModal(false)}>Cancel</Btn>
                    <Btn
                      primary
                      onClick={pushGithubChanges}
                      style={{ opacity: commitMessage.trim() && !pushing ? 1 : 0.45 }}
                    >
                      {pushing ? 'Pushing...' : 'Push'}
                    </Btn>
                  </div>
                </div>
              </Modal>
            )}

          </>
        )}
        </div>
      </div>

      {activePath && templateModal === 'save' && (
        <SaveTemplateModal
          sourcePath={activePath}
          sourceLabel={selectedRepo ? `${workspace.name} / ${selectedRepo.name}` : workspace.name}
          kind={userScope ? 'user' : selectedRepo ? 'project' : 'workspace'}
          onClose={() => setTemplateModal(null)}
        />
      )}

      {activePath && templateModal === 'scaffold' && (
        <TemplatesModal
          targetPath={activePath}
          targetLabel={selectedRepo ? `${workspace.name} / ${selectedRepo.name}` : workspace.name}
          onClose={() => setTemplateModal(null)}
          onInstalled={() => {
            setReloadToken(token => token + 1)
            void refreshFileTree()
            void loadGithubSummary()
          }}
        />
      )}

      {deleteTarget && (
        <Modal title="Delete" width={420} onClose={() => !deleting && setDeleteTarget(null)}>
          <div className="flex flex-col gap-3">
            <div className="text-[13px] text-t-ink-soft leading-relaxed">
              Are you sure you want to delete {deleteTarget.type === 'directory' ? 'folder' : 'file'}{' '}
              <Mono size={12}>{deleteTarget.relativePath}</Mono>?
              {deleteTarget.type === 'directory' && ' Everything inside it will be removed.'} This cannot be undone.
            </div>
            {deleteError && (
              <div className="text-[11px] text-[#e05252] px-2 py-1.5 border border-[#e05252] rounded-[3px]">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Btn onClick={() => !deleting && setDeleteTarget(null)}>Cancel</Btn>
              <Btn
                primary
                onClick={confirmDelete}
                style={{ opacity: deleting ? 0.45 : 1 }}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
