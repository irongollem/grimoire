-- Migration: add_subclass_hp_per_level
-- Add hp_per_level to custom_subclasses for features like Draconic Resilience (+1 HP/level)

alter table custom_subclasses add column hp_per_level integer default null;

-- Draconic Resilience: +1 max HP per sorcerer level (PHB Draconic Bloodline, SRD 5.1)
update custom_subclasses
set hp_per_level = 1
where class_name = 'Sorcerer' and subclass_name = 'Draconic Bloodline';

-- Patch Bolan's level_choices so de-leveling correctly accounts for the +1/level bonus
-- that was already applied to his max_hp (16) but not recorded in hp_gained
update party_members
set level_choices = jsonb_set(
  jsonb_set(level_choices, '{1,hp_gained}', '9'),
  '{2,hp_gained}', '7'
)
where id = '5681a6ab-1682-440a-94bd-e351d0b3a2b6';
