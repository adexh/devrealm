import { useIdeWorkbench } from '../hooks/useIdeWorkbench'
import { IdeEmptyState } from './IdeEmptyState'
import { IdeScreenChrome } from './IdeScreenChrome'
import { IdeWorkspaceGroup } from './IdeWorkspaceGroup'

/** Windows as cards, grouped by workspace. The table alternative is IdesTableScreen. */
export function IdesScreen() {
  const workbench = useIdeWorkbench()

  return (
    <IdeScreenChrome workbench={workbench}>
      {snapshot => (
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
    </IdeScreenChrome>
  )
}
