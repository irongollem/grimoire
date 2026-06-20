-- Migration: secure_storage_and_app_settings
-- Two cross-tenant write holes:
--
-- 1. tile-packs bucket: insert/update/delete policies checked only bucket_id, so
--    any authenticated user could overwrite or delete ANY object in the bucket
--    (IDOR / asset destruction). Scope writes to the caller's own {userId}/ folder
--    like every other bucket. The bucket is currently empty, and the Cartographer
--    upload code (not yet wired) MUST store packs under `${auth.uid()}/...`.
--
-- 2. app_settings: write policies were `auth.uid() IS NOT NULL`, i.e. any logged-in
--    user could write this global key/value config singleton. In the direct-to-
--    Postgres model RLS is the only boundary, so gate writes on is_app_admin().

-- ── 1. tile-packs owner-scoped writes ────────────────────────────────────────
drop policy if exists "tile_packs_authenticated_insert" on storage.objects;
drop policy if exists "tile_packs_authenticated_update" on storage.objects;
drop policy if exists "tile_packs_authenticated_delete" on storage.objects;

create policy "tile_packs_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tile-packs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "tile_packs_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'tile-packs'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'tile-packs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "tile_packs_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'tile-packs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 2. app_settings admin-only writes ────────────────────────────────────────
drop policy if exists "app_settings_insert" on public.app_settings;
drop policy if exists "app_settings_update" on public.app_settings;

create policy "app_settings_insert" on public.app_settings
  for insert with check (is_app_admin());

create policy "app_settings_update" on public.app_settings
  for update using (is_app_admin()) with check (is_app_admin());
