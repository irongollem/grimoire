-- ── Add caster_type, prepared_ability, prepared_divisor to both class tables ──

alter table system_classes
  add column if not exists caster_type      text not null default 'none',
  add column if not exists prepared_ability text,
  add column if not exists prepared_divisor smallint;

alter table custom_classes
  add column if not exists caster_type      text not null default 'none',
  add column if not exists prepared_ability text,
  add column if not exists prepared_divisor smallint;

-- ── Seed system_classes with correct caster_type values ───────────────────────

-- Full prepared casters: ability mod + level
update system_classes set caster_type = 'prepared', prepared_ability = 'wis', prepared_divisor = 1 where class_name = 'Cleric';
update system_classes set caster_type = 'prepared', prepared_ability = 'wis', prepared_divisor = 1 where class_name = 'Druid';

-- Half prepared casters: ability mod + floor(level / 2)
update system_classes set caster_type = 'prepared', prepared_ability = 'cha', prepared_divisor = 2 where class_name = 'Paladin';
update system_classes set caster_type = 'prepared', prepared_ability = 'int', prepared_divisor = 2 where class_name = 'Artificer';

-- Spellbook: prepares a subset each day (INT mod + level)
update system_classes set caster_type = 'spellbook', prepared_ability = 'int', prepared_divisor = 1 where class_name = 'Wizard';

-- Known casters: learn a fixed number, always prepared once known
update system_classes set caster_type = 'known' where class_name in ('Bard', 'Ranger', 'Sorcerer', 'Warlock');

-- Non-casters remain 'none' (Barbarian, Fighter, Monk, Rogue)
