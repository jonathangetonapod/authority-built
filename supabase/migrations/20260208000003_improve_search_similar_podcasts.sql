-- Improve search_similar_podcasts with pre-filters and richer return columns
-- Filters out: non-guest shows, inactive podcasts (365+ days), rejected podcasts
-- Returns additional quality signals for AI filtering

CREATE OR REPLACE FUNCTION search_similar_podcasts(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 50,
  p_exclude_podcast_ids text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  podscan_id text,
  podcast_name text,
  podcast_description text,
  podcast_categories jsonb,
  audience_size integer,
  similarity float,
  itunes_rating decimal,
  episode_count integer,
  last_posted_at timestamptz,
  publisher_name text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.podscan_id,
    p.podcast_name,
    p.podcast_description,
    p.podcast_categories,
    p.audience_size,
    1 - (p.embedding <=> query_embedding) as similarity,
    p.itunes_rating,
    p.episode_count,
    p.last_posted_at,
    p.publisher_name
  FROM public.podcasts p
  WHERE p.embedding IS NOT NULL
    AND 1 - (p.embedding <=> query_embedding) > match_threshold
    AND (p.podcast_has_guests IS NOT FALSE)
    AND (p.last_posted_at IS NULL OR p.last_posted_at > NOW() - INTERVAL '365 days')
    AND (p_exclude_podcast_ids IS NULL OR p.podscan_id != ALL(p_exclude_podcast_ids))
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION search_similar_podcasts IS 'Search for similar podcasts with pre-filters for guest acceptance, activity recency, and exclusion lists';
