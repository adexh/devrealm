import { create } from 'zustand'
import type { AuthStatus, AuthUser } from '../types'
import * as authIpc from '../ipc/auth'

interface AuthState {
  user: AuthUser | null
  status: AuthStatus
  error: string | null
  hydrate: () => Promise<void>
  signOut: () => Promise<void>
  setUser: (user: AuthUser | null) => void
  setError: (message: string | null) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'loading',
  error: null,
  hydrate: async () => {
    const user = await authIpc.getUser()
    set({ user, status: user ? 'signed-in' : 'signed-out' })
  },
  signOut: async () => {
    await authIpc.signOut()
    set({ user: null, status: 'signed-out', error: null })
  },
  setUser: (user) => set({ user, status: user ? 'signed-in' : 'signed-out', error: null }),
  setError: (error) => set({ error }),
}))
