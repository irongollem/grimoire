-- Migration: downtime_images_drop_broad_select
-- Resolve the `public_bucket_allows_listing` security-advisor finding raised by
-- 20260713000002.
--
-- That migration gave downtime-images a broad SELECT policy on storage.objects,
-- copying the older faction-images pattern. On a PUBLIC bucket that policy buys
-- nothing — objects are already served by URL without it — while granting every
-- client the ability to LIST the whole bucket via the storage API.
--
-- The app never lists this bucket: the canonical URLs are hardcoded in
-- src/data/downtimeActivities.ts and src/data/downtimeSeeds.ts. So the policy is
-- pure over-exposure. Dropping it leaves public URL reads working and removes the
-- listing capability.
--
-- The admin-only insert/update/delete policies on the `srd/` prefix stay as-is.

drop policy if exists "Public read for downtime images" on storage.objects;
