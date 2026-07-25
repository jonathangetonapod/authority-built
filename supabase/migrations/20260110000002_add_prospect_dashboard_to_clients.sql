-- Add prospect dashboard slug field to clients table
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS prospect_dashboard_slug TEXT;

-- Add comment
COMMENT ON COLUMN clients.prospect_dashboard_slug IS 'Slug of the linked prospect dashboard for this client';
