-- Add google_sheet_url column to clients table
-- This allows each client to have their own Google Sheet for podcast exports

ALTER TABLE clients
ADD COLUMN google_sheet_url TEXT;

COMMENT ON COLUMN clients.google_sheet_url IS 'URL of the Google Sheet where podcast finder results will be exported for this client';
