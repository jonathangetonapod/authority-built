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

/** Where a request has got to. The column constrains these four. */
export type AccessRequestStatus = 'new' | 'contacted' | 'invited' | 'declined'

export interface JoinRequest {
  id: string
  email: string
  full_name: string
  company: string | null
  website: string | null
  audience: AccessRequestAudience
  clients_now: string | null
  notes: string | null
  status: AccessRequestStatus
  handled_at: string | null
  handled_note: string | null
  created_at: string
}

/** The columns an admin queue needs. source_ip_hash is deliberately not among them. */
const QUEUE_COLUMNS =
  'id, email, full_name, company, website, audience, clients_now, notes, status, handled_at, handled_note, created_at'

/**
 * Every request to join, newest first.
 *
 * Read straight from the table rather than through an edge function, which
 * departs from the house pattern. Two reasons: the project is at its deployed
 * function cap so a new one cannot ship, and the row-level policy on this table
 * is already `public.is_platform_admin()` for select and update — the same
 * SECURITY DEFINER check every other admin-only policy uses. A non-admin session
 * reading this gets an empty list from Postgres, not from us.
 */
export async function listJoinRequests(): Promise<JoinRequest[]> {
  const { data, error } = await supabase
    .from('workspace_access_requests')
    .select(QUEUE_COLUMNS)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'Requests to join could not be loaded.')
  return (data ?? []) as JoinRequest[]
}

/**
 * Move a request along, recording who did it and when.
 *
 * `handled_by` is stamped from the caller's own session rather than passed in,
 * so the queue records the admin who actually acted.
 */
export async function setJoinRequestStatus(
  id: string,
  status: AccessRequestStatus,
  note?: string,
): Promise<void> {
  const { data: session } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('workspace_access_requests')
    .update({
      status,
      handled_by: session?.user?.id ?? null,
      // A request moved back to 'new' is unhandled again, and should not keep
      // claiming it was dealt with.
      handled_at: status === 'new' ? null : new Date().toISOString(),
      handled_note: note?.trim() ? note.trim() : null,
    })
    .eq('id', id)

  if (error) throw new Error(error.message || 'That request could not be updated.')
}

/**
 * How many requests are still waiting.
 *
 * Returns 0 rather than throwing. This feeds a badge in the app shell, which is
 * rendered on every workspace page — a count that cannot be read is a reason to
 * show no badge, never a reason to take down the surrounding page. The queue
 * itself reports its own failures properly; this is only the nudge toward it.
 */
export async function countWaitingJoinRequests(): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('workspace_access_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new')
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}
