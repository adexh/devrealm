import type { ReactNode } from 'react'
import type { IdeSnapshot } from '../../../../shared/ide'
import { Spinner } from '../../../components/Spinner'
import type { IdeWorkbench } from '../hooks/useIdeWorkbench'
import { AccessibilityBanner } from './AccessibilityBanner'
import { IdeNotice } from './IdeNotice'
import { IdeSummaryBar } from './IdeSummaryBar'
import { IdeUsageBreakdown } from './IdeUsageBreakdown'
import { QuitIdeModal } from './QuitIdeModal'

/**
 * Everything around the window list: summary, breakdown, banner, notices and
 * the quit modal. Shared so the card and table screens differ only in how the
 * windows themselves are drawn. `children` is called with the loaded snapshot.
 */
export function IdeScreenChrome({ workbench, children }: {
  workbench: IdeWorkbench
  children: (snapshot: IdeSnapshot) => ReactNode
}) {
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
        ) : !snapshot ? null : children(snapshot)}
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
