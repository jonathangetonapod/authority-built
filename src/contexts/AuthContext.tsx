import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'

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

    const { data, error } = await supabase.functions.invoke<AccountContextResponse>('account-context')
    if (requestId !== accountRequestRef.current) return false

    if (error || !data) {
      setAccountState('error')
      setAccountError(error?.message || 'Unable to load account access.')
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
    setAccountState('loading')
    void refreshAccount()
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
