-- Restrict image buckets to image MIME types only, with a 10 MB size cap.
-- Prevents non-image files being pushed via API manipulation.

update storage.buckets
set
  file_size_limit    = 10485760,  -- 10 MB
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/svg+xml'
  ]
where id in ('npc-portraits', 'asset-images');
