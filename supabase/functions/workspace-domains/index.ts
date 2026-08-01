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

async function railwayDomainServing(
  providerDomainId: string,
): Promise<{ serving: boolean; error: string | null }> {
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
  const domain = (data.customDomain ?? {}) as Record<string, unknown>
  const status = (domain.status ?? {}) as Record<string, unknown>
  const serving = status.certificateStatus === CERTIFICATE_VALID
  if (serving) return { serving: true, error: null }
  // Railway's own message says whether DNS is missing or the certificate is
  // still issuing. That is the difference between "wait" and "fix your DNS",
  // and guessing it here would be worse than saying nothing.
  const providerMessage = typeof status.certificateErrorMessage === 'string'
    ? status.certificateErrorMessage
    : null
  const record = trafficRecord(status.dnsRecords)
  const dnsPending = record?.status === 'DNS_RECORD_STATUS_REQUIRES_UPDATE'
  return {
    serving: false,
    error: providerMessage
      ?? (dnsPending
        ? 'The DNS record has not been created yet, or has not propagated'
        : 'Waiting for the certificate to be issued'),
  }
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
        .select('id,workspace_id,hostname,status,is_primary,dns_record_type,dns_record_name,dns_record_value,last_error,activated_at,created_at,workspace:workspaces(id,name,slug)')
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

      const created = await createRailwayDomain(hostname)
      const { data: inserted, error: insertError } = await admin
        .from('workspace_domains')
        .insert({
          workspace_id: workspaceId,
          hostname,
          status: 'awaiting_dns',
          provider: 'railway',
          provider_domain_id: created.id,
          dns_record_type: created.dnsRecordType ?? 'CNAME',
          dns_record_name: created.dnsRecordName ?? hostname,
          dns_record_value: created.dnsRecordValue,
        })
        .select('id,hostname,status,dns_record_type,dns_record_name,dns_record_value')
        .maybeSingle()
      if (insertError || !inserted) {
        // Railway holds a domain this database will not serve. Hand it back
        // rather than leaving an orphan that blocks the hostname forever.
        await deleteRailwayDomain(created.id).catch(() => undefined)
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
        .select('id,workspace_id,hostname,status,provider_domain_id')
        .eq('id', domainId)
        .maybeSingle()
      if (domainError) throw new HttpError(500, 'DOMAIN_REFRESH_FAILED', 'The domain could not be read')
      if (!domain || !domain.provider_domain_id) {
        throw new HttpError(404, 'DOMAIN_NOT_FOUND', 'That domain is unavailable')
      }
      if (domain.status === 'disabled') {
        throw new HttpError(409, 'DOMAIN_DISABLED', 'That domain is disabled')
      }

      const { serving, error: servingError } = await railwayDomainServing(domain.provider_domain_id)
      const nextStatus = serving ? 'active' : 'awaiting_dns'
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
          activated_at: serving ? new Date().toISOString() : null,
          last_checked_at: new Date().toISOString(),
          last_error: serving ? null : servingError,
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
      .select('id,workspace_id,hostname,provider_domain_id')
      .eq('id', domainId)
      .maybeSingle()
    if (!domain) throw new HttpError(404, 'DOMAIN_NOT_FOUND', 'That domain is unavailable')

    if (domain.provider_domain_id) await deleteRailwayDomain(domain.provider_domain_id)
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
