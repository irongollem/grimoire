-- Migration: allow_jpeg_fallback_in_image_buckets
-- Add image/jpeg to allowed_mime_types on all image buckets so iOS devices
-- that lack canvas WebP encoding (Safari < 16.1) can upload JPEG fallbacks.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/webp', 'image/jpeg']
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
