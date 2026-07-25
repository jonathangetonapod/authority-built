-- Create sales_calls table to store Fathom call recordings
CREATE TABLE IF NOT EXISTS sales_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id BIGINT UNIQUE NOT NULL,
  title TEXT,
  meeting_title TEXT,
  fathom_url TEXT,
  share_url TEXT,
  scheduled_start_time TIMESTAMPTZ,
  scheduled_end_time TIMESTAMPTZ,
  recording_start_time TIMESTAMPTZ,
  recording_end_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  transcript JSONB,
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create sales_call_analysis table to store AI analysis
CREATE TABLE IF NOT EXISTS sales_call_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_call_id UUID REFERENCES sales_calls(id) ON DELETE CASCADE,
  overall_score DECIMAL(3,1) CHECK (overall_score >= 0 AND overall_score <= 10),
  discovery_score DECIMAL(3,1) CHECK (discovery_score >= 0 AND discovery_score <= 10),
  objection_handling_score DECIMAL(3,1) CHECK (objection_handling_score >= 0 AND objection_handling_score <= 10),
  closing_score DECIMAL(3,1) CHECK (closing_score >= 0 AND closing_score <= 10),
  engagement_score DECIMAL(3,1) CHECK (engagement_score >= 0 AND engagement_score <= 10),
  talk_listen_ratio_talk INTEGER,
  talk_listen_ratio_listen INTEGER,
  questions_asked_count INTEGER,
  recommendations JSONB,
  strengths JSONB,
  weaknesses JSONB,
  key_moments JSONB,
  sentiment_analysis JSONB,
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sales_calls_recording_id ON sales_calls(recording_id);
CREATE INDEX IF NOT EXISTS idx_sales_calls_recording_start_time ON sales_calls(recording_start_time DESC);
CREATE INDEX IF NOT EXISTS idx_sales_call_analysis_sales_call_id ON sales_call_analysis(sales_call_id);
CREATE INDEX IF NOT EXISTS idx_sales_call_analysis_overall_score ON sales_call_analysis(overall_score DESC);

-- Enable RLS
ALTER TABLE sales_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_call_analysis ENABLE ROW LEVEL SECURITY;

-- Create policies (allow authenticated users to read/write)
CREATE POLICY "Allow authenticated users to read sales calls"
  ON sales_calls FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert sales calls"
  ON sales_calls FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update sales calls"
  ON sales_calls FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to read analysis"
  ON sales_call_analysis FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert analysis"
  ON sales_call_analysis FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update analysis"
  ON sales_call_analysis FOR UPDATE
  TO authenticated
  USING (true);
