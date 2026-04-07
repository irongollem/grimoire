-- Replace single damage_type (text) with damage_types (text[]) to support
-- traps that deal multiple damage types (e.g. pit trap: bludgeoning + piercing).

alter table traps
  add column damage_types text[] not null default '{}';

-- Migrate existing single values into the new array column
update traps
  set damage_types = array[damage_type]
  where damage_type is not null;

alter table traps
  drop column damage_type;
