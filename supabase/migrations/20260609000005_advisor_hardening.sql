-- Migration: advisor_hardening
-- Addresses two groups of Supabase security-advisor warnings:
--
-- 1. SECURITY DEFINER trigger functions executable by anon/authenticated
--    (lints 0028/0029). These six are pure trigger functions — they fire from
--    the trigger machinery, which does NOT require the calling role to hold
--    EXECUTE — and are never invoked as PostgREST RPCs. Revoking direct EXECUTE
--    removes the unintended /rest/v1/rpc surface with zero behavioural change.
--    (The sync_srd_*_art_to_shared_table functions are deliberately left alone —
--    they ARE called as RPCs by the frontend.)
--
-- 2. Public buckets with a broad list-everything SELECT policy
--    (lint 0025_public_bucket_allows_listing). Public buckets serve objects by
--    URL without any SELECT policy. chronicle & faction-images need listing only
--    of the caller's own folder (ArtPicker calls .list(userId)); scope the policy
--    to that. sound-images & tile-packs are never listed by the app, so drop the
--    list policy entirely (URL access is unaffected).

-- ── 1. Revoke EXECUTE on pure trigger functions ────────────────────────────
revoke execute on function public.create_dm_membership()     from public, anon, authenticated;
revoke execute on function public.create_free_subscription() from public, anon, authenticated;
revoke execute on function public.create_user_profile()      from public, anon, authenticated;
revoke execute on function public.enable_default_sources()   from public, anon, authenticated;
revoke execute on function public.enforce_quota()            from public, anon, authenticated;
revoke execute on function public.update_updated_at()        from public, anon, authenticated;

-- ── 2. Scope / drop public-bucket list policies ────────────────────────────
drop policy "chronicle_select" on storage.objects;
create policy "chronicle_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chronicle'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy "Public read for faction images" on storage.objects;
create policy "faction_images_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'faction-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy "Public read for sound images" on storage.objects;
drop policy "tile_packs_public_select" on storage.objects;
