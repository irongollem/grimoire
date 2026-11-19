-- #1201, stage 2: a fight knows it has ended.
--
-- Until now a fight the DM had not put live existed only in their browser, and `is_running` meant two things at once:
-- "this fight is going on" and "the players can see it". With every run saved from the moment it is opened
-- (decision 9 on the issue), `is_running` keeps only the second meaning: the players' screens are in this fight.
-- A saved row with `is_running = false` can then be a fight still being set up or played in private, or one that is
-- over, and the row has to say which: opening an encounter whose last fight ended must start a new one, and opening
-- one that is under way must resume it.
--
-- `ended_at` is set by End combat and by Abandon, and cleared when a new fight is opened on the row. Existing rows
-- that are not running were all ended ones (a private run never reached the database), so they are stamped with the
-- time they were last written.

alter table public.encounter_state
  add column ended_at timestamptz;

comment on column public.encounter_state.ended_at is
  'When this fight was ended or abandoned; null while it is being set up or played. is_running only says whether the players see it.';

update public.encounter_state set ended_at = updated_at where not is_running;
