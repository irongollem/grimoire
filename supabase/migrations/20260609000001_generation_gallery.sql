-- Migration: generation_gallery
-- Back the account-wide generation Gallery with image_generation_jobs:
-- drop the restrictive kind CHECK (new art-bearing entity kinds are added over
-- time; allowed values are owned by a TS const instead) and add an index for
-- the per-user, per-kind, recent-first gallery query. RLS is already owner-only.

alter table image_generation_jobs
  drop constraint if exists image_generation_jobs_kind_check;

create index if not exists image_generation_jobs_user_kind_idx
  on image_generation_jobs (user_id, status, created_at desc);
