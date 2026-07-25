-- Add show_pricing_section toggle to prospect_dashboards
ALTER TABLE prospect_dashboards
ADD COLUMN IF NOT EXISTS show_pricing_section BOOLEAN DEFAULT true;

COMMENT ON COLUMN prospect_dashboards.show_pricing_section IS 'When true, shows the pricing CTA section on the prospect dashboard. When false, hides it.';
