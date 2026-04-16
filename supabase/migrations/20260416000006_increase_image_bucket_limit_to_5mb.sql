-- Migration: increase_image_bucket_limit_to_5mb
-- Raise image bucket limit from 3 MB to 5 MB. The 3 MB assumption was based
-- on generated art; real camera photos (e.g. iPhone 17) produce WebP files
-- up to ~3.5 MB at 1920px/85%, and images are also used for print at tarot
-- card size which requires 1920px for adequate 300 DPI output.

UPDATE storage.buckets
SET file_size_limit = 5242880  -- 5 MB
WHERE id IN (
  'npc-portraits',
  'asset-images',
  'spell-images',
  'puzzle-images',
  'dungeon-feature-images',
  'item-images',
  'monster-images',
  'trap-images',
  'location-images'
);
