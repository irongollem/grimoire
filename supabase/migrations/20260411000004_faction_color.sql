-- Add colour column to factions so setting-populated factions carry their seed colour.
alter table factions add column if not exists color text;
