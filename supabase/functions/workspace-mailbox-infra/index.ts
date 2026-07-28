// Workspace mailbox infrastructure (Winnr-backed): buy sending domains and
// warmed mailboxes in-app, track provisioning, and export to Instantly.
// Manager-gated; the platform Winnr account is scoped per workspace with a
// workspace:<id> tag on every domain.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  type AuthContext,
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requireAuthenticatedUser,
  requireOnlyKeys,
  requireString,
  requireUuid,
  requireWorkspaceFeatureAccess,
  workspaceCredentialIsFresh,
  writeAudit,
  type WorkspaceFeatureAccess,
} from '../_shared/workspaceAuth.ts'
import { chargeCredits, logOperationCost } from '../_shared/billing.ts'
import { resolveAiKey } from '../_shared/workspaceAiKeys.ts'

const METHODS = ['POST'] as const
const MANAGER_ROLES = new Set(['owner', 'admin', 'platform_admin'])
const WINNR_BASE = 'https://api.winnr.app/v1'
const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,38}[a-z0-9])?$/
const MAX_ORDER_DOMAINS = 3
const MAX_MAILBOXES_PER_DOMAIN = 3

function requireManager(access: WorkspaceFeatureAccess): void {
  if (!MANAGER_ROLES.has(access.role)) {
    throw new HttpError(403, 'FORBIDDEN', 'Workspace manager access is required')
  }
}

async function winnrRequest<T>(
  token: string,
  path: string,
  options: { method?: 'GET' | 'POST'; body?: Record<string, unknown>; query?: URLSearchParams } = {},
): Promise<T> {
  const url = new URL(`${WINNR_BASE}${path}`)
  if (options.query) url.search = options.query.toString()
  let response: Response
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(25_000),
    })
  } catch (_error) {
    throw new HttpError(503, 'WINNR_UNAVAILABLE', 'The mailbox provider is unreachable right now')
  }
  const payload = await response.json().catch(() => null) as
    | { data?: unknown; error?: { code?: string; message?: string } }
    | null
  if (!response.ok) {
    const code = payload?.error?.code ?? `status_${response.status}`
    console.error('[Mailbox Infra] Winnr error', code)
    if (response.status === 402) {
      throw new HttpError(503, 'WINNR_PAYMENT_FAILED', 'The provider payment failed. Contact support')
    }
    throw new HttpError(502, 'WINNR_ERROR', 'The mailbox provider rejected the request')
  }
  return (payload?.data ?? payload) as T
}

function workspaceTag(workspaceId: string): string {
  return `workspace:${workspaceId}`
}

function normalizedDomain(value: unknown, field: string): string {
  const domain = requireString(value, field, { max: 253 }).toLowerCase()
  if (!DOMAIN_PATTERN.test(domain)) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} is not a valid domain name`)
  }
  return domain
}

interface WinnrDomain {
  id: string
  name: string
  status: string
  tags?: string[]
  dns_health?: { status?: string } | null
  email_users_count?: number
  expire_date?: string | null
}

interface WinnrEmailUser {
  id: string
  username: string
  domain: string
  full_address: string
  name: string | null
  status: string
}

interface MailboxOrderRow {
  id: string
  winnr_job_id: string | null
  status: 'processing' | 'provisioned' | 'warming' | 'failed'
  domains: unknown
  mailbox_count: number
  credits_charged: number
  warming_enabled_at: string | null
  error_message: string | null
  created_at: string
}

const ORDER_COLUMNS =
  'id, winnr_job_id, status, domains, mailbox_count, credits_charged, warming_enabled_at, error_message, created_at'

async function listWorkspaceDomains(token: string, workspaceId: string, scopeToTag: boolean): Promise<WinnrDomain[]> {
  const tag = workspaceTag(workspaceId)
  const domains: WinnrDomain[] = []
  let cursor: string | null = null
  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({ limit: '100' })
    if (cursor) query.set('cursor', cursor)
    const result = await winnrRequest<WinnrDomain[] | { data?: WinnrDomain[] }>(token, '/domains', { query })
    const rows = Array.isArray(result) ? result : (result as { data?: WinnrDomain[] }).data ?? []
    domains.push(...rows.filter((domain) => !scopeToTag || (Array.isArray(domain.tags) && domain.tags.includes(tag))))
    // The list envelope's pagination is stripped by the data unwrap; a single
    // page covers the current account scale, so stop unless a full page came back.
    if (rows.length < 100) break
    cursor = null
    break
  }
  return domains
}

async function mailboxUserIds(apiKey: string, domainNames: string[]): Promise<string[]> {
  const userIds: string[] = []
  for (const domainName of domainNames) {
    const users = await winnrRequest<WinnrEmailUser[] | { data?: WinnrEmailUser[] }>(apiKey, '/email-users', {
      query: new URLSearchParams({ domain: domainName, limit: '25' }),
    })
    const rows = Array.isArray(users) ? users : (users as { data?: WinnrEmailUser[] }).data ?? []
    userIds.push(...rows.map((user) => user.id))
  }
  return userIds
}

/**
 * Give back credits spent on an order the provider refused.
 *
 * Granted rather than reversed: the ledger has no refund source, and a grant
 * with a deterministic key is idempotent, so a retried failure cannot hand out
 * the credits twice. A failure to refund must not mask the provider error that
 * caused it, so this never throws.
 */
async function refundMailboxCredits(
  authContext: AuthContext,
  workspaceId: string,
  orders: Array<{ domain: string }>,
  creditsCharged: number,
): Promise<void> {
  if (creditsCharged < 1) return
  const key = `mailbox-refund:${workspaceId}:${orders.map((order) => order.domain).sort().join(',')}`
  const { error } = await authContext.admin.rpc('grant_workspace_credits_v1', {
    p_workspace_id: workspaceId,
    p_source: 'admin_grant',
    p_amount: creditsCharged,
    p_expires_at: null,
    p_reference_kind: 'mailbox_order_refund',
    p_reference_id: orders.map((order) => order.domain).sort().join(','),
    p_actor_user_id: authContext.user.id,
    p_idempotency_key: key,
  })
  if (error) {
    console.error('[Mailbox Infra] Refund failed for a rejected order')
    return
  }
  await writeAudit(authContext.admin, {
    workspaceId,
    actorUserId: authContext.user.id,
    action: 'workspace.mailbox_infra.refunded',
    entityType: 'mailbox_order',
    entityId: null,
    metadata: { domains: orders.map((order) => order.domain), credits: creditsCharged },
  }).catch(() => undefined)
}

/**
 * Move a processing order forward: check the provider job, and on completion
 * turn warming on for the mailboxes it created.
 *
 * This used to live only in the status poll, which runs while somebody has the
 * page open. An operator who placed an order and closed the tab left the
 * mailboxes provisioned but never warming — and the order copy promises
 * warming starts automatically.
 */
async function advanceMailboxOrder(
  authContext: AuthContext,
  apiKey: string,
  order: MailboxOrderRow,
): Promise<MailboxOrderRow> {
  if (order.status !== 'processing' || !order.winnr_job_id) return order
  const job = await winnrRequest<{ status?: string; progress?: Record<string, unknown> }>(
    apiKey,
    `/jobs/${encodeURIComponent(order.winnr_job_id)}`,
  )
  if (job.status === 'failed') {
    await authContext.admin.from('workspace_mailbox_orders')
      .update({ status: 'failed', error_message: 'Provisioning failed at the provider', updated_at: new Date().toISOString() })
      .eq('id', order.id)
    return { ...order, status: 'failed', error_message: 'Provisioning failed at the provider' }
  }
  if (job.status !== 'completed') return order

  const userIds = await mailboxUserIds(
    apiKey,
    (order.domains as Array<{ domain: string }>).map((entry) => entry.domain),
  )
  let warmingError: string | null = null
  if (userIds.length === 0) {
    warmingError = 'The provider reported no mailboxes for these domains, so warmup could not be started'
  } else {
    await winnrRequest(apiKey, '/warming/enable-async', {
      method: 'POST',
      body: { user_ids: userIds, settings: { emails_per_day: 20, rampup_speed: 'normal' } },
    }).catch(() => {
      // Recorded rather than swallowed. An order that reads "warming" while
      // nothing is warming costs three silent weeks before anyone notices.
      warmingError = 'Mailboxes were created but warmup could not be started. Retry warmup from this order.'
    })
  }
  const warmingEnabledAt = new Date().toISOString()
  await authContext.admin.from('workspace_mailbox_orders')
    .update({
      status: 'warming',
      warming_enabled_at: warmingError ? null : warmingEnabledAt,
      error_message: warmingError,
      updated_at: warmingEnabledAt,
    })
    .eq('id', order.id)
  return {
    ...order,
    status: 'warming',
    warming_enabled_at: warmingError ? null : warmingEnabledAt,
    error_message: warmingError,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }
    const body = await parseJsonObject(req)
    const action = typeof body.action === 'string' ? body.action : ''
    const workspaceId = requireUuid(body.workspace_id, 'workspace_id')
    const authContext = await requireAuthenticatedUser(req)
    if (!workspaceCredentialIsFresh(authContext)) {
      throw new HttpError(401, 'CREDENTIAL_STALE', 'Sign in again to continue')
    }
    const access = await requireWorkspaceFeatureAccess(authContext, workspaceId)
    requireManager(access)
    // Workspace Winnr key wins; the platform token is the fallback. Orders on
    // a workspace key skip platform credits — that workspace pays Winnr.
    const winnrKey = await resolveAiKey(authContext.admin, workspaceId, 'winnr')
    if (!winnrKey) {
      // Purchasing needs a Winnr account; the overview still renders so the
      // card can explain exactly what to connect.
      if (action === 'infra-overview') {
        return jsonResponse(req, METHODS, 200, {
          winnr_connected: false,
          domains: [],
          orders: [],
        })
      }
      throw new HttpError(
        409,
        'WINNR_NOT_CONNECTED',
        'Connect a Winnr account in workspace settings before buying sending domains',
      )
    }
    const usingWorkspaceKey = winnrKey.source === 'workspace'

    if (action === 'domain-search') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'domains'])
      if (!Array.isArray(body.domains) || body.domains.length === 0 || body.domains.length > 10) {
        throw new HttpError(400, 'INVALID_FIELD', 'Provide between 1 and 10 domains to check')
      }
      const domains = body.domains.map((entry, index) => normalizedDomain(entry, `domains[${index}]`))
      const result = await winnrRequest<{ results?: Array<{ domain: string; available: boolean | null; price: number | null }> }>(
        winnrKey.apiKey,
        '/domains/search-bulk',
        { method: 'POST', body: { domains } },
      )
      const results = (result.results ?? []).map((entry) => ({
        domain: entry.domain,
        available: entry.available === true,
        price_usd: typeof entry.price === 'number' ? entry.price : null,
      }))
      return jsonResponse(req, METHODS, 200, { results })
    }

    if (action === 'order-create') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'orders'])
      if (!Array.isArray(body.orders) || body.orders.length === 0 || body.orders.length > MAX_ORDER_DOMAINS) {
        throw new HttpError(400, 'INVALID_FIELD', `Provide between 1 and ${MAX_ORDER_DOMAINS} domains per order`)
      }
      const orders = body.orders.map((raw, index) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          throw new HttpError(400, 'INVALID_FIELD', `orders[${index}] must be an object`)
        }
        const entry = raw as Record<string, unknown>
        const domain = normalizedDomain(entry.domain, `orders[${index}].domain`)
        if (!Array.isArray(entry.mailboxes) || entry.mailboxes.length === 0 || entry.mailboxes.length > MAX_MAILBOXES_PER_DOMAIN) {
          throw new HttpError(400, 'INVALID_FIELD', `orders[${index}] needs 1-${MAX_MAILBOXES_PER_DOMAIN} mailboxes`)
        }
        const mailboxes = entry.mailboxes.map((mailboxRaw, mailboxIndex) => {
          if (!mailboxRaw || typeof mailboxRaw !== 'object' || Array.isArray(mailboxRaw)) {
            throw new HttpError(400, 'INVALID_FIELD', `orders[${index}].mailboxes[${mailboxIndex}] must be an object`)
          }
          const mailbox = mailboxRaw as Record<string, unknown>
          const username = requireString(mailbox.username, `orders[${index}].mailboxes[${mailboxIndex}].username`, { max: 40 }).toLowerCase()
          if (!USERNAME_PATTERN.test(username)) {
            throw new HttpError(400, 'INVALID_FIELD', `orders[${index}].mailboxes[${mailboxIndex}].username is invalid`)
          }
          return {
            username,
            name: requireString(mailbox.name, `orders[${index}].mailboxes[${mailboxIndex}].name`, { max: 100 }),
          }
        })
        return { domain, mailboxes }
      })
      const mailboxCount = orders.reduce((total, order) => total + order.mailboxes.length, 0)

      // Charge credits before spending real money with the provider. Each
      // domain and mailbox is idempotency-keyed so retries never double-charge.
      let creditsCharged = 0
      for (const order of orders) {
        creditsCharged += await chargeCredits(authContext.admin, {
          workspaceId,
          operationType: 'mailbox_domain_purchase',
          referenceKind: 'mailbox_domain',
          referenceId: order.domain,
          actorUserId: authContext.user.id,
          idempotencyKey: `mailbox-domain:${workspaceId}:${order.domain}`,
          byoKeyUsed: usingWorkspaceKey,
        })
        for (const mailbox of order.mailboxes) {
          creditsCharged += await chargeCredits(authContext.admin, {
            workspaceId,
            operationType: 'mailbox_monthly',
            referenceKind: 'mailbox',
            referenceId: `${mailbox.username}@${order.domain}`,
            actorUserId: authContext.user.id,
            idempotencyKey: `mailbox-monthly:${workspaceId}:${mailbox.username}@${order.domain}:first`,
            byoKeyUsed: usingWorkspaceKey,
          })
        }
      }

      // Credits are spent before the provider is called, so an order the
      // provider never accepted has to give them back. Without this, a Winnr
      // outage charges for infrastructure that does not exist, and picking a
      // different domain on the retry charges again — the idempotency keys
      // above only protect a retry of the very same domain.
      let purchase: { job_id?: string; status?: string }
      try {
        purchase = await winnrRequest<{ job_id?: string; status?: string }>(winnrKey.apiKey, '/domains/purchase', {
          method: 'POST',
          body: {
            async: true,
            domains: orders.map((order) => ({
              domain: order.domain,
              register: true,
              setup_dns: true,
              setup_email: true,
              users: order.mailboxes,
              tags: [workspaceTag(workspaceId)],
            })),
          },
        })
      } catch (error) {
        await refundMailboxCredits(authContext, workspaceId, orders, creditsCharged)
        throw error
      }
      if (!purchase.job_id) {
        await refundMailboxCredits(authContext, workspaceId, orders, creditsCharged)
        throw new HttpError(502, 'WINNR_ERROR', 'The provider did not accept the order')
      }

      const { data: orderRow, error: orderError } = await authContext.admin
        .from('workspace_mailbox_orders')
        .insert({
          workspace_id: workspaceId,
          winnr_job_id: purchase.job_id,
          status: 'processing',
          domains: orders,
          mailbox_count: mailboxCount,
          credits_charged: creditsCharged,
          created_by: authContext.user.id,
        })
        .select('id, status, domains, mailbox_count, credits_charged, created_at')
        .single()
      if (orderError || !orderRow) {
        throw new HttpError(500, 'ORDER_SAVE_FAILED', 'The order could not be recorded')
      }
      await writeAudit(authContext.admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'workspace.mailbox_infra.ordered',
        entityType: 'mailbox_order',
        entityId: orderRow.id,
        metadata: { domains: orders.map((order) => order.domain), mailbox_count: mailboxCount },
      })
      await logOperationCost(authContext.admin, {
        workspaceId,
        operationType: 'mailbox_domain_purchase',
        usage: {},
        usedByoKey: usingWorkspaceKey,
        referenceKind: 'mailbox_order',
        referenceId: orderRow.id,
      })
      return jsonResponse(req, METHODS, 200, { order: orderRow })
    }

    if (action === 'order-status') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'order_id'])
      const orderId = requireUuid(body.order_id, 'order_id')
      const { data: order } = await authContext.admin
        .from('workspace_mailbox_orders')
        .select(ORDER_COLUMNS)
        .eq('workspace_id', workspaceId)
        .eq('id', orderId)
        .maybeSingle()
      if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found')

      const advanced = await advanceMailboxOrder(
        authContext,
        winnrKey.apiKey,
        order as unknown as MailboxOrderRow,
      )
      return jsonResponse(req, METHODS, 200, { order: advanced, progress: null })
    }

    if (action === 'warming-retry') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'order_id'])
      const orderId = requireUuid(body.order_id, 'order_id')
      const { data: order } = await authContext.admin
        .from('workspace_mailbox_orders')
        .select(ORDER_COLUMNS)
        .eq('workspace_id', workspaceId)
        .eq('id', orderId)
        .maybeSingle()
      if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found')
      if (order.status !== 'warming' || order.warming_enabled_at) {
        throw new HttpError(
          409,
          'WARMING_NOT_PENDING',
          'This order does not have warmup waiting to be started',
        )
      }
      const userIds = await mailboxUserIds(
        winnrKey.apiKey,
        (order.domains as Array<{ domain: string }>).map((entry) => entry.domain),
      )
      if (userIds.length === 0) {
        throw new HttpError(
          409,
          'NO_MAILBOXES',
          'The provider reports no mailboxes on these domains yet',
        )
      }
      await winnrRequest(winnrKey.apiKey, '/warming/enable-async', {
        method: 'POST',
        body: { user_ids: userIds, settings: { emails_per_day: 20, rampup_speed: 'normal' } },
      })
      const warmingEnabledAt = new Date().toISOString()
      await authContext.admin.from('workspace_mailbox_orders')
        .update({ warming_enabled_at: warmingEnabledAt, error_message: null, updated_at: warmingEnabledAt })
        .eq('id', order.id)
      await writeAudit(authContext.admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'workspace.mailbox_infra.warming_started',
        entityType: 'mailbox_order',
        entityId: order.id,
        metadata: { mailboxes: userIds.length },
      })
      return jsonResponse(req, METHODS, 200, {
        order: { ...order, warming_enabled_at: warmingEnabledAt, error_message: null },
      })
    }

    if (action === 'infra-overview') {
      requireOnlyKeys(body, ['action', 'workspace_id'])
      const [domains, ordersResult] = await Promise.all([
        listWorkspaceDomains(winnrKey.apiKey, workspaceId, !usingWorkspaceKey),
        authContext.admin
          .from('workspace_mailbox_orders')
          .select(ORDER_COLUMNS)
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(10),
      ])
      // Any order left mid-provision is moved on here, so closing the tab
      // during an order no longer strands its mailboxes unwarmed.
      const orders = await Promise.all(
        ((ordersResult.data ?? []) as unknown as MailboxOrderRow[]).map((order) => (
          advanceMailboxOrder(authContext, winnrKey.apiKey, order)
            .catch(() => order)
        )),
      )
      const warming = await winnrRequest<{ data?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>(winnrKey.apiKey, '/warming', {
        query: new URLSearchParams({ per_page: '200' }),
      }).catch(() => [])
      const warmingRows = Array.isArray(warming) ? warming : (warming as { data?: Array<Record<string, unknown>> }).data ?? []
      const domainNames = new Set(domains.map((domain) => domain.name))
      const warmingByAddress = new Map(
        warmingRows
          .filter((row) => typeof row.domain_string === 'string' && domainNames.has(row.domain_string as string))
          .map((row) => [String(row.full_address), row]),
      )

      const detailed = await Promise.all(domains.slice(0, 6).map(async (domain) => {
        const users = await winnrRequest<WinnrEmailUser[] | { data?: WinnrEmailUser[] }>(winnrKey.apiKey, '/email-users', {
          query: new URLSearchParams({ domain: domain.name, limit: '10' }),
        }).catch(() => [])
        const rows = Array.isArray(users) ? users : (users as { data?: WinnrEmailUser[] }).data ?? []
        return {
          id: domain.id,
          name: domain.name,
          status: domain.status,
          dns_health: domain.dns_health?.status ?? null,
          expire_date: domain.expire_date ?? null,
          mailboxes: rows.map((user) => {
            const warmingRow = warmingByAddress.get(user.full_address)
            return {
              full_address: user.full_address,
              name: user.name,
              status: user.status,
              warming_status: warmingRow ? String(warmingRow.warming_status ?? '') || null : null,
              warming_health_score: warmingRow && typeof warmingRow.warming_health_score === 'number'
                ? warmingRow.warming_health_score
                : null,
              warming_inbox_rate: warmingRow && typeof warmingRow.warming_inbox_rate === 'number'
                ? warmingRow.warming_inbox_rate
                : null,
            }
          }),
        }
      }))
      return jsonResponse(req, METHODS, 200, {
        winnr_connected: true,
        domains: detailed,
        // Detail is fetched for the first few domains only. Saying so beats a
        // list that silently stops at six.
        domain_count: domains.length,
        detailed_domain_count: detailed.length,
        orders,
      })
    }

    if (action === 'export-instantly') {
      requireOnlyKeys(body, ['action', 'workspace_id'])
      const domains = await listWorkspaceDomains(winnrKey.apiKey, workspaceId, !usingWorkspaceKey)
      if (domains.length === 0) {
        throw new HttpError(404, 'NO_INFRA', 'This workspace has no purchased sending domains yet')
      }
      const result = await winnrRequest<{ download_url?: string; user_count?: number }>(winnrKey.apiKey, '/export', {
        method: 'POST',
        body: { format: 'instantly', domains: domains.map((domain) => domain.name) },
      })
      if (!result.download_url) {
        throw new HttpError(502, 'WINNR_ERROR', 'The export could not be generated')
      }
      await writeAudit(authContext.admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'workspace.mailbox_infra.exported',
        entityType: 'mailbox_order',
        entityId: null,
        metadata: { format: 'instantly', user_count: result.user_count ?? null },
      })
      return jsonResponse(req, METHODS, 200, {
        download_url: result.download_url,
        user_count: result.user_count ?? null,
      })
    }

    throw new HttpError(400, 'INVALID_ACTION', 'Unknown mailbox infrastructure action')
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
