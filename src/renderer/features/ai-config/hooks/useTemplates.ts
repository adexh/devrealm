import { useCallback, useEffect, useState } from 'react'
import type { TemplateSummary } from '../../../../shared/templates'
import { listTemplates } from '../ipc/templates'

export function useTemplates() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setTemplates(await listTemplates())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load Templates.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  return { templates, loading, error, refresh }
}
