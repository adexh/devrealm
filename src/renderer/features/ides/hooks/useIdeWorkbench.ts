import { useCallback, useState } from 'react'
import type { IdeSnapshot, IdeWindowRef } from '../../../../shared/ide'
import { HOME_WORKSPACE_ID } from '../../../constants'
import { useNavigationStore } from '../../../stores/navigationStore'
import { useTerminalStore } from '../../../stores/terminalStore'
import { useUiStore } from '../../../stores/uiStore'
import { basename } from '../../../utils/paths'
import { POST_ACTION_REFRESH_DELAY_MS } from '../constants'
import { closeIdeWindow, focusIdeWindow, openAccessibilitySettings, quitIde, requestAccessibility } from '../ipc/ides'
import type { IdeActionState, IdeWindowGroup, IdeWindowView } from '../types'
import { useIdeGroups } from './useIdeGroups'
import { useIdeSnapshot } from './useIdeSnapshot'

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/**
 * The IDEs screen's state and every action it offers, kept out of the
 * component so the screen reads as layout alone.
 */
export type IdeWorkbench = {
  snapshot: IdeSnapshot | null
  groups: IdeWindowGroup[]
  loading: boolean
  refreshing: boolean
  error: string | null
  staleWindows: boolean
  actionError: string | null
  action: IdeActionState | null
  /** Why Close cannot be offered, or null when it can. */
  closeUnavailableReason: string | null
  showBanner: boolean
  breakdownOpen: boolean
  quitOpen: boolean
  refresh: () => void
  retryFresh: () => void
  toggleBreakdown: () => void
  openQuit: () => void
  closeQuit: () => void
  confirmQuit: () => void
  dismissBanner: () => void
  dismissActionError: () => void
  grantAccessibility: () => void
  openAccessibilitySettings: () => void
  focusWindow: (win: IdeWindowView) => void
  closeWindow: (win: IdeWindowView) => void
  openTerminal: (win: IdeWindowView) => void
}

export function useIdeWorkbench(): IdeWorkbench {
  const { snapshot, loading, refreshing, error, staleWindows, refresh } = useIdeSnapshot()
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
    // Success or not, the list must show what VS Code actually did, so the
    // main process's cached window list is skipped.
    if (refreshAfter) {
      if (!failed) await wait(POST_ACTION_REFRESH_DELAY_MS)
      await refresh({ fresh: true })
    }
    setAction(null)
  }, [refresh])

  const toRef = (win: IdeWindowView): IdeWindowRef => ({ ide: win.ide, title: win.title, titleIndex: win.titleIndex, openPath: win.openPath })

  const focusWindow = useCallback((win: IdeWindowView) => {
    void run({ kind: 'focus', targetId: win.id }, () => focusIdeWindow(toRef(win)), false)
  }, [run])

  const closeWindow = useCallback((win: IdeWindowView) => {
    void run({ kind: 'close', targetId: win.id }, () => closeIdeWindow(toRef(win)), true)
  }, [run])

  const openTerminal = useCallback((win: IdeWindowView) => {
    void run({ kind: 'terminal', targetId: win.id }, async () => {
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
  }, [navigateToTerminals, openRepoSession, openSession, run])

  const confirmQuit = useCallback(() => {
    setQuitOpen(false)
    void run({ kind: 'quit', targetId: 'vscode' }, () => quitIde('vscode'), true)
  }, [run])

  const grantAccessibility = useCallback(() => {
    setActionError(null)
    void requestAccessibility()
      .then(() => refresh())
      .catch(failure => setActionError(message(failure, 'Could not request Accessibility permission')))
  }, [refresh])

  return {
    snapshot,
    groups,
    loading,
    refreshing,
    error,
    staleWindows,
    actionError,
    action,
    closeUnavailableReason: !snapshot || snapshot.capabilities.close
      ? null
      : snapshot.accessibility.supported
        ? 'Grant Accessibility permission to close windows from here'
        : 'Closing windows is only supported on macOS',
    showBanner: Boolean(snapshot?.accessibility.supported && !snapshot.accessibility.granted && !bannerDismissed),
    breakdownOpen,
    quitOpen,
    refresh: useCallback(() => { void refresh() }, [refresh]),
    retryFresh: useCallback(() => { void refresh({ fresh: true }) }, [refresh]),
    toggleBreakdown: useCallback(() => setBreakdownOpen(open => !open), []),
    openQuit: useCallback(() => setQuitOpen(true), []),
    closeQuit: useCallback(() => setQuitOpen(false), []),
    confirmQuit,
    dismissBanner,
    dismissActionError: useCallback(() => setActionError(null), []),
    grantAccessibility,
    openAccessibilitySettings: useCallback(() => { void openAccessibilitySettings() }, []),
    focusWindow,
    closeWindow,
    openTerminal,
  }
}
