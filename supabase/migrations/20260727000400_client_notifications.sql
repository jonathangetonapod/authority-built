-- The system finally speaks.
--
-- Every meaningful moment in a client's journey — a batch of shows ready to
-- review, a recording confirmed, an episode going live — happened silently
-- until now. This table is the send log that makes notifying safe: a unique
-- event key means a retried request, a re-saved booking, or a cron replay
-- can never mail the same person twice about the same thing.
--
-- Rows are written by service-role edge functions only. No RLS policy grants
-- tenant access because nothing in the app reads this table from the client;
-- it exists for idempotency and for support to answer "was that sent?".

CREATE TABLE public.client_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  -- 'shortlist_ready' | 'booking_confirmed' | 'episode_published' | 'client_approved'
  kind TEXT NOT NULL,
  -- Stable identity of the thing being announced, e.g. 'booking:<uuid>:published'.
  event_key TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  -- 'sent' | 'failed' | 'skipped'
  status TEXT NOT NULL,
  provider_message_id TEXT,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_notifications ENABLE ROW LEVEL SECURITY;

-- The claim: one row per event, inserted before the send. A duplicate insert
-- fails, and the caller treats that as "already announced" and stops.
CREATE UNIQUE INDEX client_notifications_event_key_idx
  ON public.client_notifications (workspace_id, client_id, event_key);

CREATE INDEX client_notifications_recent_idx
  ON public.client_notifications (workspace_id, created_at DESC);

-- A client who wants fewer emails gets fewer emails. Null is treated as on,
-- so existing clients keep receiving the milestones they would expect.
ALTER TABLE public.clients
  ADD COLUMN notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON TABLE public.client_notifications IS
  'Send log and idempotency guard for white-labelled client milestone emails.';
