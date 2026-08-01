-- A default timezone Instantly will actually accept.
--
-- The column defaulted to America/New_York, which is not in Instantly's
-- schedule enum. A campaign created without an explicit zone therefore carried
-- a value that reads fine here, is a real IANA name, and cannot be sent to the
-- provider — so the campaign ended up scheduled on whatever clock Instantly
-- substituted, with nothing on screen saying so. America/Detroit is the same
-- US Eastern clock and is in the enum.
--
-- Existing rows are left alone. Their zone is a decision somebody may have
-- made, and rewriting when a live campaign emails people is not a migration's
-- call. The settings form now refuses an unsupported zone on save and names
-- the substitute, so those rows are corrected deliberately rather than behind
-- somebody's back.

ALTER TABLE public.workspace_client_campaigns
  ALTER COLUMN timezone SET DEFAULT 'America/Detroit';

COMMENT ON COLUMN public.workspace_client_campaigns.timezone IS
  'Sending timezone, restricted to the enum Instantly accepts. Note it has no America/New_York or America/Los_Angeles; America/Detroit and America/Dawson are those clocks.';
