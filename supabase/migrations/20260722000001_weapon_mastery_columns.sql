-- Migration: weapon_mastery_columns
-- 2024 weapon mastery (#557): mastery property on items, per-character mastery tracking on party_members.

-- 2024 PHB weapon mastery property (weapons only); nullable text matching the
-- versatile_damage/weapon_range pattern. Validity of the 8 mastery values is
-- enforced by the TS type (WeaponMasteryProperty), consistent with how
-- properties is handled.
alter table items
  add column mastery text;

-- Weapon names (matching items.name) this character has mastery with;
-- mirrors tool_proficiencies/languages.
alter table party_members
  add column weapon_masteries text[] not null default '{}'::text[];
