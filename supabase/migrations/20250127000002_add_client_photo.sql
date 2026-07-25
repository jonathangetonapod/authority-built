-- Add photo_url column to clients table
-- This will store the URL of the client's profile photo

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Add index for photo lookups (optional but good practice)
CREATE INDEX IF NOT EXISTS clients_photo_url_idx ON public.clients(photo_url) WHERE photo_url IS NOT NULL;

-- Comment
COMMENT ON COLUMN public.clients.photo_url IS 'URL to client profile photo (displayed in portal dashboard)';
