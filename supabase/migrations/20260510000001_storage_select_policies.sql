-- Migration: storage_select_policies
-- Add SELECT policies to storage buckets that were missing them, so authenticated users can list their own files

create policy "npc_portraits_select" on storage.objects for select
  to authenticated
  using (bucket_id = 'npc-portraits' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "asset_images_select" on storage.objects for select
  to authenticated
  using (bucket_id = 'asset-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "spell_images_select" on storage.objects for select
  to authenticated
  using (bucket_id = 'spell-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "puzzle_images_select" on storage.objects for select
  to authenticated
  using (bucket_id = 'puzzle-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "item_images_select" on storage.objects for select
  to authenticated
  using (bucket_id = 'item-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "monster_images_select" on storage.objects for select
  to authenticated
  using (bucket_id = 'monster-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "trap_images_select" on storage.objects for select
  to authenticated
  using (bucket_id = 'trap-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "location_images_select" on storage.objects for select
  to authenticated
  using (bucket_id = 'location-images' and (storage.foldername(name))[1] = auth.uid()::text);
