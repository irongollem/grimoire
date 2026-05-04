-- Migration: faction_images_bucket
-- Provision the faction-images storage bucket with RLS policies (mirrors trap-images / location-images pattern)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'faction-images',
  'faction-images',
  true,
  5242880,
  array['image/webp', 'image/jpeg']
)
on conflict (id) do nothing;

create policy "Authenticated users can upload faction images"
  on storage.objects for insert
  with check (
    bucket_id = 'faction-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own faction images"
  on storage.objects for update
  using (
    bucket_id = 'faction-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own faction images"
  on storage.objects for delete
  using (
    bucket_id = 'faction-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Public read for faction images"
  on storage.objects for select
  using (bucket_id = 'faction-images');
