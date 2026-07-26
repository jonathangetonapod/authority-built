import { useQuery } from '@tanstack/react-query'

import { useClientPortal } from '@/contexts/ClientPortalContext'
import { getPortalExperience } from '@/services/clientPortal'

/**
 * Shared portal overview query — dashboard, calendar, outreach, and add-ons
 * all read the same cached payload.
 */
export function usePortalExperience() {
  const { client } = useClientPortal()
  return useQuery({
    queryKey: ['portal-experience', client?.id],
    queryFn: () => getPortalExperience(client!.id),
    enabled: Boolean(client?.id),
    retry: 1,
    staleTime: 60_000,
  })
}
