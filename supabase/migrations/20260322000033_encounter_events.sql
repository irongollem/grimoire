-- Add events column to encounters
alter table encounters
  add column if not exists events jsonb not null default '[]'::jsonb;

-- Add events_fired column to encounter_state
alter table encounter_state
  add column if not exists events_fired jsonb not null default '[]'::jsonb;
