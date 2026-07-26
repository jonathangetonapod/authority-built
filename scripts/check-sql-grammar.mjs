import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { loadModule, parseSync } = require('libpg-query')
const root = fileURLToPath(new URL('..', import.meta.url))

const SQL_INPUTS = [
  'supabase/migrations/20260720000100_invite_only_workspace_core.sql',
  'supabase/migrations/20260720000200_invite_only_workspace_rls.sql',
  'supabase/migrations/20260720000300_client_portal_security.sql',
  'supabase/migrations/20260720000400_resend_webhook_idempotency.sql',
  'supabase/migrations/20260720000500_client_prospect_link_normalization.sql',
  'supabase/migrations/20260720000600_trigger_function_privileges.sql',
  'supabase/migrations/20260721000100_manual_workspace_accounts.sql',
  'supabase/migrations/20260721000200_workspace_guest_resources.sql',
  'supabase/migrations/20260722000100_subagency_workspace_foundation.sql',
  'supabase/migrations/20260722000200_platform_owner_workspace_management.sql',
  'supabase/migrations/20260722000300_workspace_staff_temporary_passwords.sql',
  'supabase/migrations/20260722000400_workspace_branding.sql',
  'supabase/migrations/20260722000500_workspace_onboarding.sql',
  'supabase/migrations/20260722000600_workspace_onboarding_white_label.sql',
  'supabase/migrations/20260723000100_workspace_onboarding_activity.sql',
  'supabase/migrations/20260723000200_workspace_onboarding_answer_approval.sql',
  'supabase/migrations/20260723000300_default_workspace_onboarding_parity.sql',
  'supabase/migrations/20260723000400_client_shortlist_editor.sql',
  'supabase/migrations/20260723000500_workspace_owner_password_management.sql',
  'supabase/migrations/20260723000600_fix_client_portal_password_management.sql',
  'supabase/migrations/20260723000700_workspace_client_branding.sql',
  'supabase/migrations/20260723000800_workspace_name_management.sql',
  'supabase/migrations/20260724000100_workspace_client_campaigns.sql',
  'supabase/migrations/20260724000200_client_dashboards_always_live.sql',
  'supabase/migrations/20260724000300_workspace_campaign_sequence_copy.sql',
  'supabase/migrations/20260724000400_workspace_client_profile_editing.sql',
  'supabase/migrations/20260725000100_workspace_prospect_studio_foundation.sql',
  'supabase/migrations/20260725000200_client_ai_sdr_profiles.sql',
  'supabase/migrations/20260725000300_global_podcast_catalog.sql',
  'supabase/migrations/20260725000400_fix_global_podcast_id_validation.sql',
  'supabase/migrations/20260725000500_fix_global_direct_contact_reuse.sql',
  'supabase/migrations/20260725000900_workspace_billing_core.sql',
  'supabase/migrations/20260725001000_workspace_billing_rpcs.sql',
  'supabase/migrations/20260726000100_unguessable_dashboard_slugs.sql',
  'supabase/migrations/20260726000200_client_portal_password_reset.sql',
  'supabase/migrations/20260726000300_metering_and_byo_keys.sql',
  'supabase/migrations/20260726000400_workspace_research_prompts.sql',
  'supabase/migrations/20260726000500_shortlist_research_pipeline.sql',
  'supabase/migrations/20260726000600_email_waterfall.sql',
  'supabase/migrations/20260726000700_client_autopilot.sql',
  'supabase/migrations/20260726000800_mailbox_infra.sql',
  'supabase/migrations/20260726000900_byo_winnr_keys.sql',
  'supabase/migrations/20260726001000_client_instantly_campaign_links.sql',
  'supabase/migrations/20260726001100_workspace_inbox_thread_state.sql',
  'supabase/migrations/20260726001200_inbox_nudge_scheduler.sql',
  'supabase/migrations/20260726001300_inbox_auto_enrollment.sql',
  'supabase/migrations/20260726001400_client_ai_sdr_prompts.sql',
  'supabase/migrations/20260726001500_client_added_calendar_events.sql',
  'supabase/migrations/20260727000100_booking_journey_links.sql',
  'supabase/migrations/20260727000200_campaign_sync_schedule.sql',
  'supabase/migrations/20260727000300_retire_legacy_reply_cron.sql',
  'supabase/tests/20260720_invite_only_workspace_verification.sql',
  'supabase/tests/20260721_workspace_guest_resources_behavior.sql',
  'supabase/tests/20260722_subagency_workspace_foundation_behavior.sql',
  'supabase/tests/20260722_workspace_onboarding_behavior.sql',
]

await loadModule()

const failures = []
for (const relativePath of SQL_INPUTS) {
  try {
    parseSync(readFileSync(path.join(root, relativePath), 'utf8'))
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n', 1)[0] : 'parse failed'
    failures.push(`${relativePath}: ${message}`)
  }
}

if (failures.length > 0) {
  process.stderr.write(`PostgreSQL grammar validation failed:\n${failures.join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`PostgreSQL grammar validation passed; files=${SQL_INPUTS.length}\n`)
}
