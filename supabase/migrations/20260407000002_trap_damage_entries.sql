-- Replace separate damage_dice (text) + damage_types (text[]) with a single
-- damage_entries jsonb column: [{ dice: string, type: string }, ...]
-- This allows traps to have multiple independent damage components, each with
-- their own dice expression and type (e.g. pit trap: 1d6 bludgeoning + 1d10 piercing).

alter table traps
  add column damage_entries jsonb not null default '[]';

-- Migrate existing data: each trap had at most one damage component
-- (damage_types[1] is the first element — PostgreSQL arrays are 1-indexed)
update traps
  set damage_entries = jsonb_build_array(
    jsonb_build_object('dice', damage_dice, 'type', coalesce(damage_types[1], ''))
  )
  where damage_dice is not null;

alter table traps drop column damage_dice;
alter table traps drop column damage_types;
