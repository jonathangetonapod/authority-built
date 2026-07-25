-- Real email waterfall state + pricing.
--
-- email_unlock_progress mirrors the frontend ClientShortlistEmailUnlock
-- shape for in-flight and unsuccessful searches; verified global contacts
-- keep living in podcast_direct_contacts and always win in the list DTO.
--
-- Pricing: the product promise is "1 credit on first global success", so the
-- identify and find stages become free and the verify stage (the only one
-- charged, and only when record_global_podcast_direct_contact_v1 reports the
-- first global unlock) is repriced to 1 credit. Newer effective_from rows win.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:email-waterfall:v1', 0));

ALTER TABLE public.client_dashboard_podcasts
  ADD COLUMN IF NOT EXISTS email_unlock_progress JSONB;

COMMENT ON COLUMN public.client_dashboard_podcasts.email_unlock_progress IS
  'Live email waterfall state for searches that have not produced a verified global contact; null = never run.';

INSERT INTO public.operation_credit_costs (operation_type, credit_cost, effective_from)
VALUES
  ('email_unlock_identify', 0, now()),
  ('email_unlock_find', 0, now()),
  ('email_unlock_verify', 1, now())
ON CONFLICT (operation_type, effective_from) DO NOTHING;

COMMIT;
