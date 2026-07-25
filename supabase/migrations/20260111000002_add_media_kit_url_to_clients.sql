-- Add media kit URL field to clients table
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS media_kit_url TEXT;

-- Add comment
COMMENT ON COLUMN clients.media_kit_url IS 'Link to client media kit or one-pager document (Google Doc, PDF, etc.)';
