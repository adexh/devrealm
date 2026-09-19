import { useCallback, useEffect, useRef, useState } from 'react'
import type { IdeSnapshot, IdeSnapshotOptions } from '../../../../shared/ide'
import { POLL_INTERVAL_MS } from '../constants'
import { fetchIdeSnapshot } from '../ipc/ides'

type SnapshotState = {
  snapshot: IdeSnapshot | null
  /** True until the first capture resolves or fails. */
  loading: boolean
  refreshing: boolean
  error: string | null
  /** The windows shown are from an earlier capture because the latest could not list any. */
  staleWindows: boolean
}

/**
 * A capture can succeed at listing processes and still fail to list windows,
 * which the main process reports as `source: 'none'` with a warning. Showing
 * that as zero windows would empty the screen on a transient failure, so the
 * last good list is kept and marked stale until a source works again.
 */
function merge(previous: IdeSnapshot | null, next: IdeSnapshot): { snapshot: IdeSnapshot; staleWindows: boolean } {
  const listingFailed = next.running && next.source === 'none'
  if (!listingFailed || !previous || previous.windows.length === 0) return { snapshot: next, staleWindows: false }
  return { snapshot: { ...next, windows: previous.windows, source: previous.source }, staleWindows: true }
}

/**
 * Polls while the document is visible and stops when it is not: the poll costs
 * a `ps` and either an AppleScript or a `--status` walk, none of which is worth
 * paying for a tab nobody is looking at. Each cycle schedules the next only
 * after the previous resolves, so a slow capture never stacks.
 */
export function useIdeSnapshot() {
  const [state, setState] = useState<SnapshotState>({ snapshot: null, loading: true, refreshing: false, error: null, staleWindows: false })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(true)
  const sourceRef = useRef<IdeSnapshot['source'] | null>(null)
  const cyclingRef = useRef(false)

  /** `fresh` bypasses the main process's `--status` cache; pass it after an action that changed the windows. */
  const refresh = useCallback(async (options?: IdeSnapshotOptions) => {
    setState(current => ({ ...current, refreshing: true }))
    try {
      const captured = await fetchIdeSnapshot(options)
      if (!activeRef.current) return
      sourceRef.current = captured.source
      setState(current => {
        const { snapshot, staleWindows } = merge(current.snapshot, captured)
        return { snapshot, staleWindows, loading: false, refreshing: false, error: null }
      })
    } catch (error) {
      if (!activeRef.current) return
      setState(current => ({
        ...current,
        loading: false,
        refreshing: false,
        error: error instanceof Error ? error.message : 'Could not read IDE state',
      }))
    }
  }, [])

  useEffect(() => {
    activeRef.current = true

    function clearTimer() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
    }

    async function cycle() {
      cyclingRef.current = true
      await refresh()
      cyclingRef.current = false
      if (!activeRef.current || document.visibilityState === 'hidden') return
      clearTimer()
      timerRef.current = setTimeout(() => { void cycle() }, POLL_INTERVAL_MS[sourceRef.current ?? 'none'])
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        clearTimer()
        return
      }
      // A capture that was in flight when the tab hid will schedule the next
      // poll itself once it resolves; starting another here would run two chains.
      if (!timerRef.current && !cyclingRef.current) void cycle()
    }

    document.addEventListener('visibilitychange', onVisibility)
    void cycle()
    return () => {
      activeRef.current = false
      clearTimer()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refresh])

  return { ...state, refresh }
}
