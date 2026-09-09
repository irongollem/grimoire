-- A door has play state. Epic #868, frames 08 (Run) and 16 (Fog) of
-- `atlas/Sites & Cartographer.html`.
--
-- `starts_locked` and `is_secret` are what the DM prepared (#785), and they
-- stay that. Whether the party has since *opened* the brass-keyed door or
-- *found* the ash-screen is play state, and 20260904062741 gave play state
-- one home: the append-only `location_state_events` log, with provenance and
-- an undo that appends the opposite rather than editing history. #787
-- deliberately did not extend that log to doors, because nothing read door
-- state yet. The run surface now does -- Unlock and Reveal are its two door
-- buttons -- and reachability wants to know that a locked door has been
-- opened, and the player projection wants to know that a secret door has
-- been found so it can start sending it.
--
-- So: a nullable `door_id`, two door facts, one guard. No new table -- the
-- sheet's "0 new tables" holds, and a second log for the same kind of fact is
-- the shape #780 existed to remove.
--
-- `location_id` stays NOT NULL and, for a door fact, is the *site* the door's
-- two spaces share. That keeps the row inside the RLS the log already has
-- (insert requires the DM of that location's campaign), keeps
-- `useLocationStateForRooms`-style site-wide reads to one `.in()` query, and
-- keeps "what is the state of this dungeon" answerable from one column.

alter table public.location_state_events
  add column door_id uuid references public.location_doors(id) on delete cascade;

alter table public.location_state_events
  drop constraint location_state_events_fact_check,
  add constraint location_state_events_fact_check check (
    (door_id is null     and fact in ('explored', 'cleared', 'looted'))
    or
    (door_id is not null and fact in ('unlocked', 'found'))
  );

comment on column public.location_state_events.door_id is
  'Set for a door fact (unlocked, found); location_id is then the site the door''s two spaces share. Null for a location fact.';

create index location_state_events_door_lookup_idx
  on public.location_state_events (door_id, fact, seq desc)
  where door_id is not null;

-- The site a door belongs to is the parent its two endpoints share; the
-- endpoint guard already guarantees they share one. A door fact must be
-- logged against exactly that site, or the site-wide read misses it.
create or replace function public.guard_location_state_event_door()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  v_site uuid;
begin
  if new.door_id is null then
    return new;
  end if;

  select l.parent_id into v_site
    from public.location_doors d
    join public.locations l on l.id = d.from_location_id
   where d.id = new.door_id;

  if v_site is null or v_site is distinct from new.location_id then
    raise exception 'A door fact is logged against the site the door belongs to'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_location_state_event_door() from public, anon, authenticated;

create trigger location_state_events_door_guard
  before insert on public.location_state_events
  for each row execute procedure public.guard_location_state_event_door();

-- ── The view, widened ───────────────────────────────────────────────────────
--
-- Newest assertion per (location, door, fact). `distinct on` treats two nulls
-- as equal, so every existing (location, fact) pair resolves exactly as it
-- did; door facts add rows with a door_id and never collide with location
-- facts because the two fact sets are disjoint. `security_invoker` is
-- restated because `create or replace view` resets it -- that is how
-- ai_generation_costs leaked (20260828202800), and
-- view_security_invoker.test.sql would catch it, but not before a red CI.
create or replace view public.location_state
with (security_invoker = true) as
select distinct on (location_id, door_id, fact)
  location_id,
  fact,
  value,
  user_id     as asserted_by,
  note        as asserted_note,
  created_at  as asserted_at,
  -- Last, because `create or replace view` may only append columns.
  door_id
from public.location_state_events
order by location_id, door_id, fact, seq desc;

comment on view public.location_state is
  'Newest assertion per (location, door, fact) from location_state_events. Derived, never stored, so it cannot drift from its log. door_id is null for a location fact.';

revoke all on public.location_state from public, anon, authenticated;
grant select on public.location_state to authenticated, service_role;
