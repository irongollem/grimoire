-- Durable site state. Story #787, epic #780.
--
-- What is explored, cleared and looted is a fact about the *world*, not about
-- the quest that happened to be running. A party is in one place and on many
-- quests at once, and two chains routinely converge on the same vault — so if
-- this hung off a beat, the two would hold contradictory ideas of the same
-- rooms. It hangs off the room.
--
-- An append-only LOG rather than booleans on `locations`, for three reasons:
--
--   1. "Looted three weeks ago" is a claim someone will need to take back, and
--      undo against a boolean is just another write with no record that the
--      first one happened.
--   2. Provenance — who said so, and when — is the difference between state a
--      DM trusts and state they second-guess.
--   3. #797 later wants to know which quest a fact was asserted during. On a
--      log that is `alter table add column`; on a boolean it is a backfill that
--      cannot be done, because the information was never kept.
--
-- Undo is appending the opposite assertion, not deleting the original. The log
-- is the history; the view below is the answer.
--
-- Deliberately NOT recorded: a session id. `campaign_session_state` has
-- UNIQUE (campaign_id), so there is one row per campaign reused across every
-- evening — its id never changes, and storing it would say nothing about which
-- session a fact belongs to.

create table public.location_state_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,

  -- Deliberately not room-only: a district can be cleared and a whole dungeon
  -- can be looted. The panel decides where it is worth showing.
  fact        text not null check (fact in ('explored', 'cleared', 'looted')),
  -- What this event asserts. `false` is how a claim is taken back.
  value       boolean not null,
  -- "we only got as far as the nave", "the Drowned Bell party had it first"
  note        text,

  created_at  timestamptz not null default now(),

  -- Insertion order, and the reason it is not `created_at`: that defaults to
  -- now(), which is *transaction* time, so two assertions written in one
  -- transaction carry the identical timestamp and the tiebreak falls to a
  -- random uuid. "The newest assertion wins" then decides by coin flip. A
  -- sequence is a total order that always agrees with the order things
  -- actually happened. `created_at` stays, because it is what a DM reads.
  seq         bigint generated always as identity
);

comment on table public.location_state_events is
  'Append-only log of what has been explored, cleared or looted, per location. Undo is appending the opposite assertion. The current answer is the location_state view.';

-- The view reads the newest row per (location, fact), so this index is the
-- access path for both the view and any single-location lookup.
create index location_state_events_lookup_idx
  on public.location_state_events (location_id, fact, seq desc);

-- Append-only, exactly as quest_beat_transitions is: no UPDATE or DELETE
-- policy, and the grants revoked so a client cannot rewrite history even if a
-- policy is added carelessly later. Rows still disappear when their location or
-- author does, via the FK cascades — that is not history being edited, it is
-- the thing the history was about ceasing to exist.
alter table public.location_state_events enable row level security;
revoke update, delete on public.location_state_events from authenticated, anon;

-- Readable by the author OR any DM of the campaign the location belongs to,
-- which is deliberately wider than the neighbouring content tables.
--
-- `traps`, `puzzle_rooms` and `location_placements` are owner-scoped on select
-- because they are authored *possessions* — a trap you wrote is yours. This is
-- not that. It is a record of what happened to a shared world, and the whole
-- claim of #787 is that the place remembers rather than the quest. Two co-DMs
-- each seeing only their own assertions would mean the vault is looted for one
-- of them and pristine for the other, which is precisely the split-brain the
-- story exists to prevent.
create policy "location_state_events_select" on public.location_state_events
  for select using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from public.locations l
      where l.id = location_id
        and l.campaign_id is not null
        and private.is_campaign_dm(l.campaign_id)
    )
  );

create policy "location_state_events_insert" on public.location_state_events
  for insert with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.locations l
      where l.id = location_id
        and (l.campaign_id is null or private.is_campaign_dm(l.campaign_id))
    )
  );

-- The current answer, derived rather than stored, so it can never disagree with
-- the log it comes from.
--
-- `security_invoker = true` is not optional: a view without it executes as its
-- owner and RLS is evaluated against the *executing* role, so it would hand
-- every caller every DM's site state. `supabase/tests/view_security_invoker.test.sql`
-- asserts structurally that no view in public or private bypasses RLS, after
-- exactly that bug shipped on `ai_generation_costs` (20260828202800).
create view public.location_state
with (security_invoker = true) as
select distinct on (location_id, fact)
  location_id,
  fact,
  value,
  user_id     as asserted_by,
  note        as asserted_note,
  created_at  as asserted_at
from public.location_state_events
order by location_id, fact, seq desc;

comment on view public.location_state is
  'Newest assertion per (location, fact) from location_state_events. Derived, never stored, so it cannot drift from its log.';

revoke all on public.location_state from public, anon;
grant select on public.location_state to authenticated, service_role;
