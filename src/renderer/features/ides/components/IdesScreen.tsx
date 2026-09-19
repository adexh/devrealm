import { useCallback, useState } from 'react'
import type { IdeWindowRef } from '../../../../shared/ide'
import { HOME_WORKSPACE_ID } from '../../../constants'
import { useNavigationStore } from '../../../stores/navigationStore'
import { useTerminalStore } from '../../../stores/terminalStore'
import { useUiStore } from '../../../stores/uiStore'
import { Spinner } from '../../../components/Spinner'
import { basename } from '../../../utils/paths'
import { POST_ACTION_REFRESH_DELAY_MS } from '../constants'
import { useIdeGroups } from '../hooks/useIdeGroups'
import { useIdeSnapshot } from '../hooks/useIdeSnapshot'
import { closeIdeWindow, focusIdeWindow, openAccessibilitySettings, quitIde, requestAccessibility } from '../ipc/ides'
import { openRepoInEditor } from '../ipc/repos'
import type { IdeActionState, IdeUnopenedRepo, IdeWindowView } from '../types'
import { AccessibilityBanner } from './AccessibilityBanner'
import { IdeEmptyState } from './IdeEmptyState'
import { IdeNotice } from './IdeNotice'
import { IdeSummaryBar } from './IdeSummaryBar'
import { IdeUsageBreakdown } from './IdeUsageBreakdown'
import { IdeWorkspaceGroup } from './IdeWorkspaceGroup'
import { QuitIdeModal } from './QuitIdeModal'

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function IdesScreen() {
  const { snapshot, loading, refreshing, error, refresh } = useIdeSnapshot()
  const groups = useIdeGroups(snapshot)
  const [action, setAction] = useState<IdeActionState | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [quitOpen, setQuitOpen] = useState(false)
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const bannerDismissed = useUiStore(state => state.ideAccessibilityBannerDismissed)
  const dismissBanner = useUiStore(state => state.dismissIdeAccessibilityBanner)
  const openSession = useTerminalStore(state => state.openSession)
  const openRepoSession = useTerminalStore(state => state.openRepoSession)
  const navigateToTerminals = useNavigationStore(state => state.navigateToTerminals)

  /** One action at a time; the list is re-read afterwards so it shows what really happened. */
  const run = useCallback(async (state: IdeActionState, task: () => Promise<void>, refreshAfter: boolean) => {
    setAction(state)
    setActionError(null)
    let failed = false
    try {
      await task()
    } catch (failure) {
      failed = true
      setActionError(message(failure, 'The action failed'))
    }
    // Success or not, the list must show what VS Code actually did.
    if (refreshAfter) {
      if (!failed) await wait(POST_ACTION_REFRESH_DELAY_MS)
      await refresh()
    }
    setAction(null)
  }, [refresh])

  const toRef = (win: IdeWindowView): IdeWindowRef => ({ ide: win.ide, title: win.title, folderPath: win.folderPath })

  const focusWindow = (win: IdeWindowView) =>
    run({ kind: 'focus', targetId: win.id }, () => focusIdeWindow(toRef(win)), false)

  const closeWindow = (win: IdeWindowView) =>
    run({ kind: 'close', targetId: win.id }, () => closeIdeWindow(toRef(win)), true)

  const openTerminal = (win: IdeWindowView) =>
    run({ kind: 'terminal', targetId: win.id }, async () => {
      if (!win.folderPath) throw new Error('This window has no folder to open a shell in.')
      const input = {
        workspaceId: win.workspaceId ?? HOME_WORKSPACE_ID,
        repoId: win.repoId,
        repoName: win.repoName ?? win.rootName ?? basename(win.folderPath),
        cwd: win.folderPath,
      }
      // A tracked repo reuses its newest shell; an untracked folder always gets a fresh one.
      if (win.repoId) await openRepoSession(input)
      else await openSession(input)
      navigateToTerminals()
    }, false)

  const openRepo = (target: IdeUnopenedRepo) =>
    run({ kind: 'open', targetId: target.repo.id }, () => openRepoInEditor({
      targetPath: target.path,
      repoId: target.repo.id,
      workspaceId: target.repo.workspaceId,
    }), true)

  const quit = () => {
    setQuitOpen(false)
    void run({ kind: 'quit', targetId: 'vscode' }, () => quitIde('vscode'), true)
  }

  const grantAccessibility = async () => {
    setActionError(null)
    try {
      await requestAccessibility()
      await refresh()
    } catch (failure) {
      setActionError(message(failure, 'Could not request Accessibility permission'))
    }
  }

  const showBanner = Boolean(snapshot?.accessibility.supported && !snapshot.accessibility.granted && !bannerDismissed)
  const closeUnavailableReason = !snapshot || snapshot.capabilities.close
    ? null
    : snapshot.accessibility.supported
      ? 'Grant Accessibility permission to close windows from here'
      : 'Closing windows is only supported on macOS'
  const hasWindows = (snapshot?.windows.length ?? 0) > 0
  const showGroups = hasWindows || groups.some(group => group.unopened.length > 0)

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-tm-bg">
      <IdeSummaryBar
        snapshot={snapshot}
        refreshing={refreshing}
        breakdownOpen={breakdownOpen}
        onRefresh={() => { void refresh() }}
        onToggleBreakdown={() => setBreakdownOpen(open => !open)}
        onQuit={() => setQuitOpen(true)}
      />

      {breakdownOpen && snapshot?.usage && <IdeUsageBreakdown usage={snapshot.usage} />}

      {showBanner && (
        <AccessibilityBanner
          onGrant={() => { void grantAccessibility() }}
          onOpenSettings={() => { void openAccessibilitySettings() }}
          onDismiss={dismissBanner}
        />
      )}

      {error && <IdeNotice tone="error" text={error} actionLabel="Retry" onAction={() => { void refresh() }} />}
      {actionError && <IdeNotice tone="error" text={actionError} actionLabel="Dismiss" onAction={() => setActionError(null)} />}
      {snapshot?.warnings.map((warning, index) => <IdeNotice key={`${index}:${warning}`} tone="warn" text={warning} />)}

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="h-full flex items-center justify-center"><Spinner /></div>
        ) : !snapshot ? null : (
          <div className="max-w-5xl mx-auto px-6 py-5 space-y-6">
            {!hasWindows && <IdeEmptyState snapshot={snapshot} />}
            {showGroups && groups.map(group => (
              <IdeWorkspaceGroup
                key={group.key}
                group={group}
                capabilities={snapshot.capabilities}
                closeUnavailableReason={closeUnavailableReason}
                action={action}
                onFocus={win => { void focusWindow(win) }}
                onClose={win => { void closeWindow(win) }}
                onTerminal={win => { void openTerminal(win) }}
                onOpenRepo={target => { void openRepo(target) }}
              />
            ))}
          </div>
        )}
      </div>

      {quitOpen && snapshot && (
        <QuitIdeModal
          label={snapshot.label}
          windowCount={snapshot.windows.length}
          dirtyCount={snapshot.windows.filter(win => win.dirty).length}
          onConfirm={quit}
          onClose={() => setQuitOpen(false)}
        />
      )}
    </div>
  )
}
