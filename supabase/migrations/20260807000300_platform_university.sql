-- University: platform-authored training lessons shown to every workspace.
--
-- The content is global — the platform owner records how-to videos once and
-- every tenant sees them — so the table carries no workspace_id. Access goes
-- exclusively through the platform-university edge function: any
-- authenticated workspace user may list published lessons, only a platform
-- administrator may write, and drafts are visible to administrators alone.
-- RLS is enabled and FORCED with no policies, so nothing reaches this table
-- except the service role.

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_university_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN (
    'getting_started',
    'onboarding',
    'clients',
    'podcast_finder',
    'podcast_database',
    'client_podcast_system',
    'prospects',
    'client_campaigns',
    'relationships',
    'master_inbox',
    'mailboxes',
    'billing',
    'settings',
    'other'
  )),
  title TEXT NOT NULL CHECK (btrim(title) <> '' AND char_length(title) <= 200),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  -- The pasted watch URL, kept verbatim for editing; the provider and the
  -- video id are derived from it server-side and are what the player embeds.
  video_url TEXT NOT NULL CHECK (video_url ~ '^https://' AND char_length(video_url) <= 500),
  provider TEXT NOT NULL CHECK (provider IN ('loom', 'youtube')),
  video_id TEXT NOT NULL CHECK (btrim(video_id) <> '' AND char_length(video_id) <= 100),
  sort_order INTEGER NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_university_lessons_category_order_idx
  ON public.platform_university_lessons (category, sort_order, created_at);

ALTER TABLE public.platform_university_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_university_lessons FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.platform_university_lessons FROM anon, authenticated;

COMMIT;
