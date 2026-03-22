-- Add portrait artwork support to companions.
-- Uses the existing asset-images bucket (already public + user-scoped policies).

alter table companions add column if not exists portrait_url          text;
alter table companions add column if not exists portrait_focal_point  jsonb;
