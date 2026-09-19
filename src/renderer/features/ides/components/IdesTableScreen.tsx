import { useIdeWindowRows } from '../hooks/useIdeWindowRows'
import { useIdeWorkbench } from '../hooks/useIdeWorkbench'
import { IdeEmptyState } from './IdeEmptyState'
import { IdeScreenChrome } from './IdeScreenChrome'
import { IdeWindowTable } from './IdeWindowTable'

/**
 * The same windows as IdesScreen, as one sortable table rather than cards
 * grouped by workspace. Both exist side by side so the two layouts can be
 * compared on real data.
 */
export function IdesTableScreen() {
  const workbench = useIdeWorkbench()
  const { rows, sort, toggleSort } = useIdeWindowRows(workbench.groups)

  return (
    <IdeScreenChrome workbench={workbench}>
      {snapshot => (
        <div className="px-4 py-4">
          {rows.length === 0 ? (
            <div className="max-w-5xl mx-auto"><IdeEmptyState snapshot={snapshot} /></div>
          ) : (
            <IdeWindowTable
              rows={rows}
              sort={sort}
              capabilities={snapshot.capabilities}
              closeUnavailableReason={workbench.closeUnavailableReason}
              action={workbench.action}
              onSort={toggleSort}
              onFocus={workbench.focusWindow}
              onClose={workbench.closeWindow}
              onTerminal={workbench.openTerminal}
            />
          )}
        </div>
      )}
    </IdeScreenChrome>
  )
}
