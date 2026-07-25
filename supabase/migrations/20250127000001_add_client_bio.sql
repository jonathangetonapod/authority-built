-- Add bio column to clients table for AI query generation
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS bio TEXT;

-- Add index for bio searches (optional but good practice)
CREATE INDEX IF NOT EXISTS clients_bio_idx ON public.clients USING gin(to_tsvector('english', bio));

-- Comment
COMMENT ON COLUMN public.clients.bio IS 'Client biography/description used for AI-powered podcast query generation';
