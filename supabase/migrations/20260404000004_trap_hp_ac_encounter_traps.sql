-- Add HP and AC fields to traps (for physical destruction mechanics)
alter table traps
  add column if not exists trap_hp integer,
  add column if not exists trap_ac integer;

-- Add trap_ids to encounters (hazard slots for difficulty calculation)
alter table encounters
  add column if not exists trap_ids uuid[] not null default '{}';
