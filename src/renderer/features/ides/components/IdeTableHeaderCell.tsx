import { ChevronDown, ChevronUp } from 'lucide-react'
import type { IdeSortColumn, IdeSortState } from '../types'

export function IdeTableHeaderCell({ column, label, sort, onSort, className = '' }: {
  column: IdeSortColumn
  label: string
  sort: IdeSortState | null
  onSort: (column: IdeSortColumn) => void
  className?: string
}) {
  const active = sort?.column === column
  const ascending = active && sort.direction === 'asc'

  return (
    <th
      scope="col"
      aria-sort={!active ? 'none' : ascending ? 'ascending' : 'descending'}
      className={`px-3 py-2 font-normal ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        title={active ? `Sorted by ${label}. Click to ${ascending ? 'reverse' : 'clear'}.` : `Sort by ${label}`}
        className={active
          ? 'flex items-center gap-1 text-[11px] leading-4 font-semibold tracking-[0.4px] uppercase text-tm-ink-strong bg-transparent border-none cursor-pointer p-0'
          : 'flex items-center gap-1 text-[11px] leading-4 font-semibold tracking-[0.4px] uppercase text-tm-ink-dim hover:text-tm-ink bg-transparent border-none cursor-pointer p-0'}
      >
        {label}
        {active && (ascending
          ? <ChevronUp size={13} aria-hidden="true" />
          : <ChevronDown size={13} aria-hidden="true" />)}
      </button>
    </th>
  )
}
