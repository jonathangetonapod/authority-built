-- Allow public read access to premium_podcasts table
-- This is needed so the Premium Placements page can be viewed by anyone

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read access to active premium podcasts" ON premium_podcasts;
DROP POLICY IF EXISTS "Enable read access for admin users" ON premium_podcasts;

-- Create new policy for public read access (only active podcasts)
CREATE POLICY "Allow public read access to active premium podcasts"
ON premium_podcasts
FOR SELECT
USING (is_active = true);

-- Keep admin-only policies for insert, update, delete
DROP POLICY IF EXISTS "Enable insert for admin users" ON premium_podcasts;
DROP POLICY IF EXISTS "Enable update for admin users" ON premium_podcasts;
DROP POLICY IF EXISTS "Enable delete for admin users" ON premium_podcasts;

CREATE POLICY "Enable insert for admin users"
ON premium_podcasts
FOR INSERT
WITH CHECK (
  auth.jwt() IS NOT NULL AND
  auth.jwt()->>'email' IN ('jonathan@getonapod.com')
);

CREATE POLICY "Enable update for admin users"
ON premium_podcasts
FOR UPDATE
USING (
  auth.jwt() IS NOT NULL AND
  auth.jwt()->>'email' IN ('jonathan@getonapod.com')
);

CREATE POLICY "Enable delete for admin users"
ON premium_podcasts
FOR DELETE
USING (
  auth.jwt() IS NOT NULL AND
  auth.jwt()->>'email' IN ('jonathan@getonapod.com')
);
