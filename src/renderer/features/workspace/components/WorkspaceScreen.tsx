import React, { useState, useEffect } from 'react'
import { Check, Upload, SquareCode, Trash2 } from 'lucide-react'
import type { Workspace, Repo, ClaudeSettingsSnapshot, ClaudeMdSnapshot } from '../../../../shared/types'
import { useTheme } from '../../../theme'
import {
  Box, Btn, Chip, Label, Heading, Mono, Bar, StackedBar, Treemap,
  FolderIcon, GitIcon, AIIcon, Modal,
} from '../../../components/ui'
import { fmtSize, relTime } from '../../dashboard'
import type { Plugin } from '../../ai-config/components/PluginsSkillsSection'
import { useWorkspaceStore } from '../../../stores/workspaceStore'
import { useNavigationStore } from '../../../stores/navigationStore'
import { STALE_REPO_MS } from '../../../constants'
import { deleteWorkspace, exportWorkspace } from '../ipc/workspaces'
import { addRepo, checkPathExists, checkRepoAiCoverage, cloneRepo, deleteFolderAtPath, openRepoInEditor, removeRepoFromWorkspace } from '../ipc/repos'
import { CloneTerminal, type CloneTerminalHandle } from './CloneTerminal'
import { ScanReposModal } from './ScanReposModal'
import { listClaudePluginsAndSkills, readClaudeMdFiles, readClaudeSettings } from '../ipc/claude'

export function SingleWorkspace() {
  const { workspaces, repos: allRepos, fetch: onRefresh } = useWorkspaceStore()
  const { selectedWorkspaceId, setSelectedWorkspaceId, navigateToAIConfig } = useNavigationStore()

  const workspace = workspaces.find(w => w.id === selectedWorkspaceId)!
  const repos = allRepos.filter(repo => repo.workspaceId === workspace.id)
  const onBack = () => setSelectedWorkspaceId(null)

  const t = useTheme()
  const [cloneTarget, setCloneTarget] = useState<Repo | null>(null)
  const [showClone, setShowClone] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [repoSearch, setRepoSearch] = useState('')
  const [staleOnly, setStaleOnly] = useState(false)
  const [coverageMap, setCoverageMap] = useState<Record<string, boolean>>({})
  const [cloningRepoIds, setCloningRepoIds] = useState<Set<string>>(() => new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showScan, setShowScan] = useState(false)
  const [sortCol, setSortCol] = useState<'name' | 'lastOpenedAt' | 'size' | 'ai'>('lastOpenedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function handleSort(col: 'name' | 'lastOpenedAt' | 'size' | 'ai') {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir(col === 'name' ? 'asc' : 'desc')
    }
  }

  useEffect(() => {
    let cancelled = false
    const coverageItems = [
      ...(workspace.rootPath ? [{ id: workspace.id, path: workspace.rootPath }] : []),
      ...repos.filter(r => r.path).map(r => ({ id: r.id, path: r.path })),
    ]
    if (!coverageItems.length) return
    checkRepoAiCoverage(coverageItems).then(nextCoverageMap => {
      if (!cancelled) setCoverageMap(nextCoverageMap)
    })
    return () => { cancelled = true }
  }, [workspace.id, workspace.rootPath, repos])

  const totalSize = repos.reduce((a, r) => a + r.size, 0)
  const stale = repos.filter(r => Date.now() - r.lastOpenedAt > STALE_REPO_MS)
  const workspaceHasAi = coverageMap[workspace.id] ?? false
  const isRepoAiConfigured = (repo: Repo) => coverageMap[repo.id] === true || workspaceHasAi
  const configured = repos.filter(isRepoAiConfigured)
  const sorted = [...repos].sort((a, b) => {
    let cmp = 0
    if (sortCol === 'name') cmp = a.name.localeCompare(b.name)
    else if (sortCol === 'lastOpenedAt') cmp = a.lastOpenedAt - b.lastOpenedAt
    else if (sortCol === 'size') cmp = a.size - b.size
    else if (sortCol === 'ai') cmp = (isRepoAiConfigured(a) ? 1 : 0) - (isRepoAiConfigured(b) ? 1 : 0)
    return sortDir === 'asc' ? cmp : -cmp
  })
  const normalizedRepoSearch = repoSearch.trim().toLowerCase()
  const filteredRepos = sorted
    .filter(repo => !staleOnly || Date.now() - repo.lastOpenedAt > STALE_REPO_MS)
    .filter(repo => !normalizedRepoSearch || repo.name.toLowerCase().includes(normalizedRepoSearch))

  const treemapItems = [...repos]
    .filter(r => r.size > 0)
    .sort((a, b) => b.size - a.size)
    .slice(0, 8)
    .map(r => ({ label: r.name, value: r.size, size: fmtSize(r.size) }))

  async function handleExport() {
    try {
      await exportWorkspace(workspace.id)
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to export workspace')
    }
  }

  async function handleDeleteWorkspace() {
    await deleteWorkspace(workspace.id)
    onRefresh()
    onBack()
  }

  async function handleDeleteRepo(repoId: string) {
    await removeRepoFromWorkspace(repoId, workspace.id)
    onRefresh()
  }

  async function handleCloneImportedRepo(repo: Repo) {
    if (cloningRepoIds.has(repo.id)) return
    if (!repo.cloneUrl) {
      setErrorMsg('Repository clone URL is missing')
      return
    }
    if (!workspace.rootPath) {
      setErrorMsg('Workspace path is missing. Set a workspace path before cloning repositories.')
      return
    }

    setCloningRepoIds(prev => new Set(prev).add(repo.id))
    try {
      await cloneRepo({ url: repo.cloneUrl, destDir: workspace.rootPath, workspaceId: workspace.id, repoId: repo.id })
      onRefresh()
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Clone failed')
    } finally {
      setCloningRepoIds(prev => {
        const next = new Set(prev)
        next.delete(repo.id)
        return next
      })
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Breadcrumb */}
      <div className="px-6 py-3 border-b border-t-line flex items-center gap-2.5 flex-none">
        <Mono size={11} soft className="cursor-pointer underline" onClick={onBack}>Workspaces</Mono>
        <Mono size={11} soft>/</Mono>
        <FolderIcon size={13} />
        <Heading size={14}>{workspace.name}</Heading>
        <Mono size={11} soft>· {repos.length} repos · {fmtSize(totalSize)} · last opened {relTime(Math.max(...repos.map(r => r.lastOpenedAt), workspace.createdAt))}</Mono>
        <div className="flex-1" />
        <Btn onClick={handleExport} className="px-2" style={{ padding: '6px 8px' }}>
          <Upload size={14} aria-hidden="true" />
          <span className="sr-only">Export workspace</span>
        </Btn>
        <Btn onClick={() => setShowDeleteConfirm(true)}>Remove workspace</Btn>
      </div>

      {showScan && (
        <ScanReposModal
          workspace={workspace}
          existingRepos={repos}
          onClose={() => setShowScan(false)}
          onAdded={() => { setShowScan(false); onRefresh() }}
        />
      )}

      {showClone && (
        <CloneRepoModal
          workspace={workspace}
          repos={repos}
          repo={cloneTarget}
          onClose={() => setShowClone(false)}
          onCloned={() => { setShowClone(false); setCloneTarget(null); onRefresh() }}
        />
      )}

      {showDeleteConfirm && (
        <Modal title="Remove workspace" onClose={() => setShowDeleteConfirm(false)} width={400}>
          <div className="flex flex-col gap-4">
            <div className="text-[13px] leading-relaxed">
              Remove <strong>{workspace.name}</strong>? This only removes it from DevRealm — your files on disk are not deleted.
            </div>
            <div className="flex gap-2">
              <Btn primary onClick={handleDeleteWorkspace}>Remove</Btn>
              <Btn onClick={() => setShowDeleteConfirm(false)}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}

      {errorMsg && (
        <Modal title="Error" onClose={() => setErrorMsg(null)} width={400}>
          <div className="text-[13px] leading-relaxed">{errorMsg}</div>
        </Modal>
      )}

      {/* Body */}
      <div className="flex-1 overflow-auto p-5 flex flex-col gap-3.5">
        {/* Row 1: Disk hero + stat cards */}
        <div className="grid gap-3" style={{ gridTemplateColumns: '1.6fr 1fr 1fr' }}>
          <Box className="p-3.5 flex flex-col gap-2.5">
            <div className="flex justify-between items-baseline">
              <Label>Workspace disk usage</Label>
              <Mono size={11} soft>{repos.length} repos</Mono>
            </div>
            <div className="flex items-baseline gap-2.5">
              <span className="text-[26px] font-semibold tracking-[-0.5px]">{fmtSize(totalSize)}</span>
            </div>
            <StackedBar height={10} segments={[
              ...treemapItems.slice(0, 4).map((it, i) => ({ value: it.value, color: [t.ink, t.inkSoft, t.line, t.lineSoft][i], label: it.label })),
              { value: repos.slice(4).reduce((a, r) => a + r.size, 0), color: t.chip, label: `other ${Math.max(0, repos.length - 4)}` },
            ]} />
          </Box>

          <StatCard label="Stale repos" value={String(stale.length)} hint={stale.length ? `${stale[0].name} · ${relTime(stale[0].lastOpenedAt)}` : 'none'} active={staleOnly} onClick={() => setStaleOnly(v => !v)} />
          <StatCard label="AI coverage" value={`${configured.length} / ${repos.length}`} hint={`${Math.round(configured.length / Math.max(repos.length, 1) * 100)}% configured`} bar={configured.length / Math.max(repos.length, 1)} />
        </div>

        {/* Row 2: Repo list + AI coverage + attention */}
        <div className="grid gap-3" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
          {/* Repo table */}
          <Box className="p-0 flex flex-col overflow-hidden h-96">
            <div className="px-3.5 py-2.5 border-b border-t-line flex items-center flex-none gap-2">
              <Heading size={13}>Repositories</Heading>
              <Mono size={11} soft className="ml-1">
                {normalizedRepoSearch ? `${filteredRepos.length} of ${repos.length}` : `${repos.length}`}
              </Mono>
              <div className="flex-1" />
              <Btn onClick={() => setShowScan(true)}>Scan</Btn>
              <Btn onClick={() => { setCloneTarget(null); setShowClone(true) }}>+ Add repo</Btn>
              <input
                value={repoSearch}
                onChange={e => setRepoSearch(e.target.value)}
                placeholder="Filter by name…"
                className="h-8 w-48 border border-t-line rounded px-2.5 text-[12px] bg-t-bg text-t-ink outline-none box-border"
              />
            </div>
            <div className="grid px-3.5 py-1.5 bg-t-panel border-b border-t-line-soft text-[10px] font-semibold text-t-ink-softer uppercase tracking-[0.5px] gap-2 flex-none"
              style={{ gridTemplateColumns: '1.4fr 0.8fr 0.7fr 0.8fr 80px' }}>
              {(['name', 'lastOpenedAt', 'size', 'ai'] as const).map((col, i) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => handleSort(col)}
                  className="flex items-center gap-1 text-left cursor-pointer hover:text-t-ink-soft"
                >
                  <span>{(['Repository', 'Last opened', 'Size', 'AI'] as const)[i]}</span>
                  <span className="text-[9px] leading-none">
                    {sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                  </span>
                </button>
              ))}
              <span className="text-left">Action</span>
            </div>
            <div className="overflow-y-auto flex-1">
            {filteredRepos.length > 0 ? (
              filteredRepos.map((r) => (
                <RepoRow
                  key={r.id}
                  repo={r}
                  aiConfigured={isRepoAiConfigured(r)}
                  onError={setErrorMsg}
                  cloning={cloningRepoIds.has(r.id)}
                  onClone={() => handleCloneImportedRepo(r)}
                  onDelete={() => handleDeleteRepo(r.id)}
                />
              ))
            ) : (
              <div className="px-3.5 py-6 border-b border-t-line-soft text-[12px] text-t-ink-soft text-center">
                {normalizedRepoSearch
                  ? `No repositories match "${repoSearch.trim()}".`
                  : 'No repositories yet.'}
              </div>
            )}
            </div>
          </Box>

          {/* AI configuration */}
          <WorkspaceAICard workspace={workspace} onEdit={() => navigateToAIConfig(workspace.id)} />
        </div>

        {/* Row 3: Treemap */}
        <div className="grid gap-3">
          <Box className="p-3.5 flex flex-col gap-2.5">
            <Heading size={13}>Where space goes</Heading>
            <Treemap items={treemapItems} height={100} />
          </Box>
        </div>
      </div>
    </div>
  )
}

function CloneRepoModal({ workspace, repos, repo, onClose, onCloned }: {
  workspace: Workspace
  repos: Repo[]
  repo?: Repo | null
  onClose: () => void
  onCloned: () => void
}) {
  const [url, setUrl] = useState(repo?.cloneUrl ?? '')
  const destDir = workspace.rootPath ?? ''
  const [status, setStatus] = useState<'idle' | 'cloning' | 'already-added' | 'conflict' | 'error'>('idle')
  const [error, setError] = useState('')
  const [conflictPath, setConflictPath] = useState('')
  const [showTerminal, setShowTerminal] = useState(false)
  const terminalRef = React.useRef<CloneTerminalHandle>(null)
  const stoppedRef = React.useRef(false)

  async function handleClone() {
    if (!url.trim() || !destDir) return
    const repoName = url.trim().split('/').pop()?.replace('.git', '') ?? 'repo'
    const repoPath = `${destDir}/${repoName}`

    const alreadyListed = repos.some(r => r.path === repoPath)
    if (alreadyListed) {
      setStatus('already-added')
      return
    }

    const folderExists = await checkPathExists(repoPath)
    if (folderExists) {
      setConflictPath(repoPath)
      setStatus('conflict')
      return
    }

    stoppedRef.current = false
    setStatus('cloning')
    setError('')
    setShowTerminal(true)
    terminalRef.current?.reset()
    const stopListening = window.electronAPI.repos.onCloneProgress((line: string) => {
      terminalRef.current?.write(line)
    })
    try {
      await cloneRepo({ url: url.trim(), destDir, workspaceId: workspace.id, repoId: repo?.id })
      stopListening()
      onCloned()
    } catch (e: unknown) {
      stopListening()
      if (stoppedRef.current) {
        setStatus('idle')
        setShowTerminal(false)
      } else {
        setStatus('error')
        setError(e instanceof Error ? e.message : 'Clone failed')
      }
    }
  }

  async function handleImportExisting() {
    try {
      await addRepo({ repoPath: conflictPath, workspaceId: workspace.id })
      onCloned()
    } catch (e: unknown) {
      setStatus('error')
      setError(e instanceof Error ? e.message : 'Import failed')
    }
  }

  async function handleDeleteAndRetry() {
    try {
      await deleteFolderAtPath(conflictPath)
    } catch (e: unknown) {
      setStatus('error')
      setError(e instanceof Error ? e.message : 'Failed to delete folder')
      return
    }
    setStatus('idle')
    setShowTerminal(false)
    handleClone()
  }

  function handleStop() {
    stoppedRef.current = true
    window.electronAPI.repos.stopClone()
  }

  return (
    <Modal title="Clone repository" onClose={onClose} width={480}>
      <div className="flex flex-col gap-2.5">
        <input
          autoFocus
          placeholder="https://github.com/org/repo.git"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && status === 'idle' && handleClone()}
          className="h-8 border border-t-line rounded px-2.5 text-[13px] bg-t-bg text-t-ink outline-none w-full box-border"
        />
        {status === 'already-added' && (
          <div className="px-2 py-2 border border-t-line rounded-[3px] bg-t-panel text-[12px] text-t-ink">
            This repository is already added to the workspace.
          </div>
        )}
        {status === 'conflict' && (
          <div className="flex flex-col gap-2 px-2 py-2 border border-t-line rounded-[3px] bg-t-panel">
            <div className="text-[12px] text-t-ink">
              A folder already exists at <Mono size={11} className="inline">{conflictPath}</Mono>.
            </div>
            <div className="flex gap-2">
              <Btn primary onClick={handleImportExisting}>Import existing repo</Btn>
              <Btn onClick={handleDeleteAndRetry}>Delete folder and clone</Btn>
            </div>
          </div>
        )}
        {status === 'error' && (
          <div className="text-[11px] text-[#e05252] px-2 py-1.5 border border-[#e05252] rounded-[3px]">
            {error}
          </div>
        )}
        <div className="flex gap-2 pt-0.5">
          {status === 'cloning' ? (
            <Btn onClick={handleStop}>Stop</Btn>
          ) : status === 'already-added' ? (
            <Btn onClick={onClose}>Close</Btn>
          ) : status !== 'conflict' ? (
            <Btn primary onClick={handleClone} style={{ opacity: url.trim() && destDir ? 1 : 0.5 }}>Clone</Btn>
          ) : null}
          {status !== 'already-added' && <Btn onClick={onClose}>Cancel</Btn>}
        </div>
        {showTerminal && <CloneTerminal ref={terminalRef} />}
      </div>
    </Modal>
  )
}

function StatCard({ label, value, hint, bar, active, onClick }: { label: string; value: string; hint: string; bar?: number; active?: boolean; onClick?: () => void }) {
  return (
    <Box className={`p-3 flex flex-col gap-1.5 ${onClick ? 'cursor-pointer' : ''} ${active ? 'ring-1 ring-t-accent-bg' : ''}`} onClick={onClick}>
      <Label>{label}</Label>
      <span className="text-[22px] font-semibold tracking-[-0.3px]">{value}</span>
      {bar !== undefined && <Bar value={bar} height={4} />}
      <Mono size={10} soft>{hint}</Mono>
    </Box>
  )
}


function RepoRow({ repo, aiConfigured, onError, cloning, onClone, onDelete }: {
  repo: Repo; aiConfigured: boolean; onError: (msg: string) => void; cloning: boolean; onClone: () => void; onDelete: () => void
}) {
  const hasLocalPath = Boolean(repo.path)
  const isStale = Date.now() - repo.lastOpenedAt > STALE_REPO_MS
  const [showConfirm, setShowConfirm] = useState(false)

  async function openInEditor() {
    if (!hasLocalPath) return
    try {
      await openRepoInEditor(repo.path)
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Failed to open repository')
    }
  }

  return (
    <>
      {showConfirm && (
        <Modal title="Remove repository" onClose={() => setShowConfirm(false)} width={400}>
          <div className="flex flex-col gap-4">
            <div className="text-[13px] leading-relaxed">
              Remove <strong>{repo.name}</strong> from this workspace? The files on disk are not deleted.
            </div>
            <div className="flex gap-2">
              <Btn primary onClick={() => { setShowConfirm(false); onDelete() }}>Remove</Btn>
              <Btn onClick={() => setShowConfirm(false)}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}
      <div
        className={`grid px-3.5 py-1.75 border-b border-t-line-soft text-xs items-center gap-2
          ${isStale || !hasLocalPath ? 'text-t-ink-soft' : 'text-t-ink'}`}
        style={{ gridTemplateColumns: '1.4fr 0.8fr 0.7fr 0.8fr 80px' }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <GitIcon size={11} />
          <span className="overflow-hidden text-ellipsis whitespace-nowrap font-medium">{repo.name}</span>
          {!hasLocalPath && <Chip>remote</Chip>}
          {isStale && <Chip>stale</Chip>}
        </div>
        <Mono size={11} soft>{hasLocalPath ? relTime(repo.lastOpenedAt) : 'not cloned'}</Mono>
        <Mono size={11} soft>{hasLocalPath ? fmtSize(repo.size) : '—'}</Mono>
        <span>
          {aiConfigured ? (
            <span className="inline-flex h-5 w-5 items-center justify-center text-t-ink" title="AI configured">
              <Check size={13} strokeWidth={2.4} aria-hidden="true" />
            </span>
          ) : (
            <span className="inline-flex h-5 w-5 items-center justify-center">
              <Mono size={11} soft>—</Mono>
            </span>
          )}
        </span>
        <div className="flex gap-1.5 justify-end items-center">
          {hasLocalPath ? (
            <span
              onClick={openInEditor}
              className="inline-flex items-center gap-1 text-[10px] font-mono cursor-pointer border border-t-line rounded-full px-2 py-0.5 hover:bg-t-panel"
            >
              <SquareCode size={11} aria-hidden="true" />
              open
            </span>
          ) : cloning ? (
            <span
              className="inline-flex h-4 w-4 animate-spin rounded-full border"
              style={{ borderColor: 'var(--t-line)', borderTopColor: 'var(--t-ink)' }}
              title="Cloning"
            >
              <span className="sr-only">Cloning</span>
            </span>
          ) : (
            <span onClick={onClone} className="text-[10px] font-mono cursor-pointer">clone</span>
          )}
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="inline-flex items-center justify-center cursor-pointer text-t-ink-softer hover:text-[#e05252] w-5 h-5"
            title="Remove from list"
          >
            <Trash2 size={11} aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  )
}


function formatSettingValue(v: unknown): string {
  if (typeof v === 'string') return v.length > 32 ? v.slice(0, 30) + '…' : v
  if (typeof v === 'boolean' || typeof v === 'number') return String(v)
  if (Array.isArray(v)) return `[${v.length} items]`
  if (typeof v === 'object' && v !== null) return `{${Object.keys(v as object).length} keys}`
  return String(v)
}

function AICountCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="py-1.5 px-2 bg-t-bg border border-t-line-soft rounded-[3px] flex items-center gap-2">
      <span className="text-[17px] font-semibold tracking-tight leading-none">{value}</span>
      <span className="text-[10px] text-t-ink-soft font-medium leading-tight">{label}</span>
    </div>
  )
}

function WorkspaceAICard({ workspace, onEdit }: { workspace: Workspace; onEdit?: () => void }) {
  const [data, setData] = useState<{
    settings: ClaudeSettingsSnapshot
    mdSnapshot: ClaudeMdSnapshot
    plugins: Plugin[]
  } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!workspace.rootPath) return
    setLoading(true)
    setData(null)
    Promise.all([
      readClaudeSettings(workspace.rootPath),
      readClaudeMdFiles(workspace.rootPath),
      listClaudePluginsAndSkills(workspace.rootPath),
    ])
      .then(([settings, mdSnapshot, plugins]) => {
        setData({ settings, mdSnapshot, plugins: plugins as Plugin[] })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [workspace.rootPath])

  const claudeMdExists = data?.mdSnapshot.rootFiles.find(f => f.relativePath === 'CLAUDE.md')?.exists ?? false
  const enabledPluginsCount = data?.plugins.filter(p => p.enabled).length ?? 0
  const folderFileCount = (folderRelPath: string) =>
    data?.mdSnapshot.folders.find(f => f.folderRelPath === folderRelPath)?.files.length ?? 0
  const pluginSkillsCount = data?.plugins.reduce((n, p) => n + p.skills.length, 0) ?? 0
  const skillsCount = pluginSkillsCount + folderFileCount('.claude/skills')
  const commandsCount = folderFileCount('.claude/commands')
  const rulesCount = folderFileCount('.claude/rules')
  const agentsCount = folderFileCount('.claude/agents')

  const importedSettings = workspace.importedClaudeSettings
  const importedValues: Record<string, unknown> = {
    ...(importedSettings?.shared ?? {}),
    ...(importedSettings?.local ?? {}),
  }
  const mcpRaw = data?.settings.shared.values.mcpServers ?? data?.settings.local.values.mcpServers ?? importedValues.mcpServers
  const mcpCount = (typeof mcpRaw === 'object' && mcpRaw !== null && !Array.isArray(mcpRaw))
    ? Object.keys(mcpRaw).length : 0

  const allValues: Record<string, unknown> = {
    ...(data?.settings.shared.values ?? {}),
    ...(data?.settings.local.values ?? {}),
    ...(!data ? importedValues : {}),
  }
  const model = typeof allValues.model === 'string' ? allValues.model : null
  const settingKeys = Object.keys(allValues).filter(k => k !== 'mcpServers' && k !== 'enabledPlugins' && k !== 'model')

  const isConfigured =
    claudeMdExists ||
    enabledPluginsCount > 0 ||
    skillsCount > 0 ||
    mcpCount > 0 ||
    commandsCount > 0 ||
    rulesCount > 0 ||
    agentsCount > 0 ||
    settingKeys.length > 0 ||
    !!model

  return (
    <Box className="p-3.5 flex flex-col gap-2.5 bg-t-panel">
      <div className="flex items-center gap-2">
        <div
          className={isConfigured
            ? 'py-1.5 px-2.5 rounded-xl flex items-center gap-2 border-2 border-green-700/50 dark:border-green-800/50'
            : 'py-1.5 px-2.5 rounded-xl flex items-center gap-2 border-2 border-red-500/50 dark:border-red-900/60'}
        >
          <AIIcon size={14} />
          <Heading size={13}>AI Configuration - {isConfigured ? 'Workspace' : 'No Setup'}</Heading>
        </div>
        {loading && <Mono size={10} soft>Loading…</Mono>}
        <div className="flex-1" />
        {onEdit && <Btn onClick={onEdit}>Edit</Btn>}
      </div>

      {!workspace.rootPath && !importedSettings && (
        <div className="text-[12px] text-t-ink-soft">No workspace path set.</div>
      )}

      {!workspace.rootPath && importedSettings && (
        <div className="text-[12px] text-t-ink-soft">Imported AI settings are saved with this workspace.</div>
      )}

      {workspace.rootPath && !loading && data && !isConfigured && (
        <div className="text-[12px] text-t-ink-soft">
          No AI configuration set up. Use Edit to add one.
        </div>
      )}

      {(((workspace.rootPath && !loading && data) && isConfigured) || (!workspace.rootPath && importedSettings)) && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {workspace.rootPath && (
              <Chip>
                <span className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 inline-block ${claudeMdExists ? 'bg-t-accent-bg' : 'bg-t-line'}`} />
                  CLAUDE.md · {claudeMdExists ? 'Configured' : 'not created'}
                </span>
              </Chip>
            )}
            {model && <Chip>{model}</Chip>}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <AICountCell label="plugins enabled" value={enabledPluginsCount} />
            <AICountCell label="skills" value={skillsCount} />
            <AICountCell label="MCP servers" value={mcpCount} />
            <AICountCell label="commands" value={commandsCount} />
            {rulesCount > 0 && <AICountCell label="rules" value={rulesCount} />}
            {agentsCount > 0 && <AICountCell label="agents" value={agentsCount} />}
          </div>

          {settingKeys.length > 0 && (
            <div>
              <Label style={{ fontSize: 9, marginBottom: 4 }}>Settings</Label>
              <div className="flex flex-col divide-y divide-t-line-soft border border-t-line-soft rounded-[3px] overflow-hidden">
                {settingKeys.slice(0, 5).map(key => (
                  <div key={key} className="flex items-center gap-2 px-2 py-1 bg-t-bg text-[11px]">
                    <Mono size={10} className="w-28 shrink-0 truncate">{key}</Mono>
                    <span className="text-t-ink-soft truncate flex-1">{formatSettingValue(allValues[key])}</span>
                  </div>
                ))}
                {settingKeys.length > 5 && (
                  <div className="px-2 py-1 bg-t-bg">
                    <Mono size={10} soft>+{settingKeys.length - 5} more</Mono>
                  </div>
                )}
              </div>
            </div>
          )}

          {settingKeys.length === 0 && !model && mcpCount === 0 && (
            <div className="text-[11px] text-t-ink-soft">No settings configured.</div>
          )}
        </>
      )}
    </Box>
  )
}
