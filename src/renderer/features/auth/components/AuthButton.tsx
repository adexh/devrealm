import { useEffect, useRef, useState } from 'react'
import { UserRound } from 'lucide-react'
import { Modal } from '../../../components/ui'
import { useAuthStore } from '../hooks/useAuthStore'
import { getSignInUrl, openSignIn } from '../ipc/auth'
import type { AuthUser } from '../types'

function displayName(user: AuthUser): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  return full || user.email || 'Account'
}

function initials(user: AuthUser): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  const source = full || user.email || '?'
  return source.slice(0, 1).toUpperCase()
}

function SignedInMenu({ user }: { user: AuthUser }) {
  const signOut = useAuthStore((s) => s.signOut)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Account"
        title={displayName(user)}
        className="h-7 w-7 inline-flex items-center justify-center rounded-full bg-t-accent-bg text-t-accent-ink text-[12px] font-medium leading-none hover:opacity-90 cursor-pointer overflow-hidden"
      >
        {user.hasImage && user.imageUrl
          ? <img src={user.imageUrl} alt="" className="h-full w-full object-cover" />
          : initials(user)}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 min-w-52 rounded border border-t-line bg-t-bg shadow-[0_8px_24px_rgba(0,0,0,0.18)] py-1">
          <div className="px-3 py-2 border-b border-t-line">
            <p className="text-[13px] text-t-ink truncate">{displayName(user)}</p>
            {user.email && <p className="text-[12px] text-t-ink-soft truncate">{user.email}</p>}
          </div>
          <button
            type="button"
            onClick={() => { setOpen(false); void signOut() }}
            className="w-full text-left px-3 py-2 text-[13px] text-t-ink hover:bg-t-panel cursor-pointer"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function SignedOutButton() {
  const error = useAuthStore((s) => s.error)
  const [modalOpen, setModalOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [signInUrl, setSignInUrl] = useState('')

  function handleSignIn() {
    void openSignIn()
    void getSignInUrl().then(setSignInUrl)
    setModalOpen(true)
  }

  function handleCopy() {
    void navigator.clipboard.writeText(signInUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleSignIn}
        aria-label="Sign in"
        title="Sign in"
        className="h-8.5 w-8.5 inline-flex items-center justify-center rounded bg-transparent text-t-ink-soft hover:text-t-ink hover:bg-t-panel-alt cursor-pointer"
      >
        <UserRound size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      {modalOpen && (
        <Modal title="Sign in to DevRealm" onClose={() => setModalOpen(false)} width={480}>
          <div className="px-6 pb-6 flex flex-col gap-4">
            <p className="text-[14px] text-t-ink">Sign in from your browser to continue</p>
            <p className="text-[13px] text-t-ink-soft leading-relaxed">
              {"If your browser hasn't opened DevRealm for you to sign in, "}
              <a
                href={signInUrl}
                onClick={e => { e.preventDefault(); void openSignIn() }}
                className="text-t-accent underline hover:opacity-80 cursor-pointer"
              >
                open it manually
              </a>
              {' or '}
              <button
                type="button"
                onClick={handleCopy}
                className="text-t-accent underline hover:opacity-80 cursor-pointer bg-transparent border-0 p-0 text-[13px]"
              >
                {copied ? 'Copied!' : 'copy the URL'}
              </button>
            </p>
            {error && <p className="text-[13px] text-red-500">{error}</p>}
          </div>
        </Modal>
      )}
    </>
  )
}

export function AuthButton() {
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)

  if (status === 'loading') return null
  if (status === 'signed-in' && user) return <SignedInMenu user={user} />
  return <SignedOutButton />
}
