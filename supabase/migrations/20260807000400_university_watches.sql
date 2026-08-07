-- University phase 2: who has watched what.
--
-- One row per user per lesson, written when the player opens and removable
-- from the player ("mark as unwatched"). Powers the watched badge, the
-- per-category progress line, and the "New" badge (recent AND unwatched).
-- Per-user, not per-workspace: the same person on two workspaces has watched
-- a video once. Like the lessons table, access is exclusively through the
-- platform-university edge function — RLS forced with no policies.

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_university_watches (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.platform_university_lessons(id) ON DELETE CASCADE,
  watched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);

ALTER TABLE public.platform_university_watches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_university_watches FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.platform_university_watches FROM anon, authenticated;

COMMIT;
