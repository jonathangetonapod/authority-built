-- A serving domain must survive one bad answer from its provider.
--
-- Refresh wrote the provider's latest reading straight onto the row, so a
-- single non-active response — an API hiccup, a certificate renewal window,
-- a rate limit answered mid-check — stripped is_primary and nulled
-- activated_at. Every client link generated between that check and the next
-- one carried the platform's address instead of the agency's, which is the
-- one thing a white-label domain exists to prevent, and it happened with no
-- human involved and nothing to review afterwards.
--
-- Two columns rather than a rewrite of the status machine: a count of how many
-- consecutive bad readings a row has seen, so a demotion needs corroboration,
-- and a first activation date that survives one, because activated_at is
-- pinned to the current status by an existing constraint and is therefore
-- destroyed and re-minted every time a domain dips.

ALTER TABLE public.workspace_domains
  ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_activated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.workspace_domains.consecutive_failures IS
  'Consecutive non-active provider readings. Reset to 0 on any active reading. A serving domain is only demoted once this corroborates the failure.';

COMMENT ON COLUMN public.workspace_domains.first_activated_at IS
  'When this domain first served, never cleared. activated_at is paired to the current status by constraint, so it cannot answer "how long has this worked".';

ALTER TABLE public.workspace_domains
  DROP CONSTRAINT IF EXISTS workspace_domains_failures_non_negative;

ALTER TABLE public.workspace_domains
  ADD CONSTRAINT workspace_domains_failures_non_negative
    CHECK (consecutive_failures >= 0);

-- A domain serving today has served at least since its current activation.
UPDATE public.workspace_domains
SET first_activated_at = activated_at
WHERE first_activated_at IS NULL
  AND activated_at IS NOT NULL;
