-- Create sync_history table to track all sync operations
CREATE TABLE IF NOT EXISTS sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL CHECK (sync_type IN ('manual', 'auto')),
  total_processed INTEGER DEFAULT 0,
  new_replies INTEGER DEFAULT 0,
  updated_replies INTEGER DEFAULT 0,
  skipped_replies INTEGER DEFAULT 0,
  error_message TEXT,
  success BOOLEAN DEFAULT true,
  sync_duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for querying recent syncs
CREATE INDEX IF NOT EXISTS idx_sync_history_created_at ON sync_history(created_at DESC);

-- Create index for filtering by type
CREATE INDEX IF NOT EXISTS idx_sync_history_sync_type ON sync_history(sync_type);
