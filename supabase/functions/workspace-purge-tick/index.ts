import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { createAdminClient, writeAudit } from '../_shared/workspaceAuth.ts'
import { timingSafeEqual } from '../_shared/stripeSignature.ts'

/**
 * Finish the deletions whose thirty days are up.
 *
 * workspace-deletion marks a workspace and settles everything outside this
 * database; this is the half that runs later, when the recovery window closes.
 * Splitting them is the point — the destructive step is the one nobody presses,
 * so it has to be the one that happens on a schedule rather than in a request.
 *
 * Two things make this safe to run every day:
 *
 *   * It decides nothing. Which workspaces are due is a date on the row,
 *     written when the deletion was requested. A tick that ran twice, or ran
 *     late, purges exactly the same set.
 *   * The Auth users go first. The workspace row cascades across every tenant
 *     table, and the membership rows carrying user ids go with it — so the
 *     RPC hands them back before deleting, and this removes the logins before
 *     they become unreachable. Get that order wrong and you leave accounts
 *     that can sign in to a tenant that no longer exists.
 *
 * A login that will not delete is reported and does not stop the batch: the
 * tenant data is the thing with a promise attached, and one stuck Auth user
 * must not hold thirty days of expired deletions open behind it.
 */
const MAX_PER_TICK = 25

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

interface PurgedWorkspace {
  workspace_id: string
  workspace_name: string
  member_user_ids: string[] | null
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  const secret = Deno.env.get('WORKSPACE_PURGE_SECRET')?.trim()
  const presented = req.headers.get('x-purge-secret')
  if (!secret || !presented || !timingSafeEqual(presented, secret)) {
    return json(401, { error: 'Unauthorized' })
  }

  const admin = createAdminClient()

  /*
   * The members come back from the same statement that deletes the workspace,
   * because after it there is nowhere left to read them from. If this function
   * dies between the RPC returning and the loop below, the tenant data is gone
   * and the logins are orphaned — recoverable by hand from the audit line, and
   * the alternative (delete the users first, then fail before the RPC) locks
   * people out of a workspace that still exists, which is worse.
   */
  const { data, error } = await admin.rpc('purge_expired_workspaces_v1', {
    p_limit: MAX_PER_TICK,
  })

  if (error) {
    console.error('[Workspace Purge] The purge could not run')
    return json(503, { error: 'Purge unavailable' })
  }

  const purged = (data ?? []) as PurgedWorkspace[]
  const strandedLogins: string[] = []

  for (const workspace of purged) {
    // Scoped to this workspace: the batch-wide list would put another
    // workspace's failures in this one's audit line and read as its own.
    const stranded: string[] = []
    for (const userId of workspace.member_user_ids ?? []) {
      const { error: authError } = await admin.auth.admin.deleteUser(userId)
      // "not found" is the state this is trying to reach.
      if (authError && !(authError.message ?? '').toLowerCase().includes('not found')) {
        stranded.push(userId)
        strandedLogins.push(userId)
      }
    }

    /*
     * Audited without a workspace id, deliberately: the row it would reference
     * no longer exists, and the audit table is the only place this deletion is
     * still recorded. The name is kept because an id alone answers no question
     * anyone will actually ask about a workspace that is gone.
     */
    await writeAudit(admin, {
      workspaceId: null,
      // No person did this; the schedule did. The existing ticks spell it the
      // same way, because the column is not nullable in the type.
      actorUserId: null as unknown as string,
      action: 'workspace.purged',
      entityType: 'workspace',
      entityId: workspace.workspace_id,
      metadata: {
        name: workspace.workspace_name,
        members_removed: (workspace.member_user_ids ?? []).length,
        stranded_logins: stranded,
      },
    })
  }

  return json(200, {
    purged: purged.length,
    stranded_logins: strandedLogins.length,
  })
})
