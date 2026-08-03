import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { HttpError } from '../_shared/httpError.ts'
import { decryptInstantlyApiKey, instantlyRequest } from '../_shared/instantly.ts'
import { deleteProviderDomain, providerOfRow } from '../_shared/domainProviders.ts'
import {
  createAdminClient,
  errorResponse,
  jsonResponse,
  optionalString,
  optionsResponse,
  parseJsonObject,
  requireAuthenticatedUser,
  requireOnlyKeys,
  requireUuid,
  writeAudit,
} from '../_shared/workspaceAuth.ts'

const METHODS = ['POST', 'OPTIONS'] as const

/**
 * Delete a workspace, and undo it while there is still time.
 *
 * The order here is the whole function. A workspace holds state in four places
 * that this database cannot reach — a Stripe subscription, Instantly campaigns
 * mid-flight, domains provisioned at Railway or Cloudflare, and Auth users —
 * and every one of them is keyed by an id stored on the rows being deleted.
 * Settle them first or lose the ability to settle them at all.
 *
 * Not every failure weighs the same, so they are not all handled the same:
 *
 *   Stripe   — abort. Revoking access while the card keeps being charged is the
 *              worst outcome available, and it is the one nobody notices until
 *              the next statement.
 *   Instantly — abort. Campaigns left running send mail on behalf of a client
 *              who has left, from the customer's own mailboxes, with nothing in
 *              the product still showing it happening.
 *   Domains  — record and continue. A stranded custom domain costs a little
 *              money and serves a workspace that now refuses every request. It
 *              is worth a line in the audit, not a blocked deletion.
 *
 * Marking comes last, because it is the step that cannot be retried from the
 * outside once the identifiers are gone.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    const context = await requireAuthenticatedUser(req)
    const body = await parseJsonObject(req, 4_096)
    requireOnlyKeys(body, ['action', 'workspace_id', 'reason'])

    const action = body.action
    if (action !== 'delete' && action !== 'restore') {
      throw new HttpError(400, 'ACTION_INVALID', 'Unknown action')
    }

    const workspaceId = requireUuid(body.workspace_id, 'workspace_id')
    const admin = createAdminClient()

    const { data: workspace, error: workspaceError } = await admin
      .from('workspaces')
      .select('id,name,slug,status,is_default,purge_after')
      .eq('id', workspaceId)
      .maybeSingle()

    if (workspaceError) {
      throw new HttpError(500, 'WORKSPACE_LOOKUP_FAILED', 'The workspace could not be read')
    }
    if (!workspace) {
      throw new HttpError(404, 'WORKSPACE_NOT_FOUND', 'Workspace not found')
    }

    /*
     * Who may do this. An owner may close their own workspace; a platform admin
     * may close anyone's.
     *
     * Restoring is deliberately platform-admin only, and not because owners are
     * not trusted with it: marking a workspace deleted revokes their access in
     * the same statement, so by the time they want it back they cannot sign in
     * to ask. Someone on this side has to do it either way.
     */
    const platformAdmin = context.platformAdmin === true
    if (!platformAdmin) {
      if (action === 'restore') {
        throw new HttpError(
          403,
          'RESTORE_REQUIRES_PLATFORM_ADMIN',
          'Ask us to restore this workspace',
        )
      }

      const { data: membership, error: membershipError } = await admin
        .from('workspace_memberships')
        .select('id,role,status')
        .eq('workspace_id', workspaceId)
        .eq('user_id', context.user.id)
        .maybeSingle()

      if (membershipError) {
        throw new HttpError(500, 'MEMBERSHIP_LOOKUP_FAILED', 'Your access could not be read')
      }
      if (!membership || membership.status !== 'active' || membership.role !== 'owner') {
        throw new HttpError(403, 'OWNER_REQUIRED', 'Only the workspace owner can delete it')
      }
    }

    if (action === 'restore') {
      const { data: restored, error: restoreError } = await admin.rpc('restore_workspace_v1', {
        p_workspace_id: workspaceId,
        p_actor_user_id: context.user.id,
      })
      if (restoreError) {
        const message = (restoreError.message ?? '').toLowerCase()
        if (message.includes('recovery window')) {
          throw new HttpError(
            410,
            'RECOVERY_WINDOW_PASSED',
            'This workspace is past the point where it can be brought back',
          )
        }
        if (message.includes('only a deleted')) {
          throw new HttpError(409, 'WORKSPACE_NOT_DELETED', 'This workspace is not deleted')
        }
        throw new HttpError(500, 'RESTORE_FAILED', 'The workspace could not be restored')
      }

      await writeAudit(admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: 'workspace.restored',
        entityType: 'workspace',
        entityId: workspaceId,
        metadata: { name: workspace.name },
      })

      return jsonResponse(req, METHODS, 200, { workspace: restored })
    }

    if (workspace.is_default) {
      throw new HttpError(409, 'DEFAULT_WORKSPACE', 'The default workspace cannot be deleted')
    }
    if (workspace.status === 'deleted') {
      // Already on its way out. Saying so is friendlier than tearing down a
      // second time against ids that are already settled.
      return jsonResponse(req, METHODS, 200, { workspace, already_deleted: true })
    }

    const reason = optionalString(body.reason, 'reason', 500)

    // ---------------------------------------------------------------------
    // 1. Stripe. Abort on failure.
    // ---------------------------------------------------------------------
    const { data: billing } = await admin
      .from('workspace_billing_profiles')
      .select('stripe_subscription_id')
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    const subscriptionId = typeof billing?.stripe_subscription_id === 'string'
      ? billing.stripe_subscription_id.trim()
      : ''

    if (subscriptionId) {
      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')?.trim()
      if (!stripeKey) {
        throw new HttpError(
          503,
          'BILLING_UNAVAILABLE',
          'Billing is not configured, so the subscription cannot be ended. Nothing was deleted',
        )
      }

      // Cancels now rather than at period end: the workspace stops working the
      // moment this returns, so billing for the remainder would be for nothing.
      const cancelled = await fetch(
        `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${stripeKey}` } },
      ).catch(() => null)

      // A subscription Stripe no longer has is already in the state we want.
      if (!cancelled || (!cancelled.ok && cancelled.status !== 404)) {
        throw new HttpError(
          502,
          'SUBSCRIPTION_CANCEL_FAILED',
          'The subscription could not be ended, so nothing was deleted. Try again',
        )
      }
    }

    // ---------------------------------------------------------------------
    // 2. Instantly. Abort on failure.
    // ---------------------------------------------------------------------
    const { data: integration } = await admin
      .from('workspace_instantly_integrations')
      .select('api_key_ciphertext,api_key_iv')
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    let campaignsPaused = 0
    if (integration?.api_key_ciphertext && integration?.api_key_iv) {
      const { data: campaigns } = await admin
        .from('workspace_client_campaigns')
        .select('instantly_campaign_id')
        .eq('workspace_id', workspaceId)
        .not('instantly_campaign_id', 'is', null)

      const ids = (campaigns ?? [])
        .map((row) => row.instantly_campaign_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)

      if (ids.length > 0) {
        let apiKey: string
        try {
          apiKey = await decryptInstantlyApiKey({
            ciphertext: integration.api_key_ciphertext,
            iv: integration.api_key_iv,
          })
        } catch {
          throw new HttpError(
            502,
            'OUTREACH_STOP_FAILED',
            'Sending could not be stopped, so nothing was deleted. Contact us',
          )
        }

        for (const id of ids) {
          try {
            await instantlyRequest<unknown>(
              apiKey,
              `/campaigns/${encodeURIComponent(id)}/pause`,
              { method: 'POST' },
            )
            campaignsPaused += 1
          } catch {
            // One campaign left running is one client still being mailed on
            // behalf of an agency that has closed. That is not a partial
            // success, so it stops here with everything still intact.
            throw new HttpError(
              502,
              'OUTREACH_STOP_FAILED',
              'Sending could not be stopped for every campaign, so nothing was deleted. Try again',
            )
          }
        }
      }
    }

    // ---------------------------------------------------------------------
    // 3. Domains. Recorded, not fatal.
    // ---------------------------------------------------------------------
    const { data: domains } = await admin
      .from('workspace_domains')
      .select('id,hostname,provider,provider_domain_id')
      .eq('workspace_id', workspaceId)

    const strandedDomains: string[] = []
    for (const domain of domains ?? []) {
      if (typeof domain.provider_domain_id !== 'string' || !domain.provider_domain_id) continue
      try {
        await deleteProviderDomain(providerOfRow(domain.provider), domain.provider_domain_id)
      } catch {
        strandedDomains.push(String(domain.hostname ?? domain.id))
      }
    }

    // ---------------------------------------------------------------------
    // 4. Mark it. Access ends here.
    // ---------------------------------------------------------------------
    const { data: deleted, error: deleteError } = await admin.rpc('begin_workspace_deletion_v1', {
      p_workspace_id: workspaceId,
      p_actor_user_id: context.user.id,
      p_reason: reason ?? null,
    })
    if (deleteError) {
      throw new HttpError(500, 'DELETE_FAILED', 'The workspace could not be closed')
    }

    await writeAudit(admin, {
      workspaceId,
      actorUserId: context.user.id,
      action: 'workspace.deleted',
      entityType: 'workspace',
      entityId: workspaceId,
      metadata: {
        name: workspace.name,
        by_platform_admin: platformAdmin,
        subscription_cancelled: Boolean(subscriptionId),
        campaigns_paused: campaignsPaused,
        // Written down because nothing else will notice: these still exist at
        // the provider and still cost money.
        stranded_domains: strandedDomains,
        reason: reason ?? null,
      },
    })

    return jsonResponse(req, METHODS, 200, {
      workspace: deleted,
      campaigns_paused: campaignsPaused,
      stranded_domains: strandedDomains,
    })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
