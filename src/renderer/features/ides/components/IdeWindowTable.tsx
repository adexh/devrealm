import type { IdeCapabilities } from '../../../../shared/ide'
import type { IdeActionState, IdeSortColumn, IdeSortState, IdeWindowRow, IdeWindowView } from '../types'
import { IdeTableHeaderCell } from './IdeTableHeaderCell'
import { IdeWindowTableRow } from './IdeWindowTableRow'

export function IdeWindowTable({ rows, sort, capabilities, closeUnavailableReason, action, onSort, onFocus, onClose, onTerminal }: {
  rows: IdeWindowRow[]
  sort: IdeSortState | null
  capabilities: IdeCapabilities
  closeUnavailableReason: string | null
  action: IdeActionState | null
  onSort: (column: IdeSortColumn) => void
  onFocus: (win: IdeWindowView) => void
  onClose: (win: IdeWindowView) => void
  onTerminal: (win: IdeWindowView) => void
}) {
  return (
    <table className="w-full border-collapse text-left">
      <thead className="sticky top-0 z-10 bg-tm-bg">
        <tr className="border-b border-tm-line/50">
          <IdeTableHeaderCell column="window" label="Window" sort={sort} onSort={onSort} />
          <IdeTableHeaderCell column="workspace" label="Workspace" sort={sort} onSort={onSort} />
          <IdeTableHeaderCell column="title" label="Editor" sort={sort} onSort={onSort} className="hidden xl:table-cell" />
          <IdeTableHeaderCell column="path" label="Path" sort={sort} onSort={onSort} className="hidden lg:table-cell" />
          <th className="px-3 py-2 text-[11px] leading-4 font-semibold tracking-[0.4px] uppercase text-tm-ink-dim text-right whitespace-nowrap">
            Actions
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <IdeWindowTableRow
            key={row.id}
            row={row}
            capabilities={capabilities}
            closeUnavailableReason={closeUnavailableReason}
            busy={action?.targetId === row.id ? action.kind : null}
            onFocus={() => onFocus(row)}
            onClose={() => onClose(row)}
            onTerminal={() => onTerminal(row)}
          />
        ))}
      </tbody>
    </table>
  )
}
