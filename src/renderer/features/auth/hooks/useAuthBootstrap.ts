import { useEffect } from 'react'
import { useAuthStore } from './useAuthStore'
import { onAuthChanged, onAuthError } from '../ipc/auth'

// Hydrates the auth store from persisted state and keeps it in sync with
// deep-link sign-in events from the main process. Call once at the app root.
export function useAuthBootstrap(): void {
  const hydrate = useAuthStore((s) => s.hydrate)
  const setUser = useAuthStore((s) => s.setUser)
  const setError = useAuthStore((s) => s.setError)

  useEffect(() => {
    void hydrate()
    const offChanged = onAuthChanged(setUser)
    const offError = onAuthError(setError)
    return () => {
      offChanged()
      offError()
    }
  }, [hydrate, setUser, setError])
}
