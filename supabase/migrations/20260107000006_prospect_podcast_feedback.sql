-- Create prospect_podcast_feedback table for prospects to approve/reject podcasts and leave notes
CREATE TABLE prospect_podcast_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_dashboard_id UUID NOT NULL REFERENCES prospect_dashboards(id) ON DELETE CASCADE,
  podcast_id TEXT NOT NULL, -- Podscan podcast ID
  status TEXT CHECK (status IN ('approved', 'rejected')), -- null means not reviewed
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each prospect can only have one feedback entry per podcast
  UNIQUE(prospect_dashboard_id, podcast_id)
);

-- Create index for faster lookups
CREATE INDEX idx_prospect_podcast_feedback_dashboard ON prospect_podcast_feedback(prospect_dashboard_id);
CREATE INDEX idx_prospect_podcast_feedback_status ON prospect_podcast_feedback(status);

-- Enable RLS
ALTER TABLE prospect_podcast_feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read feedback (prospects view their own via the dashboard)
CREATE POLICY "Anyone can read prospect podcast feedback"
  ON prospect_podcast_feedback
  FOR SELECT
  USING (true);

-- Policy: Anyone can insert feedback (prospects don't have auth, they access via public dashboard URL)
CREATE POLICY "Anyone can insert prospect podcast feedback"
  ON prospect_podcast_feedback
  FOR INSERT
  WITH CHECK (true);

-- Policy: Anyone can update feedback (allows changing mind on approve/reject)
CREATE POLICY "Anyone can update prospect podcast feedback"
  ON prospect_podcast_feedback
  FOR UPDATE
  USING (true);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_prospect_podcast_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_prospect_podcast_feedback_updated_at
  BEFORE UPDATE ON prospect_podcast_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_prospect_podcast_feedback_updated_at();

-- Add comments
COMMENT ON TABLE prospect_podcast_feedback IS 'Stores prospect feedback (approve/reject/notes) on individual podcasts';
COMMENT ON COLUMN prospect_podcast_feedback.status IS 'approved = interested, rejected = not interested, null = not yet reviewed';
COMMENT ON COLUMN prospect_podcast_feedback.notes IS 'Optional notes from the prospect about this podcast';
