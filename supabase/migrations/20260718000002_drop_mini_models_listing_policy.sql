-- Migration: drop_mini_models_listing_policy
-- Security-advisor fix (public_bucket_allows_listing): a public bucket serves
-- object URLs without any storage.objects select policy — the broad policy only
-- added the ability to LIST the bucket, which no other public bucket allows.

drop policy if exists "Public read for mini models" on storage.objects;
