-- Resolve a captured conversation to the show its host belongs to.
--
-- A host reply that arrived without campaign context used to be filed under a
-- placeholder show name. podcast_name is both the human identity of the row
-- and part of how the book reconciles duplicates, so a placeholder forks one
-- host into two rows the moment the real show name shows up. The address is
-- the durable link back to the show, and campaign targets already hold it.
--
-- Normalized into a stored column rather than matched with LIKE: an
-- underscore is legal in an email local part and would silently act as a
-- single-character wildcard, which is exactly the kind of near-miss that
-- attaches a conversation to the wrong show.

ALTER TABLE public.workspace_client_campaign_targets
  ADD COLUMN IF NOT EXISTS normalized_contact_email TEXT
    GENERATED ALWAYS AS (lower(btrim(contact_email))) STORED;

COMMENT ON COLUMN public.workspace_client_campaign_targets.normalized_contact_email IS
  'Lowercased contact_email. Resolves an inbound conversation to the show that address was pitched for.';

CREATE INDEX IF NOT EXISTS workspace_client_campaign_targets_contact_email_idx
  ON public.workspace_client_campaign_targets (workspace_id, normalized_contact_email)
  WHERE normalized_contact_email IS NOT NULL AND normalized_contact_email <> '';

-- The same lookup runs against relationships already in the book, which is the
-- first and most trusted source. It was previously an unindexed scan.
CREATE INDEX IF NOT EXISTS workspace_host_relationships_contact_email_idx
  ON public.workspace_host_relationships (workspace_id, contact_email)
  WHERE contact_email IS NOT NULL;

-- Retire the placeholder names already written.
--
-- Scoped to the exact string the inbox used to generate — 'Conversation with '
-- followed by this row's own contact address — so an operator who genuinely
-- typed a show name cannot be caught by it. Names only; the row, its threads,
-- its notes, and its client links are untouched. Nulling the name is the whole
-- repair: it stops the placeholder acting as a dedup key, and the next capture
-- for this host fills the real name in. Rows that turn out to be duplicates of
-- a properly named show still need a person to merge them.
UPDATE public.workspace_host_relationships
SET podcast_name = NULL,
    updated_at = now()
WHERE contact_email IS NOT NULL
  AND podcast_name = 'Conversation with ' || contact_email;
