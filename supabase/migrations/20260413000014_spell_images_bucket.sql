-- ── spell-images storage bucket ───────────────────────────────────────────────
-- Dedicated bucket for AI-generated spell-effect art.
--
-- Splitting spells out of the catch-all `asset-images` bucket so the DM can
-- browse spell art in isolation later (the spellbook is by far the largest
-- per-campaign image set once AI generation is in regular use). Monsters /
-- items / puzzles / locations stay in `asset-images` for now — separating
-- those is a future task if browsing them gets noisy too.
--
-- Mirrors the policy + MIME / size restrictions of `asset-images` and
-- `npc-portraits` (see 20260308000000_asset_images_bucket.sql and
-- 20260411000002_image_bucket_mime_limits.sql).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'spell-images',
  'spell-images',
  true,
  10485760, -- 10 MB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/svg+xml'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload into their own folder (user_id prefix)
CREATE POLICY "Authenticated users can upload spell images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'spell-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Anyone can read (bucket is public)
CREATE POLICY "Public read for spell images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'spell-images');

-- Users can delete their own uploads
CREATE POLICY "Users can delete their own spell images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'spell-images' AND (storage.foldername(name))[1] = auth.uid()::text);
