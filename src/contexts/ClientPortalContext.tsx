import { createContext, useContext, useEffect, useState } from 'react'
import type { Client } from '@/services/clients'
import {
  type ClientPortalSession,
  requestMagicLink as apiRequestMagicLink,
  verifyToken as apiVerifyToken,
  validateSession as apiValidateSession,
  logout as apiLogout,
  sessionStorage
} from '@/services/clientPortal'

interface ClientPortalContextType {
  client: Client | null
  session: ClientPortalSession | null
  loading: boolean
  requestMagicLink: (email: string) => Promise<void>
  loginWithToken: (token: string) => Promise<void>
  logout: () => Promise<void>
}

const ClientPortalContext = createContext<ClientPortalContextType | undefined>(undefined)

export const ClientPortalProvider = ({ children }: { children: React.ReactNode }) => {
  const [client, setClient] = useState<Client | null>(null)
  const [session, setSession] = useState<ClientPortalSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Restore session from localStorage on mount
    const restoreSession = async () => {
      const { session: storedSession, client: storedClient } = sessionStorage.get()

      if (!storedSession || !storedClient) {
        setLoading(false)
        return
      }

      // Check if session is expired
      if (sessionStorage.isExpired(storedSession)) {
        console.log('[ClientPortal] Session expired, clearing storage')
        sessionStorage.clear()
        setLoading(false)
        return
      }

      try {
        // Validate session with backend
        const validatedClient = await apiValidateSession(storedSession.session_token)
        setSession(storedSession)
        setClient(validatedClient)
      } catch (error) {
        console.error('[ClientPortal] Session validation failed:', error)
        sessionStorage.clear()
      } finally {
        setLoading(false)
      }
    }

    restoreSession()
  }, [])

  // Auto-refresh session before expiry (23 hours)
  useEffect(() => {
    if (!session) return

    const expiresAt = new Date(session.expires_at)
    const now = new Date()
    const timeUntilExpiry = expiresAt.getTime() - now.getTime()

    // If less than 1 hour until expiry, show warning
    if (timeUntilExpiry < 60 * 60 * 1000 && timeUntilExpiry > 0) {
      console.warn('[ClientPortal] Session expiring soon')
      // Could show toast notification here
    }

    // Set timeout to clear session when it expires
    const timeoutId = setTimeout(() => {
      console.log('[ClientPortal] Session expired, logging out')
      logout()
    }, timeUntilExpiry)

    return () => clearTimeout(timeoutId)
  }, [session])

  const requestMagicLink = async (email: string) => {
    await apiRequestMagicLink(email)
  }

  const loginWithToken = async (token: string) => {
    // Clear any existing session first to avoid race conditions
    sessionStorage.clear()
    setSession(null)
    setClient(null)

    setLoading(true)
    try {
      const { session: newSession, client: newClient } = await apiVerifyToken(token)

      // Store in localStorage
      sessionStorage.save(newSession, newClient)

      // Update state
      setSession(newSession)
      setClient(newClient)
    } catch (error) {
      console.error('[ClientPortal] Login failed:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    if (session) {
      try {
        await apiLogout(session.session_token)
      } catch (error) {
        console.error('[ClientPortal] Logout error:', error)
        // Continue with logout even if API call fails
      }
    }

    // Clear state and storage
    sessionStorage.clear()
    setSession(null)
    setClient(null)
  }

  return (
    <ClientPortalContext.Provider
      value={{
        client,
        session,
        loading,
        requestMagicLink,
        loginWithToken,
        logout
      }}
    >
      {children}
    </ClientPortalContext.Provider>
  )
}

export const useClientPortal = () => {
  const context = useContext(ClientPortalContext)
  if (context === undefined) {
    throw new Error('useClientPortal must be used within a ClientPortalProvider')
  }
  return context
}
