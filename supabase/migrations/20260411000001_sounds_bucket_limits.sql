-- Enforce audio-only uploads and a 20 MB size cap on the sounds bucket.
-- file_size_limit is in bytes; allowed_mime_types rejects non-audio containers
-- (e.g. video/mp4) at the storage layer regardless of client-side validation.

update storage.buckets
set
  file_size_limit    = 20971520,  -- 20 MB
  allowed_mime_types = array[
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/x-wav',
    'audio/flac',
    'audio/x-flac',
    'audio/aac',
    'audio/webm',
    'audio/x-m4a',
    'audio/mp4'   -- m4a files sometimes arrive as audio/mp4 (not video/mp4)
  ]
where id = 'sounds';
