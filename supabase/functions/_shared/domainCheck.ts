import { HttpError } from './httpError.ts'
import { providerDomainProgress, providerOfRow } from './domainProviders.ts'

/**
 * Ask the provider where a domain has got to, and write down the answer.
 *
 * One implementation, two callers: the operator pressing Check, and the
 * scheduled tick. A domain that has been serving for a month is never opened
 * by anybody, so the button alone meant nothing ever noticed a certificate
 * that stopped renewing — and a second copy of this logic for the tick would
 * have drifted from the one the button runs, which is the same bug wearing a
 * different hat.
 */

export interface DomainRow {
  id: string
  workspace_id: string
  hostname: string
  status: string
  provider: string | null
  provider_domain_id: string | null
  consecutive_failures: number | null
  activated_at: string | null
  first_activated_at: string | null
}

export const DOMAIN_CHECK_COLUMNS =
  'id,workspace_id,hostname,status,provider,provider_domain_id,consecutive_failures,activated_at,first_activated_at'

// Matches writeAudit exactly. Its actorUserId is typed as string, but the
// column is nullable and the scheduled caller genuinely has no user — so the
// null is cast in at the two call sites below rather than widening a shared
// module the safety rules keep closed.
interface AuditWriter {
  (admin: AdminClient, entry: {
    workspaceId: string
    actorUserId: string
    action: string
    entityType: string
    entityId: string
    metadata: Record<string, unknown>
  }): Promise<void>
}

// Deliberately structural rather than the Supabase client type: this module is
// imported by two functions and should not drag a client generic behind it.
// deno-lint-ignore no-explicit-any
type AdminClient = any

export interface DomainCheckResult {
  status: string
  promoted: boolean
  /** True when a serving domain was kept on a first bad reading. */
  heldOver: boolean
}

export async function checkDomain(
  admin: AdminClient,
  domain: DomainRow,
  actorUserId: string | null,
  writeAudit: AuditWriter,
): Promise<DomainCheckResult> {
  if (!domain.provider_domain_id) {
    throw new HttpError(404, 'DOMAIN_NOT_FOUND', 'That domain is unavailable')
  }

  const { status: reading, error: servingError } = await providerDomainProgress(
    providerOfRow(domain.provider),
    domain.provider_domain_id,
  )

  /**
   * One bad answer is not a broken domain.
   *
   * The reading used to be written straight onto the row, so a single
   * non-active response — an API hiccup, a renewal window, a rate limit
   * answered mid-check — stripped is_primary, and every client link generated
   * before the next check carried the platform's address rather than the
   * agency's. A live domain now needs the failure corroborated by a second
   * consecutive reading, which costs a minute of staleness and buys not lying
   * to an agency's clients about where their dashboards live.
   */
  const previousFailures = Number(domain.consecutive_failures ?? 0)
  const failures = reading === 'active' ? 0 : previousFailures + 1
  const heldOver = reading !== 'active' && domain.status === 'active' && failures < 2
  const nextStatus = heldOver ? 'active' : reading
  const serving = nextStatus === 'active'

  // A workspace's first domain to come alive becomes the one links use.
  // Setting primary was a separate click that existed for exactly one reason —
  // a second domain must not steal links from a working first — so it stays
  // manual only when a primary already exists.
  // let, because losing the promotion race downgrades it to false below.
  let promoted = false
  if (serving) {
    const { data: existingPrimary, error: primaryError } = await admin
      .from('workspace_domains')
      .select('id')
      .eq('workspace_id', domain.workspace_id)
      .eq('is_primary', true)
      .maybeSingle()
    if (primaryError) throw new HttpError(500, 'DOMAIN_REFRESH_FAILED', 'The domain could not be updated')
    promoted = !existingPrimary || existingPrimary.id === domain.id
  }

  const wasPrimaryBefore = Boolean(
    (await admin.from('workspace_domains').select('is_primary').eq('id', domain.id).maybeSingle()).data?.is_primary,
  )

  const applyUpdate = (primary: boolean) => admin
    .from('workspace_domains')
    .update({
      status: nextStatus,
      // The constraint pairs these: active carries a date, everything else
      // carries none, so the row can never claim to serve without one. Kept
      // rather than re-minted while it stays active, or every check would
      // reset how long the domain has been up.
      activated_at: serving ? (domain.activated_at ?? new Date().toISOString()) : null,
      // Never cleared, because activated_at cannot survive a dip and
      // "serving since" is a real question after one.
      first_activated_at: serving
        ? (domain.first_activated_at ?? domain.activated_at ?? new Date().toISOString())
        : (domain.first_activated_at ?? null),
      consecutive_failures: failures,
      last_checked_at: new Date().toISOString(),
      // A held-over domain is still serving, but the reason it might stop is
      // worth keeping where support can see it.
      last_error: reading === 'active' ? null : servingError,
      is_primary: primary,
    })
    .eq('id', domain.id)

  let { error: updateError } = await applyUpdate(promoted)
  // The read-then-promote is a race two concurrent checks can both win — the
  // poll plus a manual Check makes that ordinary, not exotic. The unique index
  // is the referee: when it refuses the second promotion, the correct outcome
  // is the same update without the crown, not a 500 that also leaves the row
  // stuck on its old status.
  if (updateError && promoted && updateError.code === '23505') {
    promoted = false
    ;({ error: updateError } = await applyUpdate(false))
  }
  if (updateError) throw new HttpError(500, 'DOMAIN_REFRESH_FAILED', 'The domain could not be updated')

  // Automatic changes to which domain links use must be findable later. The
  // manual set_primary click writes an audit entry; a silent flip from a
  // background check is exactly the kind an admin needs to reconstruct.
  if (promoted && !wasPrimaryBefore) {
    await writeAudit(admin, {
      workspaceId: domain.workspace_id,
      // See AuditWriter: the column is nullable, the shared type is not.
      actorUserId: actorUserId as string,
      action: 'workspace.domain.primary_set',
      entityType: 'workspace_domain',
      entityId: domain.id,
      metadata: { hostname: domain.hostname, via: 'refresh_auto_promote' },
    })
  } else if (wasPrimaryBefore && !promoted) {
    // Any way the crown comes off, not just going dark: losing the promotion
    // race while still serving takes it off too, and that is the least visible
    // of the two.
    await writeAudit(admin, {
      workspaceId: domain.workspace_id,
      actorUserId: actorUserId as string,
      action: 'workspace.domain.primary_lost',
      entityType: 'workspace_domain',
      entityId: domain.id,
      metadata: {
        hostname: domain.hostname,
        reason: serving ? 'another domain is primary' : (servingError ?? 'not serving'),
      },
    })
  }

  return { status: nextStatus, promoted, heldOver }
}
