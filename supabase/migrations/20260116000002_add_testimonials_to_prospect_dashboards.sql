-- Add testimonial fields to prospect_dashboards
-- This allows admins to show specific testimonial videos to each prospect

ALTER TABLE prospect_dashboards
ADD COLUMN IF NOT EXISTS testimonial_ids TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS show_testimonials BOOLEAN DEFAULT true;

COMMENT ON COLUMN prospect_dashboards.testimonial_ids IS 'Array of testimonial IDs to show for this prospect';
COMMENT ON COLUMN prospect_dashboards.show_testimonials IS 'Whether to show testimonials section on the prospect dashboard';
