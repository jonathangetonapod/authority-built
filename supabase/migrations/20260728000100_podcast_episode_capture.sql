-- Episode capture on the global podcast catalog.
--
-- Until now the latest-episode context for research (title, description,
-- transcript) was fetched live from Podscan on EVERY research run and mostly
-- thrown away, while the pitch workspace showed "Latest activity —" because
-- the cached last_posted_at was never refreshed. Storing the fetch result on
-- the global catalog row means each show is fetched once (per staleness
-- window), and every workspace, client, and rerun after that reads storage.
--
-- The columns live on public.podcasts (the shared Podscan cache) rather than
-- the per-client shortlist copy, so one capture serves everyone.

ALTER TABLE public.podcasts
  -- Latest episodes, newest first: [{ title, description, posted_at }].
  ADD COLUMN recent_episodes JSONB,
  -- Transcript of the newest episode, capped by the writer. Kept separate
  -- from recent_episodes so list-style reads can skip the heavy field.
  ADD COLUMN latest_episode_transcript TEXT,
  -- When the episodes were last fetched from Podscan. Null means never —
  -- the next flow that needs episodes fetches and stamps it.
  ADD COLUMN episodes_fetched_at TIMESTAMPTZ;

COMMENT ON COLUMN public.podcasts.recent_episodes IS
  'Latest Podscan episodes, newest first: [{title, description, posted_at}]. Written by ensureEpisodesCaptured.';
COMMENT ON COLUMN public.podcasts.latest_episode_transcript IS
  'Capped transcript of the newest episode, for research prompts. Written alongside recent_episodes.';
COMMENT ON COLUMN public.podcasts.episodes_fetched_at IS
  'Last successful Podscan episode fetch; staleness gate for re-fetching.';
