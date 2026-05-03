-- Migration: locations_related_ids
-- Add related_location_ids array to locations for non-hierarchical location links

alter table locations
  add column if not exists related_location_ids uuid[] not null default '{}';
