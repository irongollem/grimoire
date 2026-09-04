-- Arriving somewhere is an event. Story #790, epic #780.
--
-- Nothing fired when the party moved. Both position columns were plain, with
-- no trigger, no history and no subscriber — so `audio_theme` had sat on every
-- location since July 2026 with nothing to drive it, and "where have we been"
-- had no answer at all.
--
-- What this deliberately does NOT do is add a second history. #787 already
-- keeps an append-only log of what has been explored, cleared and looted, and
-- arriving somewhere is precisely what makes it explored. A separate arrivals
-- table would be a second store for the same fact — the shape this epic exists
-- to remove — so arrival writes into the log that already exists.
--
-- Only the *first* arrival writes. The log answers "has the party been here",
-- not "how many times", and appending on every visit would bury a DM's own
-- assertions under machine noise. If per-visit history is ever wanted it is a
-- different fact and wants its own row shape, not a flood of duplicates here.

create function public.mark_arrival_explored()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  -- Fails safe rather than blocking the move. A path with no authenticated
  -- user (none today) could not satisfy location_state_events' insert policy,
  -- and a party that cannot move is a far worse outcome than a missing log row.
  if v_uid is null or new.current_location_id is null then
    return new;
  end if;

  -- Already explored: nothing to say. This reads the newest assertion rather
  -- than mere existence — a DM who explicitly marked a place unexplored has
  -- said something, and walking back in should record that they returned.
  if exists (
    select 1 from public.location_state
    where location_id = new.current_location_id
      and fact = 'explored'
      and value
  ) then
    return new;
  end if;

  insert into public.location_state_events (user_id, location_id, fact, value, note)
  values (v_uid, new.current_location_id, 'explored', true, 'The party arrived here');

  return new;
end;
$$;

revoke execute on function public.mark_arrival_explored() from public, anon, authenticated;

-- `is distinct from` rather than `<>`, so the first move from NULL counts as an
-- arrival. `<>` evaluates to NULL there and the trigger would silently skip the
-- one arrival a fresh campaign is guaranteed to have.
create trigger campaigns_arrival_marks_explored
  after update of current_location_id on public.campaigns
  for each row
  when (old.current_location_id is distinct from new.current_location_id)
  execute procedure public.mark_arrival_explored();

comment on function public.mark_arrival_explored() is
  'Records the party arriving somewhere as an explored assertion in location_state_events (#790). First arrival only; reuses the #787 log rather than adding a second history.';
