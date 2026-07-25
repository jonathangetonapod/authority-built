-- Create storage bucket for prospect profile images
INSERT INTO storage.buckets (id, name, public)
VALUES ('prospect-images', 'prospect-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to prospect images
CREATE POLICY "Public read access for prospect images"
ON storage.objects FOR SELECT
USING (bucket_id = 'prospect-images');

-- Allow authenticated users to upload prospect images
CREATE POLICY "Authenticated users can upload prospect images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'prospect-images');

-- Allow authenticated users to delete prospect images
CREATE POLICY "Authenticated users can delete prospect images"
ON storage.objects FOR DELETE
USING (bucket_id = 'prospect-images');
