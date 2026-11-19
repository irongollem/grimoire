-- #1201, stage 1: a fight counts its writes.
--
-- Three writers share one encounter_state row: the runner's roster push, the map push (magical_darkness) and
-- update_combatant_position. None of them could tell that the row had changed under it, so "two runners editing at
-- once are still last-writer-wins on the roster" (combat-encounters.md), and a token moved between a roster push's
-- read and its write was only saved by the push copying positions back by hand.
--
-- `version` rises by one on every update, whoever makes it: a row trigger, not a rule each writer must remember.
-- A writer that read version N and writes "where version = N" changes nothing if anyone got there first, and knows
-- it. The server's command function (the one roster writer once the runner moves to commands) loads, applies the
-- command to what it loaded, and writes on that condition, retrying on fresher state: a command is an intention
-- ("next turn", "4 damage to the ogre"), so replaying it is correct, which replaying a whole roster never was.
--
-- `lair_fired_rounds` is the one piece of the turn reducer's own state that no column held: the rounds in which the
-- lair action has been used. It lived only in the DM's browser, so a reload forgot it and the lair could act twice
-- in a round. Nothing writes it yet; the command function will.

alter table public.encounter_state
  add column version bigint not null default 0,
  add column lair_fired_rounds integer[] not null default '{}';

comment on column public.encounter_state.version is
  'Rises by one on every update (trigger). Write "where version = <the one you read>" to notice a concurrent change.';
comment on column public.encounter_state.lair_fired_rounds is
  'Rounds in which the lair action has been used: reducer state that used to live only in the DM''s browser.';

create function private.count_encounter_state_write()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  -- Always from the stored row, never from what the writer sent: a client that posts its own number, or an old
  -- copy of the row, cannot move the count backwards or skip ahead.
  new.version := old.version + 1;
  return new;
end;
$$;

revoke execute on function private.count_encounter_state_write() from public, anon, authenticated;

create trigger encounter_state_count_write
  before update on public.encounter_state
  for each row execute function private.count_encounter_state_write();
