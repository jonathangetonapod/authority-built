-- Stripe does not promise webhook events arrive in the order they happened.
-- The subscription handler was last-write-wins, which is safe for a retry (the
-- update sets state rather than accumulating it) and wrong for a reorder: a
-- customer.subscription.updated delivered after the .deleted that followed it
-- puts a cancelled workspace back on an active plan, with its allowance.
--
-- Stripe subscriptions carry no version, so the event's own created timestamp
-- is the ordering key. Stored here so a later event can be told from an older
-- one that merely arrived later.

ALTER TABLE public.workspace_billing_profiles
  ADD COLUMN IF NOT EXISTS last_subscription_event_at TIMESTAMPTZ;

COMMENT ON COLUMN public.workspace_billing_profiles.last_subscription_event_at IS
  'created time of the newest Stripe subscription event applied to this row. '
  'An event older than this is a reordered delivery and is ignored.';
