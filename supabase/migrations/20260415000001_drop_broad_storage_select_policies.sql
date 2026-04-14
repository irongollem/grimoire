-- Migration: drop_broad_storage_select_policies
-- Drop overly broad SELECT policies on public storage buckets.
-- Public buckets serve files via getPublicUrl() without RLS — a SELECT policy
-- is only needed for listing, which the app never does. Removing these policies
-- prevents clients from enumerating all files in a bucket.

drop policy if exists "Public read for asset images" on storage.objects;
drop policy if exists "sounds_storage_select" on storage.objects;
drop policy if exists "Public read for spell images" on storage.objects;
drop policy if exists "Public read for puzzle images" on storage.objects;
drop policy if exists "dungeon_feature_images_select" on storage.objects;
