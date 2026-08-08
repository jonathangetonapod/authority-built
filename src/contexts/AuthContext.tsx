import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'
import { toFunctionError } from '@/lib/functionErrors'

export type AccountState =
  | 'loading'
  | 'signed_out'
  | 'active'
  | 'pending'
  | 'password_change_required'
  | 'reauthentication_required'
  | 'expired'
  | 'suspended'
  | 'no_membership'
  | 'error'

export interface Workspace {
  id: string
  name: string
  slug: string | null
  status: 'active' | 'suspended' | 'archived' | string
  is_default: boolean
  logo_path: string | null
  logo_updated_at: string | null
}

export interface WorkspaceMembership {
  id: string
  workspace_id: string
  full_name: string | null
  role: 'owner' | 'admin' | 'member'
  status: 'invited' | 'active' | 'suspended' | 'revoked' | string
}

interface AccountContextResponse {
  platform_admin: boolean
  state:
    | 'active'
    | 'pending'
    | 'password_change_required'
    | 'reauthentication_required'
    | 'expired'
    | 'suspended'
    | 'no_membership'
  membership: WorkspaceMembership | null
  workspace: Workspace | null
}

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  accountState: AccountState
  accountError: string | null
  isPlatformAdmin: boolean
  membership: WorkspaceMembership | null
  workspace: Workspace | null
  canWriteClients: boolean
  canManageWorkspaceStaff: boolean
  /**
   * Reload the account. Loud by default: the state goes to loading, which
   * ProtectedRoute answers with a full-screen spinner.
   *
   * Pass quiet when an already-signed-in page is refreshing its own view of
   * the account after a save. Loud there unmounts the page mid-use and
   * rebuilds it, losing drafts and scroll position, to change a name in the
   * sidebar. A failure still surfaces either way.
   */
  refreshAccount: (options?: { quiet?: boolean }) => Promise<boolean>
  refreshSession: () => Promise<boolean>
  signInWithGoogle: () => Promise<void>
  signInWithPassword: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const clearSensitiveAccountStorage = () => {
  try {
    window.localStorage.removeItem('podcast-finder-state')
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
  try {
    window.sessionStorage.removeItem('podcast-finder-state')
    window.sessionStorage.removeItem('podcast-finder-client-scope-v3')
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [accountState, setAccountState] = useState<AccountState>('loading')
  const [accountError, setAccountError] = useState<string | null>(null)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [membership, setMembership] = useState<WorkspaceMembership | null>(null)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const accountRequestRef = useRef(0)
  const lastUserIdRef = useRef<string | null>(null)
  // Which user we have already loaded the account for. The difference between
  // a sign-in and a background token refresh is not visible in the token
  // itself, and only one of the two may unmount the page.
  const resolvedForUserRef = useRef<string | null>(null)

  const clearAccount = useCallback((nextState: AccountState = 'signed_out') => {
    accountRequestRef.current += 1
    if (nextState === 'signed_out') clearSensitiveAccountStorage()
    setAccountState(nextState)
    setAccountError(null)
    setIsPlatformAdmin(false)
    setMembership(null)
    setWorkspace(null)
  }, [])

  const refreshAccount = useCallback(async (options?: { quiet?: boolean }) => {
    const requestId = ++accountRequestRef.current
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (requestId !== accountRequestRef.current) return false

    if (sessionError) {
      clearAccount('error')
      setAccountError(sessionError.message)
      return false
    }

    if (!sessionData.session) {
      clearAccount('signed_out')
      return false
    }
    if (sessionData.session.user.id !== lastUserIdRef.current) return false

    // Quiet refreshes leave the state alone, so a page that is already
    // rendering keeps rendering while the account is re-read underneath it.
    if (!options?.quiet) setAccountState('loading')
    setAccountError(null)

    // Bound the wait. Without a timeout, a stalled function or gateway (a cold
    // start beyond the proxy window, a hung connection) left the loud path on
    // 'loading' forever — a full-screen spinner with no escape. On timeout the
    // loud path falls to 'error', which at least offers Try again / Sign out.
    const ACCOUNT_CONTEXT_TIMEOUT_MS = 15000
    const result = await Promise.race([
      supabase.functions.invoke<AccountContextResponse>('account-context')
        .then((response) => ({ ...response, timedOut: false as const })),
      new Promise<{ data: null; error: null; timedOut: true }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: null, timedOut: true }), ACCOUNT_CONTEXT_TIMEOUT_MS)),
    ])
    if (requestId !== accountRequestRef.current) return false
    const { data, error } = result

    if (result.timedOut || error || !data) {
      if (requestId !== accountRequestRef.current) return false
      /*
       * A quiet refresh is the client's own token housekeeping, and a
       * transient failure there (5xx, cold start, network blip, timeout) must
       * NOT evict a user whose account is fine — a genuine state change comes
       * back as data, never as an error. Keep whatever is on screen and let
       * the next loud read decide, instead of dropping an in-progress form to
       * an error screen for a routine token rotation.
       */
      if (options?.quiet) return false
      // The SDK's own message for any non-2xx is the same sentence every time,
      // so reading it here threw away every specific refusal account-context
      // takes the trouble to name — invalid auth, context unavailable,
      // authorization unavailable. This is the project's normalizer and it
      // reads the real body.
      const normalized = result.timedOut
        ? new Error('Account access timed out. Check your connection and try again.')
        : error
          ? await toFunctionError(error, 'Unable to load account access.')
          : new Error('Unable to load account access.')
      setAccountState('error')
      setAccountError(normalized.message)
      setIsPlatformAdmin(false)
      setMembership(null)
      setWorkspace(null)
      return false
    }

    setIsPlatformAdmin(Boolean(data.platform_admin))
    setMembership(data.membership || null)
    setWorkspace(data.workspace || null)

    // Platform admins retain access to the legacy operational dashboard even
    // when they do not have a tenant membership.
    setAccountState(data.platform_admin ? 'active' : data.state)
    return true
  }, [clearAccount])

  const applySession = useCallback((nextSession: Session | null) => {
    const nextUserId = nextSession?.user.id ?? null
    if (lastUserIdRef.current !== nextUserId) {
      queryClient.clear()
      clearSensitiveAccountStorage()
      lastUserIdRef.current = nextUserId
      resolvedForUserRef.current = null
      accountRequestRef.current += 1
      setAccountError(null)
      setIsPlatformAdmin(false)
      setMembership(null)
      setWorkspace(null)
      setAccountState(nextSession ? 'loading' : 'signed_out')
    }

    setSession(nextSession)
    setUser(nextSession?.user ?? null)
    if (!nextSession) clearAccount('signed_out')
  }, [clearAccount])

  const refreshSession = useCallback(async () => {
    const { data, error } = await supabase.auth.refreshSession()
    if (error || !data.session) return false
    applySession(data.session)
    return true
  }, [applySession])

  useEffect(() => {
    let mounted = true

    const initialize = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (!mounted) return

      if (error) {
        setAccountState('error')
        setAccountError(error.message)
        return
      }

      applySession(data.session)
    }

    void initialize()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      applySession(nextSession)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [applySession])

  const accessToken = session?.access_token
  useEffect(() => {
    if (!accessToken) return

    /*
     * Supabase refreshes the access token on its own schedule, and every
     * refresh lands here. Reloading loudly meant ProtectedRoute answered a
     * routine token rotation by unmounting whatever page someone was using
     * and showing a full-screen spinner — losing an in-progress form to
     * change nothing anyone can see.
     *
     * The first token for a user is the sign-in, where loud is right because
     * there is nothing on screen yet to lose. Every token after it is the
     * client's own housekeeping, and re-reads the account underneath the page.
     */
    const userId = lastUserIdRef.current
    const firstTokenForUser = resolvedForUserRef.current !== userId
    resolvedForUserRef.current = userId
    void refreshAccount({ quiet: !firstTokenForUser })
  }, [accessToken, refreshAccount])

  const signInWithGoogle = useCallback(async () => {
    const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${baseUrl}/admin/callback`,
      },
    })
    if (error) throw error
  }, [])

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    clearSensitiveAccountStorage()
    const { error } = await supabase.auth.signOut()
    applySession(null)
    queryClient.clear()
    if (error) throw error
  }, [applySession])

  const value = useMemo<AuthContextType>(() => ({
    user,
    session,
    loading: accountState === 'loading',
    accountState,
    accountError,
    isPlatformAdmin,
    membership,
    workspace,
    canWriteClients: isPlatformAdmin || membership?.role === 'owner' || membership?.role === 'admin',
    canManageWorkspaceStaff: !isPlatformAdmin && (membership?.role === 'owner' || membership?.role === 'admin'),
    refreshAccount,
    refreshSession,
    signInWithGoogle,
    signInWithPassword,
    signOut,
  }), [
    user,
    session,
    accountState,
    accountError,
    isPlatformAdmin,
    membership,
    workspace,
    refreshAccount,
    refreshSession,
    signInWithGoogle,
    signInWithPassword,
    signOut,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// The hook intentionally shares the context module with its provider.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
