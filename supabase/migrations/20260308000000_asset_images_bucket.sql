-- ── asset-images storage bucket ───────────────────────────────────────────────
-- Shared public bucket for spell art, item art, location images, and any future
-- entity types that need image uploads. NPC portraits use their own bucket.

INSERT INTO storage.buckets (id, name, public)
VALUES ('asset-images', 'asset-images', true)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload into their own folder (user_id prefix)
CREATE POLICY "Authenticated users can upload asset images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'asset-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Anyone can read (bucket is public)
CREATE POLICY "Public read for asset images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'asset-images');

-- Users can delete their own uploads
CREATE POLICY "Users can delete their own asset images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'asset-images' AND (storage.foldername(name))[1] = auth.uid()::text);
