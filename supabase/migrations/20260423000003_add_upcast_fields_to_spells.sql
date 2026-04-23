-- Migration: add_upcast_fields_to_spells
-- Adds machine-readable upcast scaling data alongside the existing higher_levels prose field.

alter table spells add column if not exists higher_level_damage jsonb null;
alter table spells add column if not exists higher_level_healing text null;
