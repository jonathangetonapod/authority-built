-- Batch increment cache hit counts for multiple podcasts in a single UPDATE
-- Replaces N individual increment_podcast_cache_hit RPC calls with one
CREATE OR REPLACE FUNCTION batch_increment_podcast_cache_hits(p_podscan_ids TEXT[])
RETURNS VOID AS $$
BEGIN
  UPDATE public.podcasts
  SET cache_hit_count = cache_hit_count + 1
  WHERE podscan_id = ANY(p_podscan_ids);
END;
$$ LANGUAGE plpgsql;
