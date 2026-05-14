-- Migration: srd_canonical_art_storage_path
-- Allow admin to read/write canonical SRD art under the 'srd/' prefix in monster-images

create policy "monster_images_srd_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'monster-images'
    and (storage.foldername(name))[1] = 'srd'
    and public.is_app_admin()
  );

create policy "monster_images_srd_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'monster-images'
    and (storage.foldername(name))[1] = 'srd'
    and public.is_app_admin()
  );

create policy "monster_images_srd_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'monster-images'
    and (storage.foldername(name))[1] = 'srd'
    and public.is_app_admin()
  );

create policy "monster_images_srd_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'monster-images'
    and (storage.foldername(name))[1] = 'srd'
  );
