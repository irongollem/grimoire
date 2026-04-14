-- Migration: tighten_image_bucket_limits
-- Reduce all WebP image buckets from 10 MB to 3 MB and enforce webp-only MIME
-- on dungeon-feature-images (previously had no restrictions server-side).
-- WebP at 1920px / 85% quality peaks well under 2 MB in practice; 3 MB gives
-- headroom without allowing multi-megabyte raw uploads through the API.

UPDATE storage.buckets
SET
  file_size_limit    = 3145728,        -- 3 MB
  allowed_mime_types = ARRAY['image/webp']
WHERE id IN (
  'npc-portraits',
  'asset-images',
  'spell-images',
  'puzzle-images',
  'dungeon-feature-images',
  'item-images',
  'monster-images'
);
