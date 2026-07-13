-- Migration: downtime_images_bucket
-- Provision the downtime-images bucket for The Interlude's canonical art (#486).
--
-- Every image in this bucket is CANONICAL: the eight archetype card faces and
-- the seed portraits/item art are identical for every campaign, admin-managed,
-- and referenced by URL from the static catalogs in `src/data/`. So the bucket
-- deliberately has NO per-user upload path — only the `srd/` prefix, writable by
-- an app admin. (`srd/` is this codebase's existing name for "canonical, shared,
-- admin-managed", per the storage convention in CLAUDE.md — the content itself is
-- our own, not System Reference Document material.)
--
-- Canonical art must never live under a user UUID: if that account changes, every
-- canonical URL in the DB breaks.
--
-- Public read, because a cloned seed NPC/item in any campaign points at the same
-- canonical URL.
--
-- NOTE: the admin check is `private.is_app_admin()`, not `public.` — the RLS
-- helpers were relocated to the non-exposed `private` schema (20260629000002).
-- The older monster-images / spell-images policies still name `public.` and
-- predate that move.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'downtime-images',
  'downtime-images',
  true,
  5242880,
  array['image/webp', 'image/jpeg']
)
on conflict (id) do nothing;

create policy "downtime_images_srd_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'downtime-images'
    and (storage.foldername(name))[1] = 'srd'
    and private.is_app_admin()
  );

create policy "downtime_images_srd_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'downtime-images'
    and (storage.foldername(name))[1] = 'srd'
    and private.is_app_admin()
  );

create policy "downtime_images_srd_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'downtime-images'
    and (storage.foldername(name))[1] = 'srd'
    and private.is_app_admin()
  );

create policy "Public read for downtime images"
  on storage.objects for select
  using (bucket_id = 'downtime-images');
