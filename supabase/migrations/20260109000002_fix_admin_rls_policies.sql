-- Fix RLS policies that incorrectly reference admin_users.user_id (which doesn't exist)
-- The admin_users table uses 'email' to identify admins, not 'user_id'

-- Drop the broken policy on prospect_dashboard_podcasts
DROP POLICY IF EXISTS "Admin write access for prospect_dashboard_podcasts" ON prospect_dashboard_podcasts;

-- Create fixed policy that checks by email
CREATE POLICY "Admin write access for prospect_dashboard_podcasts"
  ON prospect_dashboard_podcasts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.email = (
        SELECT email FROM auth.users WHERE id = auth.uid()
      )
    )
  );

-- Also fix prospect_dashboards if it has the same issue
DROP POLICY IF EXISTS "Admin full access for prospect_dashboards" ON prospect_dashboards;

CREATE POLICY "Admin full access for prospect_dashboards"
  ON prospect_dashboards
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.email = (
        SELECT email FROM auth.users WHERE id = auth.uid()
      )
    )
  );

-- Fix prospect_podcast_feedback admin policy if exists
DROP POLICY IF EXISTS "Admin full access for prospect_podcast_feedback" ON prospect_podcast_feedback;

CREATE POLICY "Admin full access for prospect_podcast_feedback"
  ON prospect_podcast_feedback
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.email = (
        SELECT email FROM auth.users WHERE id = auth.uid()
      )
    )
  );
