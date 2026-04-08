-- Add sort_order to party_inventory for drag-and-drop reordering.
-- Default is 1000000000 so newly added items naturally sink to the bottom of a sorted list.
alter table party_inventory
  add column if not exists sort_order integer not null default 1000000000;
