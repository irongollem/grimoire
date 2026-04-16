-- Migration: add_monster_ids_to_loot_tables
-- Adds a monster_ids uuid[] column to loot_tables so DMs can associate loot tables with specific monsters

alter table loot_tables
  add column if not exists monster_ids uuid[] not null default '{}';
