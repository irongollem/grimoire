-- Migration: pantheon_loot_buckets
-- Provision pantheon-emblems (deity portraits + holy symbols + pantheon emblems)
-- and loot-images (loot table chest illustrations) with the standard RLS pattern.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('pantheon-emblems', 'pantheon-emblems', true, 5242880, array['image/webp', 'image/jpeg']),
  ('loot-images',       'loot-images',       true, 5242880, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

-- pantheon-emblems policies
create policy "pantheon_emblems_insert" on storage.objects for insert
  with check (bucket_id = 'pantheon-emblems' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "pantheon_emblems_update" on storage.objects for update
  using (bucket_id = 'pantheon-emblems' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "pantheon_emblems_delete" on storage.objects for delete
  using (bucket_id = 'pantheon-emblems' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "pantheon_emblems_select" on storage.objects for select
  to authenticated
  using (bucket_id = 'pantheon-emblems' and (storage.foldername(name))[1] = auth.uid()::text);

-- loot-images policies
create policy "loot_images_insert" on storage.objects for insert
  with check (bucket_id = 'loot-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "loot_images_update" on storage.objects for update
  using (bucket_id = 'loot-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "loot_images_delete" on storage.objects for delete
  using (bucket_id = 'loot-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "loot_images_select" on storage.objects for select
  to authenticated
  using (bucket_id = 'loot-images' and (storage.foldername(name))[1] = auth.uid()::text);
