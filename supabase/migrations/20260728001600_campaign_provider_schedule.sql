-- Show the sending window Instantly actually holds, instead of asserting one.
--
-- The campaign schedule page rendered "Monday–Friday", "9:00 AM–5:00 PM", and
-- "15+ minutes" from hardcoded strings, under the heading "The standard safe
-- window applied to this campaign in Instantly". Nothing read the provider, so
-- the card could not disagree with reality and therefore could never reveal
-- that it did. Meanwhile the campaign creation body sets days 0-4 true and 5-6
-- false, and Instantly's API reference does not say which day '0' is — so
-- whether that is Monday–Friday has never been verified by anything.
--
-- Storing what the provider returns turns an assertion into an observation.
-- Cached rather than fetched per page load because the sync already reads the
-- campaign, and a schedule changes far less often than the page is opened.

ALTER TABLE public.workspace_client_campaigns
  ADD COLUMN IF NOT EXISTS provider_schedule JSONB,
  ADD COLUMN IF NOT EXISTS provider_email_gap INTEGER;

COMMENT ON COLUMN public.workspace_client_campaigns.provider_schedule IS
  'First schedule block as returned by Instantly: name, timing from/to, timezone, and the seven day booleans in key order. Observed, never authored here.';
COMMENT ON COLUMN public.workspace_client_campaigns.provider_email_gap IS
  'Minutes between sends as configured at the provider, or NULL when Instantly did not report one.';
