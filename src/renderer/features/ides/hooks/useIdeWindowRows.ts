import { useMemo, useState } from 'react'
import type { IdeSortColumn, IdeSortState, IdeWindowGroup, IdeWindowRow } from '../types'

const SORT_VALUE: Record<IdeSortColumn, (row: IdeWindowRow) => string> = {
  window: row => row.repoName ?? row.rootName ?? row.title,
  title: row => row.title,
  workspace: row => row.workspaceName,
  path: row => row.folderLabel ?? '',
}

function compare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
}

/**
 * The grouped windows flattened into table rows, with the workspace as a
 * column instead of a heading. Unsorted rows keep the card view's order, so
 * the two screens show the same windows in the same sequence until a column
 * is picked.
 */
export function useIdeWindowRows(groups: IdeWindowGroup[]) {
  const [sort, setSort] = useState<IdeSortState | null>(null)

  const rows = useMemo(() => {
    const flat: IdeWindowRow[] = groups.flatMap(group =>
      group.windows.map(win => ({ ...win, workspaceName: group.name }))
    )
    if (!sort) return flat
    const value = SORT_VALUE[sort.column]
    const direction = sort.direction === 'asc' ? 1 : -1
    return [...flat].sort((a, b) => {
      const primary = compare(value(a), value(b))
      // Same value in the sorted column: fall back to the window name so the
      // order does not shuffle between renders.
      return (primary !== 0 ? primary : compare(SORT_VALUE.window(a), SORT_VALUE.window(b))) * direction
    })
  }, [groups, sort])

  /** Clicking the sorted column flips it; a third click returns to the card view's order. */
  function toggleSort(column: IdeSortColumn) {
    setSort(current => {
      if (current?.column !== column) return { column, direction: 'asc' }
      return current.direction === 'asc' ? { column, direction: 'desc' } : null
    })
  }

  return { rows, sort, toggleSort }
}
