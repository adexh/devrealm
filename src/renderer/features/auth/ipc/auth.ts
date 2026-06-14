import type { AuthUser } from '../types'

export function getUser(): Promise<AuthUser | null> {
  return window.electronAPI.auth.getUser()
}

export function signOut(): Promise<void> {
  return window.electronAPI.auth.signOut()
}

export function openSignIn(): Promise<void> {
  return window.electronAPI.auth.openSignIn()
}

export function getSignInUrl(): Promise<string> {
  return window.electronAPI.auth.getSignInUrl()
}

export function onAuthChanged(cb: (user: AuthUser) => void): () => void {
  return window.electronAPI.auth.onChanged(cb)
}

export function onAuthError(cb: (message: string) => void): () => void {
  return window.electronAPI.auth.onError(cb)
}
