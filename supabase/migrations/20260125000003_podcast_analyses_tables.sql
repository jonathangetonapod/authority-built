-- =====================================================
-- PODCAST ANALYSES TABLES
-- Separates client/prospect-specific AI analyses from
-- universal podcast metadata in centralized table
-- =====================================================

-- ==================== CLIENT PODCAST ANALYSES ====================

CREATE TABLE IF NOT EXISTS public.client_podcast_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  podcast_id UUID NOT NULL REFERENCES public.podcasts(id) ON DELETE CASCADE,

  -- AI Analysis (Client-Specific based on client bio)
  ai_clean_description TEXT,
  ai_fit_reasons TEXT[],
  ai_pitch_angles JSONB,
  ai_analyzed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_client_podcast_analysis UNIQUE (client_id, podcast_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_client_podcast_analyses_client
  ON public.client_podcast_analyses(client_id);

CREATE INDEX IF NOT EXISTS idx_client_podcast_analyses_podcast
  ON public.client_podcast_analyses(podcast_id);

CREATE INDEX IF NOT EXISTS idx_client_podcast_analyses_analyzed_at
  ON public.client_podcast_analyses(ai_analyzed_at DESC NULLS LAST);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_client_podcast_analyses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS client_podcast_analyses_updated_at_trigger ON public.client_podcast_analyses;

CREATE TRIGGER client_podcast_analyses_updated_at_trigger
  BEFORE UPDATE ON public.client_podcast_analyses
  FOR EACH ROW
  EXECUTE FUNCTION update_client_podcast_analyses_updated_at();

-- ==================== PROSPECT PODCAST ANALYSES ====================

CREATE TABLE IF NOT EXISTS public.prospect_podcast_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_dashboard_id UUID NOT NULL REFERENCES public.prospect_dashboards(id) ON DELETE CASCADE,
  podcast_id UUID NOT NULL REFERENCES public.podcasts(id) ON DELETE CASCADE,

  -- AI Analysis (Prospect-Specific based on prospect bio)
  ai_clean_description TEXT,
  ai_fit_reasons JSONB,
  ai_pitch_angles JSONB,
  ai_analyzed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_prospect_podcast_analysis UNIQUE (prospect_dashboard_id, podcast_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_prospect_podcast_analyses_dashboard
  ON public.prospect_podcast_analyses(prospect_dashboard_id);

CREATE INDEX IF NOT EXISTS idx_prospect_podcast_analyses_podcast
  ON public.prospect_podcast_analyses(podcast_id);

CREATE INDEX IF NOT EXISTS idx_prospect_podcast_analyses_analyzed_at
  ON public.prospect_podcast_analyses(ai_analyzed_at DESC NULLS LAST);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_prospect_podcast_analyses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prospect_podcast_analyses_updated_at_trigger ON public.prospect_podcast_analyses;

CREATE TRIGGER prospect_podcast_analyses_updated_at_trigger
  BEFORE UPDATE ON public.prospect_podcast_analyses
  FOR EACH ROW
  EXECUTE FUNCTION update_prospect_podcast_analyses_updated_at();

-- ==================== RLS POLICIES ====================

-- Enable RLS
ALTER TABLE public.client_podcast_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_podcast_analyses ENABLE ROW LEVEL SECURITY;

-- Client Podcast Analyses Policies
CREATE POLICY "Service role can manage client podcast analyses"
  ON public.client_podcast_analyses
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read client podcast analyses"
  ON public.client_podcast_analyses
  FOR SELECT
  TO authenticated
  USING (true);

-- Prospect Podcast Analyses Policies
CREATE POLICY "Service role can manage prospect podcast analyses"
  ON public.prospect_podcast_analyses
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read prospect podcast analyses"
  ON public.prospect_podcast_analyses
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Public can read prospect podcast analyses"
  ON public.prospect_podcast_analyses
  FOR SELECT
  TO public
  USING (true);

-- ==================== HELPER VIEWS ====================

-- View to easily join client podcasts with analyses
CREATE OR REPLACE VIEW public.client_podcasts_with_analyses AS
SELECT
  p.*,
  cpa.ai_clean_description,
  cpa.ai_fit_reasons,
  cpa.ai_pitch_angles,
  cpa.ai_analyzed_at,
  cpa.client_id
FROM public.podcasts p
INNER JOIN public.client_podcast_analyses cpa ON p.id = cpa.podcast_id;

-- View to easily join prospect podcasts with analyses
CREATE OR REPLACE VIEW public.prospect_podcasts_with_analyses AS
SELECT
  p.*,
  ppa.ai_clean_description,
  ppa.ai_fit_reasons,
  ppa.ai_pitch_angles,
  ppa.ai_analyzed_at,
  ppa.prospect_dashboard_id
FROM public.podcasts p
INNER JOIN public.prospect_podcast_analyses ppa ON p.id = ppa.podcast_id;

-- Grant view access
GRANT SELECT ON public.client_podcasts_with_analyses TO authenticated;
GRANT SELECT ON public.prospect_podcasts_with_analyses TO authenticated;
GRANT SELECT ON public.prospect_podcasts_with_analyses TO anon;

-- ==================== COMPLETION ====================

DO $$
BEGIN
  RAISE NOTICE '✅ Podcast analyses tables created successfully!';
  RAISE NOTICE '📋 Created: client_podcast_analyses';
  RAISE NOTICE '📋 Created: prospect_podcast_analyses';
  RAISE NOTICE '👁️ Created views for easy joins';
END $$;
