-- Migration: move_curse_revealed_to_party_inventory
-- curse_revealed is per-instance state (campaign-scoped), not part of the item template

-- Add the column to party_inventory (where it belongs)
alter table party_inventory
  add column if not exists curse_revealed boolean not null default false;

-- Backfill: copy any revealed curses to party_inventory rows referencing that item
update party_inventory pi
set curse_revealed = true
from items i
where pi.item_id = i.id
  and i.curse_revealed = true;

-- Remove from items template table
alter table items
  drop column if exists curse_revealed;
