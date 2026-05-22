-- Migration: sound_thumbnail
-- Add thumbnail_url to sounds table and provision the sound-images storage bucket

alter table sounds add column thumbnail_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sound-images',
  'sound-images',
  true,
  5242880, -- 5 MB
  array['image/webp', 'image/jpeg']
)
on conflict (id) do nothing;

create policy "Authenticated users can upload sound images"
  on storage.objects for insert
  with check (
    bucket_id = 'sound-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own sound images"
  on storage.objects for update
  using (
    bucket_id = 'sound-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own sound images"
  on storage.objects for delete
  using (
    bucket_id = 'sound-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Public read for sound images"
  on storage.objects for select
  using (bucket_id = 'sound-images');
