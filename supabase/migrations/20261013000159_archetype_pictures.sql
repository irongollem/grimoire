-- Archetypes get a picture, the shape classes got in 20261011190104.
--
-- A subclass is class content, so its picture lives in the same `class-images`
-- bucket under the same rules: a DM's own archetype in their user folder, an
-- official one (user_id null, admin-written) under `srd/`, which that
-- migration's storage policies already gate on `private.is_app_admin()`. No new
-- bucket and no new policy.
--
-- Not rules content: setting a picture never marks an AI archetype as edited.

alter table public.custom_subclasses
  add column image_url text,
  add column focal_point jsonb;
