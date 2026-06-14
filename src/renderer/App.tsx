import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Fuse from 'fuse.js'
import { Moon, Settings, Sun, Trash2, UserRound } from 'lucide-react'
import type { CodeEditorConfig, CodeEditorExecutablePath, CodeEditorSettings, Workspace } from '../shared/types'
import { ThemeContext, CSS_VARS } from './theme'
import { FUZZY_SEARCH_THRESHOLD } from './constants'
import { Tabs, Modal, Box, Mono, FolderIcon, GitIcon, Chip, Heading, SearchBox, Btn, Label, Switch, type TabItem } from './components/ui'
import { DashboardEmpty, WorkspacesManager } from './features/dashboard'
import { TitleBar } from './components/TitleBar'
import { Spinner } from './components/Spinner'
import { UpdateNotificationModal, type UpdateState } from './components/UpdateNotificationModal'
import { useNavigation } from './hooks/useNavigation'
import { useWorkspaceStore } from './stores/workspaceStore'
import { editorTabId, isEditorTab, useNavigationStore, type Tab } from './stores/navigationStore'
import { useUiStore } from './stores/uiStore'



const SingleWorkspace = lazy(() => import('./features/workspace').then(module => ({ default: module.SingleWorkspace })))
const AIConfigScreen = lazy(() => import('./features/ai-config').then(module => ({ default: module.AIConfigScreen })))
const MarkdownEditorScreen = lazy(() => import('./features/markdown-editor').then(module => ({ default: module.MarkdownEditorScreen })))
const MarketplaceScreen = lazy(() => import('./features/marketplace').then(module => ({ default: module.MarketplaceScreen })))

type GlobalSearchItem =
  | { id: string; type: 'workspace'; title: string; subtitle: string; workspaceId: string }
  | { id: string; type: 'repo'; title: string; subtitle: string; repoId: string; repoPath: string; workspaceId: string | null }

const isMarketplaceView = new URLSearchParams(window.location.search).get('view') === 'marketplace'

function LoadingView() {
  return <div className="flex-1 flex items-center justify-center"><Spinner /></div>
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\')
}

function resolveRepoSearchPath(repoPath: string, workspace?: Workspace | null): string | null {
  const trimmedPath = repoPath.trim()
  if (!trimmedPath) return null
  if (isAbsolutePath(trimmedPath)) return trimmedPath
  if (!workspace?.rootPath) return null
  return `${workspace.rootPath.replace(/[\\/]+$/, '')}/${trimmedPath.replace(/^[\\/]+/, '')}`
}

export default function App() {
  if (isMarketplaceView) {
    return (
      <ThemeContext.Provider value={CSS_VARS}>
        <Suspense fallback={<LoadingView />}>
          <MarketplaceScreen />
        </Suspense>
      </ThemeContext.Provider>
    )
  }
  return <MainApp />
}

function MainApp() {
  const { dark, setDark } = useUiStore()
  const { workspaces, loading, fetch: refreshWorkspaces } = useWorkspaceStore()
  const { activeTab, selectedWorkspaceId, markdownEditors, handleTabChange } = useNavigationStore()
  const { globalSearchOpen, globalSearchError, setGlobalSearchError, closeGlobalSearch, openGlobalSearch } = useUiStore()
  const [editorSettingsOpen, setEditorSettingsOpen] = useState(false)
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)
  const isManualCheckRef = useRef(false)

  useNavigation()

  const syncSelectedWorkspaceGithub = useCallback(async () => {
    if (!selectedWorkspaceId) return
    const workspace = useWorkspaceStore.getState().workspaces.find(item => item.id === selectedWorkspaceId)
    if (!workspace?.github) return
    await window.electronAPI.workspaces.syncGithub(selectedWorkspaceId)
    await refreshWorkspaces()
  }, [refreshWorkspaces, selectedWorkspaceId])

  useEffect(() => {
    void syncSelectedWorkspaceGithub()
  }, [syncSelectedWorkspaceGithub])

  useEffect(() => {
    function handleFocusOrVisible() {
      if (document.visibilityState === 'hidden') return
      void syncSelectedWorkspaceGithub()
    }

    window.addEventListener('focus', handleFocusOrVisible)
    document.addEventListener('visibilitychange', handleFocusOrVisible)
    return () => {
      window.removeEventListener('focus', handleFocusOrVisible)
      document.removeEventListener('visibilitychange', handleFocusOrVisible)
    }
  }, [syncSelectedWorkspaceGithub])

  useEffect(() => {
    const offAvailable = window.electronAPI.updater.onUpdateAvailable(({ version }) => {
      const manual = isManualCheckRef.current
      isManualCheckRef.current = false
      if (!manual) {
        const dismissed = localStorage.getItem('dismissed_update_version')
        if (dismissed === version) return
      }
      setUpdateState({ stage: 'available', version })
    })
    const offNotAvailable = window.electronAPI.updater.onUpdateNotAvailable(() => {
      isManualCheckRef.current = false
      setUpdateState({ stage: 'up-to-date' })
    })
    const offError = window.electronAPI.updater.onError((message) => {
      isManualCheckRef.current = false
      setUpdateState({ stage: 'error', message })
    })
    return () => { offAvailable(); offNotAvailable(); offError() }
  }, [])

  const selectedWorkspace = workspaces.find(w => w.id === selectedWorkspaceId) ?? null
  const tabs: TabItem[] = [
    'Dashboard',
    'AI Configs',
    ...markdownEditors.map(editor => ({
      id: editorTabId(editor.id),
      label: `Editor - ${editor.name}`,
    })),
  ]

  return (
    <ThemeContext.Provider value={CSS_VARS}>
      <div className={`w-screen h-screen overflow-hidden flex flex-col bg-t-bg text-t-ink text-[14px] font-system${dark ? ' dark' : ''}`}>
        <TitleBar rightSlot={(
          <>
            <LoginButton />
            <SettingsMenu
              onEditorSettings={() => setEditorSettingsOpen(true)}
              onCheckForUpdates={() => {
                isManualCheckRef.current = true
                setUpdateState({ stage: 'checking' })
                void window.electronAPI.updater.checkForUpdates()
              }}
            />
            <ThemeToggle dark={dark} onToggle={() => setDark(!dark)} />
          </>
        )} />
        <Tabs
          active={activeTab}
          items={tabs}
          onChange={tab => handleTabChange(tab as Tab)}
          centerSlot={<SearchBox placeholder="Switch workspace or repo" width={300} height={34} onClick={openGlobalSearch} />}
        />

        {loading ? (
          <LoadingView />
        ) : isEditorTab(activeTab) ? (
          <Suspense fallback={<LoadingView />}>
            <MarkdownEditorScreen />
          </Suspense>
        ) : activeTab === 'Dashboard' ? (
          selectedWorkspace
            ? (
              <Suspense fallback={<LoadingView />}>
                <SingleWorkspace />
              </Suspense>
            )
            : workspaces.length === 0
              ? <DashboardEmpty />
              : <WorkspacesManager />
        ) : (
          <Suspense fallback={<LoadingView />}>
            <AIConfigScreen />
          </Suspense>
        )}

        {globalSearchOpen && (
          <Modal title="Jump to Workspace or Repo" onClose={closeGlobalSearch} width={640}>
            <GlobalSearchPanel />
          </Modal>
        )}

        {globalSearchError && (
          <Modal title="Error" onClose={() => setGlobalSearchError(null)} width={400}>
            <div className="text-[13px] leading-relaxed">{globalSearchError}</div>
          </Modal>
        )}

        {editorSettingsOpen && (
          <EditorSettingsModal onClose={() => setEditorSettingsOpen(false)} />
        )}

        {updateState && (
          <UpdateNotificationModal
            state={updateState}
            onClose={() => {
              if (!isManualCheckRef.current && updateState.stage === 'available') {
                localStorage.setItem('dismissed_update_version', updateState.version)
              }
              setUpdateState(null)
            }}
          />
        )}

      </div>
    </ThemeContext.Provider>
  )
}

function SettingsMenu({ onEditorSettings, onCheckForUpdates }: { onEditorSettings: () => void; onCheckForUpdates: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Open settings"
        title="Settings"
        className="h-8.5 w-8.5 inline-flex items-center justify-center rounded bg-transparent text-t-ink-soft hover:text-t-ink hover:bg-t-panel-alt cursor-pointer"
      >
        <Settings size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 min-w-43 rounded border border-t-line bg-t-bg shadow-[0_8px_24px_rgba(0,0,0,0.18)] py-1">
          <button
            type="button"
            onClick={() => { setOpen(false); onEditorSettings() }}
            className="w-full text-left px-3 py-2 text-[13px] text-t-ink hover:bg-t-panel cursor-pointer"
          >
            Editor settings
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); onCheckForUpdates() }}
            className="w-full text-left px-3 py-2 text-[13px] text-t-ink hover:bg-t-panel cursor-pointer"
          >
            Check for updates
          </button>
        </div>
      )}
    </div>
  )
}

function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  const Icon = dark ? Moon : Sun

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="h-8.5 w-8.5 inline-flex items-center justify-center rounded bg-transparent text-t-ink-soft hover:text-t-ink hover:bg-t-panel-alt cursor-pointer"
    >
      <Icon size={16} strokeWidth={2} aria-hidden="true" />
    </button>
  )
}

function LoginButton() {
  const [modalOpen, setModalOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [signInUrl, setSignInUrl] = useState('')

  function handleSignIn() {
    void window.electronAPI.auth.openSignIn()
    void window.electronAPI.auth.getSignInUrl().then(setSignInUrl)
    setModalOpen(true)
  }

  function handleCopy() {
    void navigator.clipboard.writeText(signInUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleSignIn}
        aria-label="Sign in"
        title="Sign in"
        className="h-8.5 w-8.5 inline-flex items-center justify-center rounded bg-transparent text-t-ink-soft hover:text-t-ink hover:bg-t-panel-alt cursor-pointer"
      >
        <UserRound size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      {modalOpen && (
        <Modal title="Sign in to DevRealm" onClose={() => setModalOpen(false)} width={480}>
          <div className="px-6 pb-6 flex flex-col gap-4">
            <p className="text-[14px] text-t-ink">Sign in from your browser to continue</p>
            <p className="text-[13px] text-t-ink-soft leading-relaxed">
              {"If your browser hasn't opened DevRealm for you to sign in, "}
              <a
                href={signInUrl}
                onClick={e => { e.preventDefault(); void window.electronAPI.auth.openSignIn() }}
                className="text-t-accent underline hover:opacity-80 cursor-pointer"
              >
                open it manually
              </a>
              {' or '}
              <button
                type="button"
                onClick={handleCopy}
                className="text-t-accent underline hover:opacity-80 cursor-pointer bg-transparent border-0 p-0 text-[13px]"
              >
                {copied ? 'Copied!' : 'copy the URL'}
              </button>
            </p>
          </div>
        </Modal>
      )}
    </>
  )
}

type EditorDraft = CodeEditorConfig & {
  windowsPathsText: string
}

function EditorSettingsModal({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<CodeEditorSettings | null>(null)
  const [editors, setEditors] = useState<EditorDraft[]>([])
  const [selectedEditorId, setSelectedEditorId] = useState('')
  const [defaultEditorId, setDefaultEditorId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.electronAPI.settings.getEditorSettings()
      .then(snapshot => {
        if (cancelled) return
        setSettings(snapshot)
        setDefaultEditorId(snapshot.defaultEditorId)
        setEditors(snapshot.editors.map(toEditorDraft))
        setSelectedEditorId(snapshot.defaultEditorId || snapshot.editors[0]?.id || '')
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load editor settings')
      })
    return () => { cancelled = true }
  }, [])

  function updateEditor(index: number, patch: Partial<EditorDraft>) {
    setEditors(current => current.map((editor, i) => i === index ? { ...editor, ...patch } : editor))
  }

  function updateEditorId(index: number, value: string) {
    const nextId = normalizeEditorId(value)
    const previousId = editors[index]?.id
    updateEditor(index, { id: nextId })
    if (selectedEditorId === previousId) setSelectedEditorId(nextId)
    if (defaultEditorId === previousId) setDefaultEditorId(nextId)
  }

  function addEditor() {
    const nextId = uniqueEditorId(editors)
    setEditors(current => [...current, {
      id: nextId,
      label: 'New editor',
      macAppName: '',
      macCommand: '',
      linuxCommand: '',
      windowsCommand: '',
      installUrl: '',
      windowsExecutablePaths: [],
      windowsPathsText: '',
    }])
    setSelectedEditorId(nextId)
    setDefaultEditorId(current => current || nextId)
  }

  function removeEditor(index: number) {
    setEditors(current => {
      const next = current.filter((_, i) => i !== index)
      if (!next.some(editor => editor.id === defaultEditorId)) {
        setDefaultEditorId(next[0]?.id ?? '')
      }
      if (!next.some(editor => editor.id === selectedEditorId)) {
        setSelectedEditorId(next[0]?.id ?? '')
      }
      return next
    })
  }

  async function save() {
    setError(null)
    const cleaned = editors.map(fromEditorDraft)
    const ids = cleaned.map(editor => editor.id)
    if (cleaned.some(editor => !editor.id.trim() || !editor.label.trim())) {
      setError('Every editor needs an id and label.')
      return
    }
    if (new Set(ids).size !== ids.length) {
      setError('Editor ids must be unique.')
      return
    }
    if (cleaned.some(editor => !editor.linuxCommand.trim())) {
      setError('Every editor needs a Linux command.')
      return
    }
    if (!defaultEditorId || !ids.includes(defaultEditorId)) {
      setError('Choose a default editor.')
      return
    }

    setSaving(true)
    try {
      const next = await window.electronAPI.settings.saveEditorSettings({
        defaultEditorId,
        editors: cleaned,
      })
      setSettings(next)
      setDefaultEditorId(next.defaultEditorId)
      setEditors(next.editors.map(toEditorDraft))
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save editor settings')
    } finally {
      setSaving(false)
    }
  }

  if (!settings && !error) {
    return (
      <Modal title="Editor settings" onClose={onClose} width={760}>
        <div className="text-[13px] text-t-ink-soft">Loading...</div>
      </Modal>
    )
  }

  const selectedEditorIndex = editors.findIndex(editor => editor.id === selectedEditorId)
  const selectedEditor = selectedEditorIndex >= 0 ? editors[selectedEditorIndex] : editors[0]
  const selectedIndex = selectedEditorIndex >= 0 ? selectedEditorIndex : 0
  const selectedIsDefault = Boolean(selectedEditor && selectedEditor.id === defaultEditorId)

  return (
    <Modal title="Editor settings" onClose={onClose} width={820} disableBackdropClose>
      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label>IDE configured</Label>
            <select
              value={selectedEditor?.id ?? ''}
              onChange={e => setSelectedEditorId(e.target.value)}
              className="mt-1 h-9 w-full rounded border border-t-line bg-t-bg px-2 text-[13px] text-t-ink outline-none"
            >
              {editors.map(editor => (
                <option key={editor.id} value={editor.id}>{editor.label || editor.id}</option>
              ))}
            </select>
          </div>
          <label className={`inline-flex items-center gap-2 pb-1.5 text-[13px] ${selectedEditor ? 'text-t-ink cursor-pointer' : 'text-t-ink-soft cursor-default'}`}>
            <Switch
              checked={selectedIsDefault}
              disabled={!selectedEditor}
              aria-label="Set selected editor as default"
              onCheckedChange={checked => {
                if (!selectedEditor) return
                setDefaultEditorId(checked ? selectedEditor.id : '')
              }}
            />
            Set as default
          </label>
          <Btn onClick={addEditor}>Add editor</Btn>
        </div>

        <div className="border border-t-line rounded">
          {selectedEditor ? (
            <div className="p-3.5">
              <div className="flex items-center gap-2 mb-3">
                <Heading size={12}>{selectedEditor.label || selectedEditor.id || 'Editor'}</Heading>
                {selectedIsDefault && <Chip accent>default</Chip>}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => removeEditor(selectedIndex)}
                  title="Remove editor"
                  className="h-7 w-7 inline-flex items-center justify-center rounded text-t-ink-soft hover:text-t-ink hover:bg-t-panel cursor-pointer"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Id" value={selectedEditor.id} onChange={value => updateEditorId(selectedIndex, value)} />
                <Field label="Label" value={selectedEditor.label} onChange={value => updateEditor(selectedIndex, { label: value })} />
                <Field label="macOS app name" value={selectedEditor.macAppName ?? ''} onChange={value => updateEditor(selectedIndex, { macAppName: value })} />
                <Field label="macOS command" value={selectedEditor.macCommand ?? ''} onChange={value => updateEditor(selectedIndex, { macCommand: value })} />
                <Field label="Linux command" value={selectedEditor.linuxCommand} onChange={value => updateEditor(selectedIndex, { linuxCommand: value })} />
                <Field label="Windows command" value={selectedEditor.windowsCommand ?? ''} onChange={value => updateEditor(selectedIndex, { windowsCommand: value })} />
                <Field label="Install URL" value={selectedEditor.installUrl ?? ''} onChange={value => updateEditor(selectedIndex, { installUrl: value })} />
                <div>
                  <Label>Windows executable paths</Label>
                  <textarea
                    value={selectedEditor.windowsPathsText}
                    onChange={e => updateEditor(selectedIndex, { windowsPathsText: e.target.value })}
                    className="mt-1 min-h-19 w-full resize-y rounded border border-t-line bg-t-bg px-2 py-1.5 text-[12px] text-t-ink outline-none font-mono"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 text-[13px] text-t-ink-soft">No editors configured.</div>
          )}
        </div>

        {error && <div className="text-[12px] text-red-500">{error}</div>}

        <div className="flex items-center justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary onClick={saving ? undefined : save}>{saving ? 'Saving...' : 'Save'}</Btn>
        </div>
      </div>
    </Modal>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 h-8.5 w-full rounded border border-t-line bg-t-bg px-2 text-[12px] text-t-ink outline-none"
      />
    </div>
  )
}

function toEditorDraft(editor: CodeEditorConfig): EditorDraft {
  return {
    ...editor,
    macAppName: editor.macAppName ?? '',
    macCommand: editor.macCommand ?? '',
    windowsCommand: editor.windowsCommand ?? '',
    installUrl: editor.installUrl ?? '',
    windowsExecutablePaths: editor.windowsExecutablePaths ?? [],
    windowsPathsText: (editor.windowsExecutablePaths ?? []).map(formatWindowsPath).join('\n'),
  }
}

function fromEditorDraft(editor: EditorDraft): CodeEditorConfig {
  const windowsExecutablePaths = parseWindowsPaths(editor.windowsPathsText)
  return {
    id: editor.id.trim(),
    label: editor.label.trim(),
    linuxCommand: editor.linuxCommand.trim(),
    ...(editor.macAppName?.trim() ? { macAppName: editor.macAppName.trim() } : {}),
    ...(editor.macCommand?.trim() ? { macCommand: editor.macCommand.trim() } : {}),
    ...(editor.windowsCommand?.trim() ? { windowsCommand: editor.windowsCommand.trim() } : {}),
    ...(windowsExecutablePaths.length ? { windowsExecutablePaths } : {}),
    ...(editor.installUrl?.trim() ? { installUrl: editor.installUrl.trim() } : {}),
  }
}

function formatWindowsPath(pathConfig: CodeEditorExecutablePath): string {
  if ('absolutePath' in pathConfig) return pathConfig.absolutePath ?? ''
  return `$${pathConfig.env}/${pathConfig.segments.join('/')}`
}

function parseWindowsPaths(value: string): CodeEditorExecutablePath[] {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const envMatch = line.match(/^\$([A-Z0-9_]+)[/\\](.+)$/i)
      if (envMatch) {
        return {
          env: envMatch[1],
          segments: envMatch[2].split(/[/\\]+/).filter(Boolean),
        }
      }
      return { absolutePath: line }
    })
}

function normalizeEditorId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
}

function uniqueEditorId(editors: EditorDraft[]): string {
  let index = editors.length + 1
  let id = `editor-${index}`
  const existing = new Set(editors.map(editor => editor.id))
  while (existing.has(id)) {
    index += 1
    id = `editor-${index}`
  }
  return id
}

function GlobalSearchPanel() {
  const { workspaces, repos } = useWorkspaceStore()
  const { handleTabChange, setSelectedWorkspaceId } = useNavigationStore()
  const {
    globalSearchQuery: query,
    highlightedIndex,
    closeGlobalSearch,
    setGlobalSearchQuery,
    setHighlightedIndex,
    setGlobalSearchError,
  } = useUiStore()

  const repoWorkspaceMap = useMemo(() => {
    const map = new Map<string, Workspace>()
    const workspaceById = new Map(workspaces.map(workspace => [workspace.id, workspace]))
    repos.forEach(repo => {
      const workspace = workspaceById.get(repo.workspaceId)
      if (workspace) map.set(repo.id, workspace)
    })
    return map
  }, [repos, workspaces])

  const allItems = useMemo<GlobalSearchItem[]>(() => {
    const wsItems: GlobalSearchItem[] = workspaces.map(ws => ({
      id: `workspace:${ws.id}`,
      type: 'workspace',
      title: ws.name,
      subtitle: `${repos.filter(repo => repo.workspaceId === ws.id).length} repos`,
      workspaceId: ws.id,
    }))
    const repoItems: GlobalSearchItem[] = repos.flatMap(repo => {
      const owningWs = repoWorkspaceMap.get(repo.id) ?? null
      const repoPath = resolveRepoSearchPath(repo.path, owningWs)
      if (!repoPath) return []
      return {
        id: `repo:${repo.id}`,
        type: 'repo',
        title: repo.name,
        subtitle: owningWs ? `${owningWs.name} · ${repoPath}` : repoPath,
        repoId: repo.id,
        repoPath,
        workspaceId: owningWs?.id ?? null,
      }
    })
    return [...wsItems, ...repoItems]
  }, [repoWorkspaceMap, repos, workspaces])

  const fuse = useMemo(() => new Fuse(allItems, {
    keys: [{ name: 'title', weight: 0.7 }, { name: 'subtitle', weight: 0.3 }],
    threshold: FUZZY_SEARCH_THRESHOLD,
    ignoreLocation: true,
    includeScore: true,
  }), [allItems])

  const normalized = query.trim()
  const items = normalized
    ? fuse.search(normalized).map(r => r.item).slice(0, 12)
    : allItems.slice(0, 12)

  useEffect(() => {
    setHighlightedIndex(items.length === 0 ? 0 : Math.min(highlightedIndex, items.length - 1))
  }, [highlightedIndex, items.length, setHighlightedIndex])

  async function activate(item: GlobalSearchItem) {
    if (item.type === 'workspace') {
      handleTabChange('Dashboard')
      setSelectedWorkspaceId(item.workspaceId)
      closeGlobalSearch()
      return
    }
    try {
      handleTabChange('Dashboard')
      if (item.workspaceId) setSelectedWorkspaceId(item.workspaceId)
      await window.electronAPI.repos.openInEditor({
        targetPath: item.repoPath,
        repoId: item.repoId,
        workspaceId: item.workspaceId,
      })
      closeGlobalSearch()
    } catch (error) {
      setGlobalSearchError(error instanceof Error ? error.message : 'Failed to open repository')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        autoFocus
        value={query}
        onChange={e => setGlobalSearchQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlightedIndex(items.length === 0 ? 0 : Math.min(highlightedIndex + 1, items.length - 1))
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlightedIndex(items.length === 0 ? 0 : Math.max(highlightedIndex - 1, 0))
          }
          if (e.key === 'Enter' && items[highlightedIndex]) {
            e.preventDefault()
            void activate(items[highlightedIndex])
          }
        }}
        placeholder="Search workspaces and repositories…"
        className="h-10 border border-t-line rounded px-3 text-[13px] bg-t-bg text-t-ink outline-none w-full box-border"
      />

      <div className="flex items-center gap-2">
        <Heading size={12}>Results</Heading>
        <Mono size={10} soft>{items.length}</Mono>
        <div className="flex-1" />
        <Mono size={10} soft>Enter to open</Mono>
      </div>

      {items.length > 0 ? (
        <div className="flex flex-col gap-1 max-h-95 overflow-y-auto">
          {items.map((item, index) => (
            <Box
              key={item.id}
              onClick={() => { void activate(item) }}
              className={`p-3 flex items-center gap-2.5 cursor-pointer ${highlightedIndex === index ? 'bg-t-panel' : ''}`}
            >
              {item.type === 'workspace' ? <FolderIcon size={13} /> : <GitIcon size={13} />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium truncate">{item.title}</span>
                  <Chip accent={item.type === 'workspace'}>{item.type}</Chip>
                </div>
                <Mono size={11} soft className="block truncate mt-0.5">{item.subtitle}</Mono>
              </div>
            </Box>
          ))}
        </div>
      ) : (
        <Box className="p-4 bg-t-panel">
          <div className="text-[12px] text-t-ink-soft leading-[1.55]">
            No workspaces or repositories match "{query.trim()}".
          </div>
        </Box>
      )}
    </div>
  )
}
