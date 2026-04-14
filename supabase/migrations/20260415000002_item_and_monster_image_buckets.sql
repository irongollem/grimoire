-- Migration: item_and_monster_image_buckets
-- Dedicated storage buckets for item and monster images, split out of the
-- catch-all asset-images bucket so each entity type can be browsed in isolation.
-- Mirrors the webp-only / 10 MB policy of the other image buckets.
-- No SELECT policy — public buckets serve files via getPublicUrl() without RLS.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('item-images',    'item-images',    true, 10485760, ARRAY['image/webp']),
  ('monster-images', 'monster-images', true, 10485760, ARRAY['image/webp'])
ON CONFLICT (id) DO NOTHING;

-- item-images policies
CREATE POLICY "item_images_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'item-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "item_images_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'item-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "item_images_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'item-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- monster-images policies
CREATE POLICY "monster_images_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'monster-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "monster_images_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'monster-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "monster_images_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'monster-images' AND (storage.foldername(name))[1] = auth.uid()::text);
