import { AUTH_VERIFY_PATH, LANDING_URL } from './constants'
import type { AuthUser } from '../shared/types'

// Exchanges a Clerk session token for the signed-in user's profile by calling
// the backend, which holds the Clerk secret key and performs verification.
// The desktop app never sees the secret key — it only trusts this response.
export async function fetchAuthUser(token: string): Promise<AuthUser> {
  const res = await fetch(`${LANDING_URL}${AUTH_VERIFY_PATH}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    throw new Error(`Sign-in verification failed (${res.status})`)
  }

  const data = (await res.json()) as Partial<AuthUser> & { id?: string }
  if (!data.id) {
    throw new Error('Sign-in verification returned no user')
  }

  return {
    id: data.id,
    email: data.email ?? null,
    firstName: data.firstName ?? null,
    lastName: data.lastName ?? null,
    imageUrl: data.imageUrl ?? null,
    hasImage: data.hasImage ?? false,
  }
}
