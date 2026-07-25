-- Add function to count unique podcasts across all cache tables

CREATE OR REPLACE FUNCTION count_unique_cached_podcasts()
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(DISTINCT podcast_id) FROM (
      SELECT podcast_id FROM client_dashboard_podcasts
      UNION
      SELECT podcast_id FROM prospect_dashboard_podcasts
      UNION
      SELECT podcast_id FROM bookings WHERE podcast_id IS NOT NULL
    ) AS all_podcasts
  );
END;
$$ LANGUAGE plpgsql;

-- Add function to get detailed cache statistics
CREATE OR REPLACE FUNCTION get_cache_statistics()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_unique', (SELECT count_unique_cached_podcasts()),
    'client_dashboards', (SELECT COUNT(*) FROM client_dashboard_podcasts),
    'prospect_dashboards', (SELECT COUNT(*) FROM prospect_dashboard_podcasts),
    'bookings', (SELECT COUNT(*) FROM bookings WHERE podcast_id IS NOT NULL),
    'unique_clients', (SELECT COUNT(DISTINCT client_id) FROM client_dashboard_podcasts),
    'unique_prospects', (SELECT COUNT(DISTINCT prospect_dashboard_id) FROM prospect_dashboard_podcasts)
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql;
