-- #978: backgrounds get their own image bucket, `background-images`, with the
-- admin-only srd/ prefix for canonical art, as items, spells and monsters have.
--
-- Background portraits used to upload into asset-images, the Scriptorium's
-- embed bucket, which generates no variants and has no srd/ prefix. When epic
-- #973 moved backgrounds into library_backgrounds (20261005083556), the art an
-- admin had put on the imported rows came along by URL: on 5 Oct 2026 all 42
-- library_backgrounds.image_url values pointed into the admin's own folder of
-- asset-images. Canonical art must never sit under a user uuid (CLAUDE.md,
-- "Storage Path Convention"); a bulk delete under that folder is how #947 lost
-- 117 references.
--
-- The objects are copied, and library_backgrounds re-pointed, by
-- `npm run library:move-art` (scripts/move-library-art-to-srd.ts), which never
-- deletes. A user's own background art already in asset-images stays where it
-- is; new uploads land here.
--
-- Bytes go to R2 (`STORAGE_WRITE_POLICY` in
-- supabase/functions/_shared/storage-policy.ts), so this bucket and its
-- policies bind the Supabase fallback only, the way library-tile-packs was
-- added (20260917224309).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'background-images',
  'background-images',
  true,
  5242880,
  array['image/webp', 'image/jpeg']
)
on conflict (id) do nothing;

-- A user's own folder, the four policies every entity image bucket carries.
create policy "background_images_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'background-images'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

create policy "background_images_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'background-images'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

create policy "background_images_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'background-images'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

create policy "background_images_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'background-images'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

-- Canonical art under srd/, admin-only to write.
create policy "background_images_srd_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'background-images'
    and (storage.foldername(name))[1] = 'srd'
    and private.is_app_admin()
  );

create policy "background_images_srd_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'background-images'
    and (storage.foldername(name))[1] = 'srd'
    and private.is_app_admin()
  );

create policy "background_images_srd_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'background-images'
    and (storage.foldername(name))[1] = 'srd'
    and private.is_app_admin()
  );

create policy "background_images_srd_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'background-images'
    and (storage.foldername(name))[1] = 'srd'
  );
