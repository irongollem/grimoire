-- Add subrace column to party_members so characters can track their species variant.
alter table party_members
  add column if not exists subrace text;
