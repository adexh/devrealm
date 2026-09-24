import { Spinner } from '../../../components/Spinner'
import { useIdeWorkbench } from '../hooks/useIdeWorkbench'
import { AccessibilityBanner } from './AccessibilityBanner'
import { IdeEmptyState } from './IdeEmptyState'
import { IdeNotice } from './IdeNotice'
import { IdeSummaryBar } from './IdeSummaryBar'
import { IdeUsageBreakdown } from './IdeUsageBreakdown'
import { IdeWorkspaceGroup } from './IdeWorkspaceGroup'
import { QuitIdeModal } from './QuitIdeModal'

/** Open windows as cards, grouped by the workspace whose repo they hold. */
export function IdesScreen() {
  const workbench = useIdeWorkbench()
  const { snapshot, loading } = workbench

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-tm-bg">
      <IdeSummaryBar
        snapshot={snapshot}
        refreshing={workbench.refreshing}
        breakdownOpen={workbench.breakdownOpen}
        onRefresh={workbench.refresh}
        onToggleBreakdown={workbench.toggleBreakdown}
        onQuit={workbench.openQuit}
      />

      {workbench.breakdownOpen && snapshot?.usage && <IdeUsageBreakdown usage={snapshot.usage} />}

      {workbench.showBanner && (
        <AccessibilityBanner
          onGrant={workbench.grantAccessibility}
          onOpenSettings={workbench.openAccessibilitySettings}
          onDismiss={workbench.dismissBanner}
        />
      )}

      {workbench.error && <IdeNotice tone="error" text={workbench.error} actionLabel="Retry" onAction={workbench.refresh} />}
      {workbench.actionError && <IdeNotice tone="error" text={workbench.actionError} actionLabel="Dismiss" onAction={workbench.dismissActionError} />}
      {workbench.staleWindows && <IdeNotice tone="warn" text="The window list could not be refreshed; showing the last one that worked." actionLabel="Retry" onAction={workbench.retryFresh} />}
      {snapshot?.warnings.map((warning, index) => <IdeNotice key={`${index}:${warning}`} tone="warn" text={warning} />)}

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="h-full flex items-center justify-center"><Spinner /></div>
        ) : snapshot && (
          <div className="max-w-5xl mx-auto px-6 py-5 space-y-6">
            {snapshot.windows.length === 0 && <IdeEmptyState snapshot={snapshot} />}
            {workbench.groups.map(group => (
              <IdeWorkspaceGroup
                key={group.key}
                group={group}
                capabilities={snapshot.capabilities}
                closeUnavailableReason={workbench.closeUnavailableReason}
                action={workbench.action}
                onFocus={workbench.focusWindow}
                onClose={workbench.closeWindow}
                onTerminal={workbench.openTerminal}
              />
            ))}
          </div>
        )}
      </div>

      {workbench.quitOpen && snapshot && (
        <QuitIdeModal
          label={snapshot.label}
          windowCount={snapshot.windows.length}
          dirtyCount={snapshot.windows.filter(win => win.dirty).length}
          onConfirm={workbench.confirmQuit}
          onClose={workbench.closeQuit}
        />
      )}
    </div>
  )
}
