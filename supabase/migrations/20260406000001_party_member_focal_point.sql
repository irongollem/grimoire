-- Add portrait focal point to party_members so DMs can set a manual crop
-- focus for each character's portrait image.
alter table party_members
  add column if not exists portrait_focal_point jsonb null;
