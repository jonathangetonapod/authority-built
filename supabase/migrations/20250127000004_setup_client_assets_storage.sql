-- Create storage bucket for client assets (photos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-assets',
  'client-assets',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to client-photos folder
CREATE POLICY "Authenticated users can upload client photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'client-assets' AND (storage.foldername(name))[1] = 'client-photos');

-- Allow authenticated users to update client photos
CREATE POLICY "Authenticated users can update client photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'client-assets' AND (storage.foldername(name))[1] = 'client-photos');

-- Allow authenticated users to delete client photos
CREATE POLICY "Authenticated users can delete client photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'client-assets' AND (storage.foldername(name))[1] = 'client-photos');

-- Allow public read access to all files
CREATE POLICY "Public read access to client assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'client-assets');
