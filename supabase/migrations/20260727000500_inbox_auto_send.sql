-- Third SDR mode: the AI answers the host without waiting for a human.
--
-- auto_draft stages a package and stops. auto_send dispatches it, but only
-- after passing gates that are deliberately narrow, because the thing being
-- automated is a real email to a real podcast host under a client's name:
--
--   * the lead is flagged Interested in Instantly (already true for drafting)
--   * the model classified the reply as one worth answering, with confidence
--   * a hold window elapses first, so a bad draft can still be caught
--   * the send happens inside the campaign's business-hours window
--   * the thread is not suppressed, archived, or already booked
--
-- Anything that fails a gate stays in review exactly as auto_draft would, so
-- the failure mode of this feature is "a human does it", never "nothing".

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_ai_sdr_mode_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_ai_sdr_mode_check
  CHECK (ai_sdr_mode IN ('manual', 'auto_draft', 'auto_send'));

ALTER TABLE public.workspace_inbox_thread_state
  -- When the hold expires. Null means this thread was never eligible for an
  -- automatic send, which is the state every manual and auto-draft thread
  -- stays in forever.
  ADD COLUMN auto_send_eligible_at TIMESTAMPTZ,
  -- Stamped by the compare-and-set claim BEFORE dispatch, so an overlapping
  -- tick can never send the same draft twice. A non-null value means the
  -- send was attempted, not necessarily that it was confirmed.
  ADD COLUMN auto_sent_at TIMESTAMPTZ,
  ADD COLUMN auto_send_error TEXT;

-- The dispatch sweep reads exactly this shape: due, unsent, still in review.
CREATE INDEX workspace_inbox_thread_state_auto_send_due_idx
  ON public.workspace_inbox_thread_state (auto_send_eligible_at)
  WHERE auto_send_eligible_at IS NOT NULL
    AND auto_sent_at IS NULL
    AND status = 'review';

COMMENT ON COLUMN public.workspace_inbox_thread_state.auto_send_eligible_at IS
  'Earliest moment the staged draft may be dispatched automatically; null means never.';
COMMENT ON COLUMN public.workspace_inbox_thread_state.auto_sent_at IS
  'Claim stamp written before dispatch — presence blocks any further automatic send.';
