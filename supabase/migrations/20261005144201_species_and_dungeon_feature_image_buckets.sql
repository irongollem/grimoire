-- #978 follow-through: species and dungeon features get their own image
-- buckets, as backgrounds did in 20261005142210.
--
-- Both uploaded into asset-images, the Scriptorium's embed bucket, which makes
-- no size variants (so every card showed the full-size original until
-- FocalImage healed it) and has no admin srd/ prefix for canonical art.
--
--   species-images           each user's folder, plus srd/ for app admins:
--                            library_species is shared content, so its art is
--                            canonical and must never sit under a user uuid
--                            (CLAUDE.md, "Storage Path Convention"). On 5 Oct
--                            2026 no library_species row carried art, so
--                            nothing has to move.
--   dungeon-feature-images   each user's folder only: there is no library of
--                            dungeon features, so no canonical art. Production
--                            already had this bucket, empty and unused, from
--                            the baseline squash, with three policies keyed on
--                            `auth.uid() = owner`. Every other entity bucket
--                            keys on the first folder of the path, which is
--                            also what the R2 write path enforces, so those
--                            three are replaced and the bucket's config is
--                            brought in line with the registry.
--
-- A user's existing art in asset-images stays where it is and keeps working;
-- new uploads and generations land here, and deletes find the bucket from the
-- URL (deleteUnreferencedByPublicUrl).
--
-- Bytes go to R2 (`STORAGE_WRITE_POLICY` in
-- supabase/functions/_shared/storage-policy.ts), so these buckets and their
-- policies bind the Supabase fallback only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('species-images', 'species-images', true, 5242880, array['image/webp', 'image/jpeg']),
  ('dungeon-feature-images', 'dungeon-feature-images', true, 5242880, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "dungeon_feature_images_insert" on storage.objects;
drop policy if exists "dungeon_feature_images_update" on storage.objects;
drop policy if exists "dungeon_feature_images_delete" on storage.objects;

-- species-images: a user's own folder.
create policy "species_images_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'species-images'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

create policy "species_images_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'species-images'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

create policy "species_images_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'species-images'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

create policy "species_images_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'species-images'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

-- species-images: canonical art under srd/, admin-only to write.
create policy "species_images_srd_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'species-images'
    and (storage.foldername(name))[1] = 'srd'
    and private.is_app_admin()
  );

create policy "species_images_srd_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'species-images'
    and (storage.foldername(name))[1] = 'srd'
    and private.is_app_admin()
  );

create policy "species_images_srd_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'species-images'
    and (storage.foldername(name))[1] = 'srd'
    and private.is_app_admin()
  );

create policy "species_images_srd_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'species-images'
    and (storage.foldername(name))[1] = 'srd'
  );

-- dungeon-feature-images: a user's own folder.
create policy "dungeon_feature_images_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'dungeon-feature-images'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

create policy "dungeon_feature_images_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'dungeon-feature-images'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

create policy "dungeon_feature_images_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'dungeon-feature-images'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

create policy "dungeon_feature_images_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'dungeon-feature-images'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );
