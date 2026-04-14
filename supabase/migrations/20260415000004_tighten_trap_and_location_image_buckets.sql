-- Migration: tighten_trap_and_location_image_buckets
-- Lock down trap-images and location-images to 3 MB / webp-only, matching all
-- other image buckets. Both were created out-of-band with no restrictions
-- (50 MB, any MIME type).
--
-- NOTE: broad SELECT policies on these two buckets still need to be dropped
-- via the dashboard (or a follow-up migration once their names are known) —
-- public buckets don't need a SELECT policy for getPublicUrl() access.

UPDATE storage.buckets
SET
  file_size_limit    = 3145728,        -- 3 MB
  allowed_mime_types = ARRAY['image/webp']
WHERE id IN ('trap-images', 'location-images');
