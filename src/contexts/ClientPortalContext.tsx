import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { Client } from '@/services/clients'
import {
  type ClientPortalSession,
  type PortalBranding,
  validateSession as apiValidateSession,
  loginWithPassword as apiLoginWithPassword,
  logout as apiLogout,
  sessionStorage as portalSessionStorage
} from '@/services/clientPortal'
import { setUser as setSentryUser } from '@/lib/sentry'
import { useAuth } from '@/contexts/AuthContext'
import { queryClient } from '@/lib/queryClient'

interface ClientPortalContextType {
  client: Client | null
  session: ClientPortalSession | null
  branding: PortalBranding | null
  loading: boolean
  isImpersonating: boolean
  loginWithPassword: (email: string, password: string) => Promise<void>
  impersonateClient: (client: Client) => void
  exitImpersonation: () => void
  logout: () => Promise<void>
}

const ClientPortalContext = createContext<ClientPortalContextType | undefined>(undefined)
const IMPERSONATION_STORAGE_KEY = 'admin-impersonating-client'

function clearLegacyStoredImpersonation(): void {
  try {
    window.localStorage.removeItem(IMPERSONATION_STORAGE_KEY)
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}

function clearStoredImpersonation(): void {
  try {
    window.sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY)
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
  clearLegacyStoredImpersonation()
}

function readStoredImpersonation(): string | null {
  try {
    return window.sessionStorage.getItem(IMPERSONATION_STORAGE_KEY)
  } catch {
    return null
  }
}

function saveStoredImpersonation(client: Client): void {
  try {
    window.sessionStorage.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify(client))
  } catch {
    // In-memory impersonation remains available for the current page.
  }
}

export const ClientPortalProvider = ({ children }: { children: React.ReactNode }) => {
  const { isPlatformAdmin, loading: authLoading } = useAuth()
  const [client, setClient] = useState<Client | null>(null)
  const [session, setSession] = useState<ClientPortalSession | null>(null)
  const [branding, setBranding] = useState<PortalBranding | null>(null)
  const [loading, setLoading] = useState(true)
  const [isImpersonating, setIsImpersonating] = useState(false)
  const requestGeneration = useRef(0)

  useEffect(() => {
    if (authLoading) {
      setLoading(true)
      return
    }

    const requestId = ++requestGeneration.current
    // Restore the tab-scoped session (or the in-memory fallback) on mount.
    const restoreSession = async () => {
      setLoading(true)

      // Impersonation is tab-scoped and only restorable while the current
      // Supabase account is still a live platform administrator.
      clearLegacyStoredImpersonation()
      const impersonatingData = readStoredImpersonation()
      if (impersonatingData && isPlatformAdmin) {
        try {
          const impersonatedClient = JSON.parse(impersonatingData)
          if (typeof impersonatedClient?.id !== 'string' || typeof impersonatedClient?.name !== 'string') {
            throw new Error('Stored impersonation is malformed')
          }
          if (requestId !== requestGeneration.current) return
          setClient(impersonatedClient)
          setIsImpersonating(true)
          setLoading(false)
          return
        } catch (error) {
          console.error('[ClientPortal] Failed to restore impersonation:', error)
          clearStoredImpersonation()
        }
      } else {
        clearStoredImpersonation()
        setIsImpersonating(false)
      }

      const { session: storedSession, client: storedClient } = portalSessionStorage.get()

      if (!storedSession || !storedClient) {
        if (requestId !== requestGeneration.current) return
        setSentryUser(null)
        setClient(null)
        setSession(null)
        setLoading(false)
        return
      }

      // Check if session is expired
      if (portalSessionStorage.isExpired(storedSession)) {
        console.log('[ClientPortal] Session expired, clearing storage')
        portalSessionStorage.clear()
        if (requestId !== requestGeneration.current) return
        setSentryUser(null)
        setClient(null)
        setSession(null)
        setLoading(false)
        return
      }

      try {
        // Validate session with backend
        const validation = await apiValidateSession(storedSession.session_token)
        if (requestId !== requestGeneration.current) return
        setSession(storedSession)
        setClient(validation.client)
        setBranding(validation.branding)

        // Set user in Sentry
        setSentryUser({
          id: validation.client.id,
          email: validation.client.email || undefined,
          name: validation.client.name
        })
      } catch (error) {
        console.error('[ClientPortal] Session validation failed:', error)
        portalSessionStorage.clear()
        if (requestId !== requestGeneration.current) return
        setSentryUser(null)
        setClient(null)
        setSession(null)
        setBranding(null)
      } finally {
        if (requestId === requestGeneration.current) setLoading(false)
      }
    }

    void restoreSession()
    return () => {
      if (requestGeneration.current === requestId) requestGeneration.current += 1
    }
  }, [authLoading, isPlatformAdmin])

  const loginWithPassword = async (email: string, password: string) => {
    const requestId = ++requestGeneration.current
    // Clear any existing session first to avoid race conditions
    portalSessionStorage.clear()
    clearStoredImpersonation()
    queryClient.clear()
    setSentryUser(null)
    setSession(null)
    setClient(null)
    setBranding(null)
    setIsImpersonating(false)

    setLoading(true)
    try {
      const { session: newSession, client: newClient, branding: newBranding } = await apiLoginWithPassword(email, password)
      if (requestId !== requestGeneration.current) return

      // Keep the bearer tab-scoped; the store also clears legacy localStorage.
      portalSessionStorage.save(newSession, newClient)

      // Update state
      setSession(newSession)
      setClient(newClient)
      setBranding(newBranding)

      // Set user in Sentry
      setSentryUser({
        id: newClient.id,
        email: newClient.email || undefined,
        name: newClient.name
      })
    } catch (error) {
      console.error('[ClientPortal] Password login failed:', error)
      throw error
    } finally {
      if (requestId === requestGeneration.current) setLoading(false)
    }
  }

  const logout = useCallback(async () => {
    requestGeneration.current += 1
    if (session) {
      try {
        await apiLogout(session.session_token)
      } catch (error) {
        console.error('[ClientPortal] Logout error:', error)
        // Continue with logout even if API call fails
      }
    }

    // Clear state and storage
    portalSessionStorage.clear()
    clearStoredImpersonation()
    queryClient.clear()
    setSession(null)
    setClient(null)
    setBranding(null)
    setIsImpersonating(false)

    // Clear user from Sentry
    setSentryUser(null)
  }, [session])

  // Clear the local and server-side session when its fixed expiry is reached.
  useEffect(() => {
    if (!session) return

    const timeUntilExpiry = new Date(session.expires_at).getTime() - Date.now()
    if (timeUntilExpiry < 60 * 60 * 1000 && timeUntilExpiry > 0) {
      console.warn('[ClientPortal] Session expiring soon')
    }

    const timeoutId = setTimeout(() => {
      void logout()
    }, Math.max(0, timeUntilExpiry))
    return () => clearTimeout(timeoutId)
  }, [logout, session])

  const impersonateClient = (clientToImpersonate: Client) => {
    if (!isPlatformAdmin) throw new Error('Platform administrator access is required')
    requestGeneration.current += 1

    // Never combine an old client bearer session with a different impersonated
    // client. Best-effort invalidate it server-side, then clear all local state.
    if (session) void apiLogout(session.session_token).catch(() => undefined)
    portalSessionStorage.clear()
    queryClient.clear()
    const safeClient = {
      id: clientToImpersonate.id,
      name: clientToImpersonate.name,
      email: clientToImpersonate.email,
      photo_url: clientToImpersonate.photo_url,
    } as Client
    saveStoredImpersonation(safeClient)

    // Set state
    setClient(safeClient)
    setIsImpersonating(true)
    setSession(null) // No real session when impersonating
    setBranding(null) // Impersonation renders the neutral shell
    setSentryUser(null)
  }

  const exitImpersonation = () => {
    requestGeneration.current += 1
    // Clear impersonation data
    clearStoredImpersonation()
    queryClient.clear()

    // Clear state
    setClient(null)
    setIsImpersonating(false)
    setSession(null)
    setBranding(null)
    setSentryUser(null)
  }

  return (
    <ClientPortalContext.Provider
      value={{
        client,
        session,
        branding,
        loading,
        isImpersonating,
        loginWithPassword,
        impersonateClient,
        exitImpersonation,
        logout
      }}
    >
      {children}
    </ClientPortalContext.Provider>
  )
}

// The hook intentionally shares the context module with its provider.
// eslint-disable-next-line react-refresh/only-export-components
export const useClientPortal = () => {
  const context = useContext(ClientPortalContext)
  if (context === undefined) {
    throw new Error('useClientPortal must be used within a ClientPortalProvider')
  }
  return context
}
