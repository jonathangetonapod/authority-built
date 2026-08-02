import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'

/** How someone describes their own work — the same four the landing page offers. */
export type AccessRequestAudience = 'agency' | 'pr' | 'freelancer' | 'starting_out' | 'other'

export interface AccessRequestInput {
  email: string
  fullName: string
  company?: string
  website?: string
  audience: AccessRequestAudience
  clientsNow?: string
  notes?: string
}

/**
 * Ask for a workspace invite.
 *
 * The platform is invite-only, so this creates no account and returns no
 * session — it records the ask for a platform admin to act on. The caller has
 * no session at all, which is why it goes through the edge function rather than
 * the table.
 */
export async function requestWorkspaceAccess(input: AccessRequestInput): Promise<void> {
  const { error } = await supabase.functions.invoke('request-workspace-access', {
    body: {
      email: input.email.trim().toLowerCase(),
      fullName: input.fullName.trim(),
      // Omitted rather than sent empty: the function rejects unknown fields and
      // stores null for anything absent.
      ...(input.company?.trim() ? { company: input.company.trim() } : {}),
      ...(input.website?.trim() ? { website: input.website.trim() } : {}),
      audience: input.audience,
      ...(input.clientsNow?.trim() ? { clientsNow: input.clientsNow.trim() } : {}),
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    },
  })

  if (error) throw await toFunctionError(error, 'Your request could not be sent. Please try again.')
}
