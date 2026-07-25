-- Add structured prospect fields for richer embedding generation
-- These fields improve podcast-prospect matching quality

ALTER TABLE public.prospect_dashboards
ADD COLUMN IF NOT EXISTS prospect_industry TEXT,
ADD COLUMN IF NOT EXISTS prospect_expertise TEXT[],
ADD COLUMN IF NOT EXISTS prospect_topics TEXT[],
ADD COLUMN IF NOT EXISTS prospect_target_audience TEXT,
ADD COLUMN IF NOT EXISTS prospect_company TEXT,
ADD COLUMN IF NOT EXISTS prospect_title TEXT;

COMMENT ON COLUMN public.prospect_dashboards.prospect_industry IS 'Industry vertical (e.g., SaaS, Healthcare, Finance)';
COMMENT ON COLUMN public.prospect_dashboards.prospect_expertise IS 'Array of expertise areas for semantic matching';
COMMENT ON COLUMN public.prospect_dashboards.prospect_topics IS 'Array of topics the prospect can speak on';
COMMENT ON COLUMN public.prospect_dashboards.prospect_target_audience IS 'Description of the prospects target audience';
COMMENT ON COLUMN public.prospect_dashboards.prospect_company IS 'Company name for professional context';
COMMENT ON COLUMN public.prospect_dashboards.prospect_title IS 'Job title for professional context';
