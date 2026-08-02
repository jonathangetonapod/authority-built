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
  createProviderDomain,
  deleteProviderDomain,
  providerForNewDomains,
  providerOfRow,
} from '../_shared/domainProviders.ts'
import { checkDomain, DOMAIN_CHECK_COLUMNS } from '../_shared/domainCheck.ts'

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
const MAX_HOSTNAME_LENGTH = 253

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
        .select(DOMAIN_CHECK_COLUMNS)
        .eq('id', domainId)
        .maybeSingle()
      if (domainError) throw new HttpError(500, 'DOMAIN_REFRESH_FAILED', 'The domain could not be read')
      if (!domain || !domain.provider_domain_id) {
        throw new HttpError(404, 'DOMAIN_NOT_FOUND', 'That domain is unavailable')
      }
      if (domain.status === 'disabled') {
        throw new HttpError(409, 'DOMAIN_DISABLED', 'That domain is disabled')
      }

      const { status, promoted } = await checkDomain(admin, domain, user.id, writeAudit)
      return jsonResponse(req, METHODS, 200, { success: true, status, promoted })
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
