-- ── Image buckets: webp-only lockdown ─────────────────────────────────────────
--
-- Every image upload in the app routes through `toWebP()` (`src/lib/mediaConvert.ts`)
-- before reaching storage:
--   - AI generators decode model output to a WebP blob via `b64ToBlob`
--   - User uploads (`useImageUpload`, `RichTextEditor`, `FactionDetailView`)
--     convert the source File to WebP first
--
-- So the three image buckets (`npc-portraits`, `asset-images`, `spell-images`,
-- and the previously-undeclared `puzzle-images`) only ever legitimately receive
-- `image/webp`. Tightening the server-side allowlist closes the gap where an
-- API client could push raw jpegs / pngs / svgs by skipping our converter.
--
-- Existing non-WebP files in these buckets remain readable — the MIME
-- restriction only applies to *new* uploads.

-- ── puzzle-images was created out-of-band; declare it idempotently so a
--    fresh deployment from migrations alone has it. Same shape as the other
--    image buckets.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'puzzle-images',
  'puzzle-images',
  true,
  10485760,
  ARRAY['image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for puzzle-images (idempotent — drops + recreates so a
-- second run doesn't fail on duplicate policy name).
DROP POLICY IF EXISTS "Authenticated users can upload puzzle images" ON storage.objects;
CREATE POLICY "Authenticated users can upload puzzle images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'puzzle-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Public read for puzzle images" ON storage.objects;
CREATE POLICY "Public read for puzzle images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'puzzle-images');

DROP POLICY IF EXISTS "Users can delete their own puzzle images" ON storage.objects;
CREATE POLICY "Users can delete their own puzzle images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'puzzle-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ── Lock down all four image buckets to webp-only.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/webp']
WHERE id IN ('npc-portraits', 'asset-images', 'spell-images', 'puzzle-images');
