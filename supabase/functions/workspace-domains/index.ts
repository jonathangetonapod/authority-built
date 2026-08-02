import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requirePlatformAdmin,
  requireOnlyKeys,
  requireString,
  requireUuid,
  writeAudit,
} from '../_shared/workspaceAuth.ts'
import {
  cloudflareHostnameProgress,
  createCloudflareHostname,
  deleteCloudflareHostname,
  type ProviderDomain,
  type ProviderProgress,
} from '../_shared/cloudflareSaas.ts'

/**
 * Attaches a custom hostname to a workspace and drives it to serving.
 *
 * Two systems have to agree: Railway must hold the domain and issue a
 * certificate for it, and this database must map it to exactly one workspace.
 * Railway is the one that can refuse, so it goes first — a row that exists here
 * while Railway has never heard of the hostname would resolve a client to a
 * workspace on a domain that answers with a certificate error.
 */
const METHODS = ['POST'] as const
const RAILWAY_API = 'https://backboard.railway.com/graphql/v2'
const MAX_HOSTNAME_LENGTH = 253

interface RailwayDomain {
  id: string
  domain: string
  status: string | null
  dnsRecordType: string | null
  dnsRecordName: string | null
  dnsRecordValue: string | null
}

// Railway returns several DNS records per domain. Only one of them routes
// traffic; the other is the ACME DNS-01 challenge, and handing an agency that
// one instead would have them create a TXT record that never serves the site.
const TRAFFIC_ROUTE = 'DNS_RECORD_PURPOSE_TRAFFIC_ROUTE'
// The certificate enum is prefixed. There is no bare 'ISSUED'.
const CERTIFICATE_VALID = 'CERTIFICATE_STATUS_TYPE_VALID'
// The provider's own word that the record is live. Only this promotes a domain
// out of "waiting for DNS" — every other value, including one Railway adds
// later that we have never seen, leaves it waiting rather than claiming
// progress we cannot back up.
const DNS_RECORD_PROPAGATED = 'DNS_RECORD_STATUS_PROPAGATED'

function trafficRecord(records: unknown): Record<string, unknown> | null {
  if (!Array.isArray(records)) return null
  const rows = records.filter((row): row is Record<string, unknown> =>
    Boolean(row) && typeof row === 'object')
  return rows.find((row) => row.purpose === TRAFFIC_ROUTE) ?? null
}

// DNS_RECORD_TYPE_CNAME -> CNAME. An apex domain gets an A record from
// Railway, so this cannot be assumed.
function dnsRecordType(value: unknown): string {
  const raw = typeof value === 'string' ? value.replace(/^DNS_RECORD_TYPE_/u, '') : ''
  return /^[A-Z]+$/u.test(raw) ? raw : 'CNAME'
}

function railwayToken(): string {
  const token = Deno.env.get('RAILWAY_API_TOKEN')?.trim()
  if (!token) {
    throw new HttpError(
      503,
      'RAILWAY_NOT_CONFIGURED',
      'RAILWAY_API_TOKEN is not set, so custom domains cannot be provisioned',
    )
  }
  return token
}

function railwayTarget(): { serviceId: string; environmentId: string; projectId: string } {
  const serviceId = Deno.env.get('RAILWAY_SERVICE_ID')?.trim()
  const environmentId = Deno.env.get('RAILWAY_ENVIRONMENT_ID')?.trim()
  const projectId = Deno.env.get('RAILWAY_PROJECT_ID')?.trim()
  if (!serviceId || !environmentId || !projectId) {
    throw new HttpError(
      503,
      'RAILWAY_NOT_CONFIGURED',
      'RAILWAY_SERVICE_ID, RAILWAY_ENVIRONMENT_ID and RAILWAY_PROJECT_ID must all be set',
    )
  }
  return { serviceId, environmentId, projectId }
}

async function railwayGraphql(
  query: string,
  variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(RAILWAY_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${railwayToken()}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(20_000),
    })
  } catch (_error) {
    throw new HttpError(504, 'RAILWAY_UNREACHABLE', 'Railway did not respond')
  }

  const text = await response.text()
  if (!response.ok) {
    // Railway's status and body are the only thing that explains a refusal, so
    // they are carried through rather than replaced with a generic message.
    throw new HttpError(
      502,
      'RAILWAY_REJECTED',
      `Railway returned ${response.status}: ${text.slice(0, 300)}`,
    )
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new HttpError(502, 'RAILWAY_REJECTED', 'Railway returned a response that was not JSON')
  }
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const first = payload.errors[0] as { message?: unknown }
    throw new HttpError(
      502,
      'RAILWAY_REJECTED',
      `Railway refused the request: ${String(first?.message ?? 'unknown error').slice(0, 300)}`,
    )
  }
  return (payload.data ?? {}) as Record<string, unknown>
}

function railwayDomain(value: unknown): RailwayDomain {
  const row = (value ?? {}) as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id : ''
  const domain = typeof row.domain === 'string' ? row.domain.toLowerCase() : ''
  if (!id || !domain) {
    throw new HttpError(502, 'RAILWAY_REJECTED', 'Railway did not return the created domain')
  }
  return {
    id,
    domain,
    status: typeof row.status === 'string' ? row.status : null,
    dnsRecordType: typeof row.dnsRecordType === 'string' ? row.dnsRecordType : null,
    dnsRecordName: typeof row.dnsRecordName === 'string' ? row.dnsRecordName : null,
    dnsRecordValue: typeof row.dnsRecordValue === 'string' ? row.dnsRecordValue : null,
  }
}

async function createRailwayDomain(hostname: string): Promise<RailwayDomain> {
  const { serviceId, environmentId, projectId } = railwayTarget()
  const data = await railwayGraphql(
    `mutation CreateCustomDomain($input: CustomDomainCreateInput!) {
       customDomainCreate(input: $input) {
         id
         domain
         status {
           certificateStatus
           dnsRecords { purpose recordType fqdn requiredValue status }
         }
       }
     }`,
    { input: { domain: hostname, serviceId, environmentId, projectId } },
  )
  const created = (data.customDomainCreate ?? {}) as Record<string, unknown>
  const status = (created.status ?? {}) as Record<string, unknown>
  const record = trafficRecord(status.dnsRecords)
  return railwayDomain({
    id: created.id,
    domain: created.domain,
    status: 'awaiting_dns',
    dnsRecordType: dnsRecordType(record?.recordType),
    // fqdn, not hostlabel: hostlabel is just the sub-label ("podcasts"), and an
    // agency pasting that into their DNS host would create the wrong record.
    dnsRecordName: typeof record?.fqdn === 'string' ? record.fqdn : hostname,
    dnsRecordValue: typeof record?.requiredValue === 'string' ? record.requiredValue : null,
  })
}

async function deleteRailwayDomain(providerDomainId: string): Promise<void> {
  await railwayGraphql(
    'mutation DeleteCustomDomain($id: String!) { customDomainDelete(id: $id) }',
    { id: providerDomainId },
  )
}

/**
 * Where the domain has actually got to, in three states rather than two.
 *
 * This used to answer serving or not-serving, and everything that was not
 * serving got written down as awaiting_dns. So a domain whose record had
 * propagated and was only waiting on a certificate reported "Waiting for DNS"
 * with a reason that told the operator to go and fix a DNS record that was
 * already correct. The provisioning state existed in the UI the whole time
 * and nothing ever set it.
 *
 * Only PROPAGATED promotes to provisioning. Anything else — requires-update,
 * an unrecognized status, or no record at all — stays awaiting_dns, because
 * the honest answer when the provider has not confirmed the record is that we
 * are still waiting on the record.
 */
async function railwayDomainProgress(
  providerDomainId: string,
): Promise<ProviderProgress> {
  const { projectId } = railwayTarget()
  const data = await railwayGraphql(
    `query CustomDomain($id: String!, $projectId: String!) {
       customDomain(id: $id, projectId: $projectId) {
         id
         status {
           certificateStatus
           certificateErrorMessage
           dnsRecords { purpose status }
         }
       }
     }`,
    { id: providerDomainId, projectId },
  )
  // Railway answers a deleted domain with a null customDomain rather than an
  // error, which read as "no certificate yet" and parked the row on waiting for
  // DNS forever — an agency chased for a record that could never help. The
  // absence is the answer.
  if (!data.customDomain) {
    return {
      status: 'failed',
      error: 'This domain no longer exists at Railway. Remove it here and add it again.',
    }
  }
  const domain = (data.customDomain ?? {}) as Record<string, unknown>
  const status = (domain.status ?? {}) as Record<string, unknown>
  if (status.certificateStatus === CERTIFICATE_VALID) return { status: 'active', error: null }
  // Railway's own message says whether DNS is missing or the certificate is
  // still issuing. That is the difference between "wait" and "fix your DNS",
  // and guessing it here would be worse than saying nothing.
  const providerMessage = typeof status.certificateErrorMessage === 'string'
    ? status.certificateErrorMessage
    : null
  const record = trafficRecord(status.dnsRecords)
  const dnsPropagated = record?.status === DNS_RECORD_PROPAGATED
  // Railway says nothing at all while a certificate is merely slow — the
  // hostname that stalled for three hours reported a null message throughout.
  // So a message here is the provider naming something wrong, which waiting
  // will not fix, rather than narrating progress.
  if (providerMessage) return { status: 'failed', error: providerMessage }
  return {
    status: dnsPropagated ? 'provisioning' : 'awaiting_dns',
    error: dnsPropagated
      // Named as done so nobody is sent back to DNS to fix what is correct.
      ? 'The DNS record is in place. Waiting for the certificate to be issued'
      : 'The DNS record has not been created yet, or has not propagated',
  }
}

/**
 * Which provider handles a domain, and which handles the next one added.
 *
 * Read per row, not globally: a workspace already serving on a Railway domain
 * must keep being refreshed and removed through Railway after the platform
 * switches, or flipping the env var would strand every live domain behind an
 * API that has never heard of it. Only new domains follow the setting.
 */
type DomainProvider = 'railway' | 'cloudflare'

function providerForNewDomains(): DomainProvider {
  return Deno.env.get('CUSTOM_DOMAIN_PROVIDER')?.trim() === 'cloudflare' ? 'cloudflare' : 'railway'
}

function providerOfRow(value: unknown): DomainProvider {
  return value === 'cloudflare' ? 'cloudflare' : 'railway'
}

function createProviderDomain(provider: DomainProvider, hostname: string): Promise<ProviderDomain> {
  if (provider === 'cloudflare') return createCloudflareHostname(hostname)
  return createRailwayDomain(hostname).then((created) => ({
    id: created.id,
    dnsRecordType: created.dnsRecordType ?? 'CNAME',
    dnsRecordName: created.dnsRecordName ?? hostname,
    dnsRecordValue: created.dnsRecordValue,
  }))
}

function providerDomainProgress(provider: DomainProvider, providerDomainId: string): Promise<ProviderProgress> {
  if (provider === 'cloudflare') return cloudflareHostnameProgress(providerDomainId)
  return railwayDomainProgress(providerDomainId)
}

function deleteProviderDomain(provider: DomainProvider, providerDomainId: string): Promise<void> {
  if (provider === 'cloudflare') return deleteCloudflareHostname(providerDomainId)
  return deleteRailwayDomain(providerDomainId)
}

function normalizeHostname(value: string): string {
  const hostname = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, '')
    .split('/')[0]
    .split(':')[0]
    .replace(/\.$/u, '')
  if (
    hostname.length < 4
    || hostname.length > MAX_HOSTNAME_LENGTH
    || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/u.test(hostname)
  ) {
    throw new HttpError(400, 'INVALID_HOSTNAME', 'Enter a hostname such as podcasts.agency.com')
  }
  // Must match workspace_domains_not_platform_origin exactly. When it did not,
  // a platform subdomain passed here, registered a real domain at Railway, and
  // only then failed on the constraint — a wasted provider call and a generic
  // 500 in place of a clear refusal.
  if (hostname === 'getonapod.com' || hostname.endsWith('.getonapod.com')) {
    throw new HttpError(400, 'RESERVED_HOSTNAME', 'That hostname belongs to the platform')
  }
  return hostname
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }
    const body = await parseJsonObject(req)
    const action = typeof body.action === 'string' ? body.action : ''
    const { admin, user } = await requirePlatformAdmin(req)

    if (action === 'list') {
      requireOnlyKeys(body, ['action'])
      const { data, error } = await admin
        .from('workspace_domains')
        .select('id,workspace_id,hostname,status,is_primary,dns_record_type,dns_record_name,dns_record_value,last_error,activated_at,first_activated_at,last_checked_at,created_at,workspace:workspaces(id,name,slug)')
        .order('created_at', { ascending: false })
      if (error) throw new HttpError(500, 'DOMAIN_LIST_FAILED', 'Domains could not be loaded')
      return jsonResponse(req, METHODS, 200, { success: true, domains: data ?? [] })
    }

    if (action === 'add') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'hostname'])
      const workspaceId = requireUuid(body.workspace_id, 'workspace_id')
      const hostname = normalizeHostname(
        requireString(body.hostname, 'hostname', { max: MAX_HOSTNAME_LENGTH + 16 }),
      )

      const { data: workspace, error: workspaceError } = await admin
        .from('workspaces')
        .select('id,name,status')
        .eq('id', workspaceId)
        .eq('status', 'active')
        .maybeSingle()
      if (workspaceError) throw new HttpError(500, 'DOMAIN_ADD_FAILED', 'The workspace could not be read')
      if (!workspace) throw new HttpError(404, 'WORKSPACE_NOT_FOUND', 'That workspace is unavailable')

      // Claimed already? Say so before calling Railway, so a duplicate never
      // creates a domain there that this database will refuse to record.
      const { data: existing } = await admin
        .from('workspace_domains')
        .select('id,workspace_id')
        .eq('hostname', hostname)
        .maybeSingle()
      if (existing) {
        throw new HttpError(
          409,
          'HOSTNAME_TAKEN',
          existing.workspace_id === workspaceId
            ? 'That hostname is already attached to this workspace'
            : 'That hostname is already attached to another workspace',
        )
      }

      const provider = providerForNewDomains()
      const created = await createProviderDomain(provider, hostname)
      const { data: inserted, error: insertError } = await admin
        .from('workspace_domains')
        .insert({
          workspace_id: workspaceId,
          hostname,
          status: 'awaiting_dns',
          // Recorded, because it decides which API refreshes and removes this
          // row for the rest of its life.
          provider,
          provider_domain_id: created.id,
          dns_record_type: created.dnsRecordType,
          dns_record_name: created.dnsRecordName,
          dns_record_value: created.dnsRecordValue,
        })
        .select('id,hostname,status,dns_record_type,dns_record_name,dns_record_value')
        .maybeSingle()
      if (insertError || !inserted) {
        // The provider holds a domain this database will not serve. Hand it
        // back rather than leaving an orphan that blocks the hostname forever,
        // and hand it back to whichever provider took it.
        await deleteProviderDomain(provider, created.id).catch(() => undefined)
        throw new HttpError(500, 'DOMAIN_ADD_FAILED', 'The domain could not be recorded')
      }

      await writeAudit(admin, {
        workspaceId,
        actorUserId: user.id,
        action: 'workspace.domain.added',
        entityType: 'workspace_domain',
        entityId: inserted.id,
        metadata: { hostname },
      })
      return jsonResponse(req, METHODS, 200, { success: true, domain: inserted })
    }

    if (action === 'refresh') {
      requireOnlyKeys(body, ['action', 'domain_id'])
      const domainId = requireUuid(body.domain_id, 'domain_id')
      const { data: domain, error: domainError } = await admin
        .from('workspace_domains')
        .select('id,workspace_id,hostname,status,provider,provider_domain_id,consecutive_failures,activated_at,first_activated_at')
        .eq('id', domainId)
        .maybeSingle()
      if (domainError) throw new HttpError(500, 'DOMAIN_REFRESH_FAILED', 'The domain could not be read')
      if (!domain || !domain.provider_domain_id) {
        throw new HttpError(404, 'DOMAIN_NOT_FOUND', 'That domain is unavailable')
      }
      if (domain.status === 'disabled') {
        throw new HttpError(409, 'DOMAIN_DISABLED', 'That domain is disabled')
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
       * answered mid-check — stripped is_primary, and every client link
       * generated before the next check carried the platform's address rather
       * than the agency's. A live domain now needs the failure corroborated by
       * a second consecutive reading before it is given up on, which at one
       * check a minute costs a minute of staleness and buys not lying to an
       * agency's clients about where their dashboards live.
       */
      const previousFailures = Number(domain.consecutive_failures ?? 0)
      const failures = reading === 'active' ? 0 : previousFailures + 1
      const heldOver = reading !== 'active' && domain.status === 'active' && failures < 2
      const nextStatus = heldOver ? 'active' : reading
      const serving = nextStatus === 'active'
      // A workspace's first domain to come alive becomes the one links use.
      // Setting primary was a separate click that existed for exactly one
      // reason — a second domain must not steal links from a working first —
      // so it stays manual only when a primary already exists.
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
        promoted = !existingPrimary || existingPrimary.id === domainId
      }
      const wasPrimaryBefore = Boolean(
        (await admin.from('workspace_domains').select('is_primary').eq('id', domainId).maybeSingle()).data?.is_primary,
      )
      const applyUpdate = (primary: boolean) => admin
        .from('workspace_domains')
        .update({
          status: nextStatus,
          // The constraint pairs these: active carries a date, everything else
          // carries none, so the row can never claim to serve without one.
          // Kept rather than re-minted while it stays active, or every check
          // would reset how long the domain has been up.
          activated_at: serving ? (domain.activated_at ?? new Date().toISOString()) : null,
          // Never cleared, because activated_at cannot survive a dip and
          // "serving since" is a real question after one.
          first_activated_at: serving
            ? (domain.first_activated_at ?? domain.activated_at ?? new Date().toISOString())
            : (domain.first_activated_at ?? null),
          consecutive_failures: failures,
          last_checked_at: new Date().toISOString(),
          // A held-over domain is still serving, but the reason it might stop
          // is worth keeping where support can see it.
          last_error: reading === 'active' ? null : servingError,
          is_primary: primary,
        })
        .eq('id', domainId)
      let { error: updateError } = await applyUpdate(promoted)
      // The read-then-promote is a race two concurrent checks can both win —
      // the once-a-minute poll plus a manual Check makes that ordinary, not
      // exotic. The unique index is the referee: when it refuses the second
      // promotion, the correct outcome is the same update without the crown,
      // not a 500 that also leaves the row stuck on its old status.
      if (updateError && promoted && updateError.code === '23505') {
        promoted = false
        ;({ error: updateError } = await applyUpdate(false))
      }
      if (updateError) throw new HttpError(500, 'DOMAIN_REFRESH_FAILED', 'The domain could not be updated')

      // Automatic changes to which domain links use must be findable later.
      // The manual set_primary click writes an audit entry; a silent flip from
      // a background check is exactly the kind an admin needs to reconstruct.
      if (promoted && !wasPrimaryBefore) {
        await writeAudit(admin, {
          workspaceId: domain.workspace_id,
          actorUserId: user.id,
          action: 'workspace.domain.primary_set',
          entityType: 'workspace_domain',
          entityId: domainId,
          metadata: { hostname: domain.hostname, via: 'refresh_auto_promote' },
        })
      } else if (wasPrimaryBefore && !promoted) {
        // Any way the crown comes off, not just going dark: losing the
        // promotion race while still serving takes it off too, and that is
        // the least visible of the two.
        await writeAudit(admin, {
          workspaceId: domain.workspace_id,
          actorUserId: user.id,
          action: 'workspace.domain.primary_lost',
          entityType: 'workspace_domain',
          entityId: domainId,
          metadata: {
            hostname: domain.hostname,
            reason: serving ? 'another domain is primary' : (servingError ?? 'not serving'),
          },
        })
      }

      return jsonResponse(req, METHODS, 200, { success: true, status: nextStatus, promoted })
    }

    if (action === 'set_primary') {
      requireOnlyKeys(body, ['action', 'domain_id'])
      const domainId = requireUuid(body.domain_id, 'domain_id')
      const { data: domain } = await admin
        .from('workspace_domains')
        .select('id,workspace_id,hostname,status')
        .eq('id', domainId)
        .maybeSingle()
      if (!domain) throw new HttpError(404, 'DOMAIN_NOT_FOUND', 'That domain is unavailable')
      if (domain.status !== 'active') {
        throw new HttpError(409, 'DOMAIN_NOT_SERVING', 'A domain must be serving before it can be the primary one')
      }
      // Clear first: the partial unique index allows exactly one primary per
      // workspace, so setting before clearing would collide with itself.
      await admin
        .from('workspace_domains')
        .update({ is_primary: false })
        .eq('workspace_id', domain.workspace_id)
        .eq('is_primary', true)
      const { error: primaryError } = await admin
        .from('workspace_domains')
        .update({ is_primary: true })
        .eq('id', domainId)
      if (primaryError) throw new HttpError(500, 'DOMAIN_PRIMARY_FAILED', 'The primary domain could not be set')

      await writeAudit(admin, {
        workspaceId: domain.workspace_id,
        actorUserId: user.id,
        action: 'workspace.domain.primary_set',
        entityType: 'workspace_domain',
        entityId: domainId,
        metadata: { hostname: domain.hostname },
      })
      return jsonResponse(req, METHODS, 200, { success: true })
    }

    requireOnlyKeys(body, ['action', 'domain_id'])
    if (action !== 'remove') {
      throw new HttpError(400, 'UNKNOWN_ACTION', 'That action is not supported')
    }
    const domainId = requireUuid(body.domain_id, 'domain_id')
    const { data: domain } = await admin
      .from('workspace_domains')
      .select('id,workspace_id,hostname,provider,provider_domain_id')
      .eq('id', domainId)
      .maybeSingle()
    if (!domain) throw new HttpError(404, 'DOMAIN_NOT_FOUND', 'That domain is unavailable')

    if (domain.provider_domain_id) {
      await deleteProviderDomain(providerOfRow(domain.provider), domain.provider_domain_id)
    }
    const { error: deleteError } = await admin
      .from('workspace_domains')
      .delete()
      .eq('id', domainId)
    if (deleteError) throw new HttpError(500, 'DOMAIN_REMOVE_FAILED', 'The domain could not be removed')

    await writeAudit(admin, {
      workspaceId: domain.workspace_id,
      actorUserId: user.id,
      action: 'workspace.domain.removed',
      entityType: 'workspace_domain',
      entityId: domainId,
      metadata: { hostname: domain.hostname },
    })
    return jsonResponse(req, METHODS, 200, { success: true })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
