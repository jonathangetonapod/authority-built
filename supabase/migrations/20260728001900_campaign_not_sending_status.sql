-- Record why a campaign is not sending.
--
-- A campaign reads "Active" while sending nothing, and the platform had no
-- answer for why. Instantly returns not_sending_status on the campaign object
-- and nothing here ever read it, so an operator looking at a live campaign
-- with no sends had to open Instantly to learn whether it was outside its
-- window, waiting on a lead, or had hit a limit.
--
-- Observed from the provider, never authored here. The values are the ones
-- Instantly documents; anything else is stored as-is rather than rejected, so
-- a new provider code degrades to "reason not recognised" instead of failing
-- the sync that carried it.

ALTER TABLE public.workspace_client_campaigns
  ADD COLUMN IF NOT EXISTS provider_not_sending_status INTEGER;

COMMENT ON COLUMN public.workspace_client_campaigns.provider_not_sending_status IS
  'Instantly not_sending_status observed on the last sync: 1 outside schedule, 2 waiting for a lead, 3 daily limit reached, 4 all sending accounts at their limit, 99 provider error. NULL means the provider reported no reason.';
