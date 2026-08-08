import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useClientPortal } from '@/contexts/ClientPortalContext'
import { getPortalExperience } from '@/services/clientPortal'

/** A data error that means the portal session is no longer valid. */
export function isPortalAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const named = error as { name?: string; status?: number }
  return named.name === 'INVALID_PORTAL_SESSION' || named.status === 401
}

/**
 * Shared portal overview query — dashboard, calendar, outreach, and add-ons
 * all read the same cached payload.
 */
export function usePortalExperience() {
  const { client, logout } = useClientPortal()
  const query = useQuery({
    queryKey: ['portal-experience', client?.id],
    queryFn: () => getPortalExperience(client!.id),
    enabled: Boolean(client?.id),
    retry: 1,
    staleTime: 60_000,
  })
  // A rejected token was never converted into a re-login — only the context's
  // own expiry timer logged anyone out, so a skewed device clock or a frozen
  // mobile tab left the client stuck on a "Try again" that 401s forever. Turn
  // a server-side session rejection into a real logout, which redirects to the
  // portal login.
  useEffect(() => {
    if (isPortalAuthError(query.error)) void logout()
  }, [query.error, logout])
  return query
}
