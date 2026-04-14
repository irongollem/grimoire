-- Migration: dungeon_feature_images_bucket
-- Create the dungeon-feature-images storage bucket referenced by DungeonFeatureDetailView

insert into storage.buckets (id, name, public)
values ('dungeon-feature-images', 'dungeon-feature-images', true)
on conflict (id) do nothing;

create policy "dungeon_feature_images_select" on storage.objects
  for select using (bucket_id = 'dungeon-feature-images');

create policy "dungeon_feature_images_insert" on storage.objects
  for insert with check (bucket_id = 'dungeon-feature-images' and auth.uid() = owner);

create policy "dungeon_feature_images_update" on storage.objects
  for update using (bucket_id = 'dungeon-feature-images' and auth.uid() = owner);

create policy "dungeon_feature_images_delete" on storage.objects
  for delete using (bucket_id = 'dungeon-feature-images' and auth.uid() = owner);
