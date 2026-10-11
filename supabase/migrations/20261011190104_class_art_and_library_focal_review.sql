-- Classes get pictures, and the admin focal-point queue (#965) learns species,
-- backgrounds and classes.
--
-- Classes had no picture anywhere: not on system_classes (the library's core
-- classes, one row per edition), not on custom_classes (a DM's own, plus the
-- admin's shared rows with user_id null). Both get image_url + focal_point, the
-- shape species and backgrounds already use.
--
--   class-images   each user's folder, plus srd/ for app admins: system_classes
--                  is shared content, so its art is canonical and must never sit
--                  under a user uuid (CLAUDE.md, "Storage Path Convention").
--                  Same policies as species-images (20261005144201).
--
-- focal_point_checked_at is what the queue's "Unchecked" filter reads. It lives
-- on every library table the queue covers, as it does on the canonical monster
-- and spell art tables: NULL until a person has looked at the crop. Existing
-- species and background points were guessed by a model and never reviewed, so
-- starting them unchecked is accurate.
--
-- Bytes go to R2 (`STORAGE_WRITE_POLICY` in
-- supabase/functions/_shared/storage-policy.ts), so the bucket and its policies
-- bind the Supabase fallback only.

alter table public.system_classes
  add column image_url text,
  add column focal_point jsonb,
  add column focal_point_checked_at timestamptz;

alter table public.custom_classes
  add column image_url text,
  add column focal_point jsonb;

alter table public.library_species
  add column focal_point_checked_at timestamptz;

alter table public.library_backgrounds
  add column focal_point_checked_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('class-images', 'class-images', true, 5242880, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- class-images: a user's own folder.
create policy "class_images_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'class-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "class_images_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'class-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "class_images_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'class-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "class_images_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'class-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- class-images: canonical art under srd/, admin-only to write.
create policy "class_images_srd_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'class-images'
    and (storage.foldername(name))[1] = 'srd'
    and private.is_app_admin()
  );

create policy "class_images_srd_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'class-images'
    and (storage.foldername(name))[1] = 'srd'
    and private.is_app_admin()
  );

create policy "class_images_srd_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'class-images'
    and (storage.foldername(name))[1] = 'srd'
    and private.is_app_admin()
  );

create policy "class_images_srd_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'class-images'
    and (storage.foldername(name))[1] = 'srd'
  );
