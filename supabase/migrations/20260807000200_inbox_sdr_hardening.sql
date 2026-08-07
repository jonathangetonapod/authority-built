-- Fair rotation for the auto-draft enrollment tick.
--
-- The tick serves at most three workspaces per run, ordered by
-- auto_draft_cursor_ts — but that cursor only moves when the provider
-- returns mail. A workspace with a quiet inbox, a revoked API key, or any
-- persistent error kept the oldest cursor forever, so three such workspaces
-- pinned all three slots on every tick and every other auto-draft workspace
-- was permanently starved without any signal.
--
-- The tick now orders by this poll stamp instead, and writes it
-- unconditionally at the top of each workspace's turn — succeed or fail,
-- the workspace goes to the back of the queue and everyone else gets seen.

BEGIN;

ALTER TABLE public.workspace_instantly_integrations
  ADD COLUMN IF NOT EXISTS auto_draft_polled_at TIMESTAMPTZ;

-- Send-once claim for operator inbox replies. The reply action dispatched to
-- the provider with no server-side state transition guarding it: a reload, a
-- second tab, or a second operator inside the cache window sent the same
-- staged reply twice. The claim is keyed on the inbound message being
-- answered and taken by compare-and-set before dispatch.
ALTER TABLE public.workspace_inbox_thread_state
  ADD COLUMN IF NOT EXISTS reply_sent_email_id TEXT;

COMMIT;
