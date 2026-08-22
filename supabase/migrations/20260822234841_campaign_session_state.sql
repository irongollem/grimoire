-- Migration: campaign_session_state
-- One live session row per campaign — the boundary a DM starts and ends.

-- The DM's Prep/Play switch has been a `localStorage` string since #133
-- (`grimoire:dm-mode`). Five behaviours hang off it now: NPC reveals announce
-- to chat, the bottom bar swaps its tab pool, the centre button swaps between
-- create and the dice roller, quest detail opens on the cockpit, and the
-- soundboard switches to Perform.
--
-- Storing that in the browser is what makes all of it hard to reason about. The
-- app already has two "something is running" states and both are rows here:
-- `encounter_state` (one live combat per campaign, `started_at`, realtime) and
-- `quest_runtime_state` (one cursor per chain, versioned, with a transition
-- log). The session was the odd one out, and the consequences all follow from
-- that: no elapsed time, so a session that ended on Thursday is still running
-- on Sunday and still broadcasting; no campaign scope, so a co-DM cannot see
-- it; no cross-device consistency, so starting on the laptop leaves the tablet
-- in prep; and nothing for the player portal to project.
--
-- This is deliberately the same shape as `encounter_state`, down to the
-- single `_dm_all` policy, because the two nest: an encounter runs *inside* a
-- session, and `encounter_state.session_id` below records which one.
--
-- DM-only, gated on `private.is_campaign_dm()` — matching `quest_runtime_state`,
-- which is also invisible to players by design. Telling the table that a session
-- is live is a separate, deliberate projection, not a widening of this policy.

create table public.campaign_session_state (
  id          uuid primary key default gen_random_uuid(),
  -- One live session per campaign, enforced by the unique constraint rather
  -- than by convention. `encounter_state` takes the same approach on
  -- `encounter_id`, and for the same reason: two rows claiming to be the live
  -- one is a state no reader can resolve.
  campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
  -- Who started it. Not an ownership claim — the RLS policy is campaign-scoped,
  -- so any DM of the campaign can end a session another DM began.
  user_id     uuid not null references auth.users(id) on delete cascade,
  is_running  boolean not null default false,
  -- Kept across the end so a finished session still describes a span. The
  -- elapsed clock the chrome renders reads this, and it is what makes a
  -- three-day-old session self-evidently wrong instead of silently on.
  started_at  timestamptz,
  ended_at    timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index campaign_session_state_user_id_idx on public.campaign_session_state (user_id);

create trigger campaign_session_state_updated_at
  before update on public.campaign_session_state
  for each row execute procedure update_updated_at();

alter table public.campaign_session_state enable row level security;

create policy "campaign_session_state_dm_all"
  on public.campaign_session_state for all
  using (private.is_campaign_dm(campaign_id))
  with check (private.is_campaign_dm(campaign_id));

-- Realtime, so a co-DM and the DM's second device both see the session start
-- and end. Note `encounter_state` itself is *not* published — only its
-- `_player_updates` signal table is — so the DM-side subscription in
-- `useRunningEncounters` relies on its reconcile refetch. This table is
-- published, because the whole point of moving the session out of localStorage
-- is that more than one client learns about it.
alter publication supabase_realtime add table public.campaign_session_state;

-- ── Encounters nest inside sessions ──────────────────────────────────────────
-- Nullable, and `on delete set null`: an encounter that ran in a session the
-- DM later deleted is still a real encounter. Stamped by `goLive()`, which
-- makes "what did we play on Thursday" answerable from one column.
alter table public.encounter_state
  add column session_id uuid references public.campaign_session_state(id) on delete set null;

create index encounter_state_session_id_idx on public.encounter_state (session_id);

-- ── Start ────────────────────────────────────────────────────────────────────

create function public.start_campaign_session(p_campaign_id uuid)
returns public.campaign_session_state
language plpgsql security definer
set search_path = public, private
as $$
declare
  v_row public.campaign_session_state;
begin
  -- Authorize first, from `auth.uid()` alone. `coalesce` because a predicate
  -- used negatively must be total: a NULL answer would fall straight through
  -- the guard, which is exactly how the `is_app_admin` bypass survived.
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  insert into public.campaign_session_state (campaign_id, user_id, is_running, started_at, ended_at)
  values (p_campaign_id, auth.uid(), true, now(), null)
  on conflict (campaign_id) do update
    -- Re-starting an already-running session must not reset its clock, so the
    -- DM who reopens the app mid-session keeps their elapsed time. Only a
    -- session that had actually ended gets a fresh `started_at`.
    set is_running = true,
        started_at = case
          when public.campaign_session_state.is_running then public.campaign_session_state.started_at
          else now()
        end,
        ended_at   = null,
        user_id    = auth.uid()
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.start_campaign_session(uuid) from public, anon;
grant execute on function public.start_campaign_session(uuid) to authenticated, service_role;

comment on function public.start_campaign_session(uuid) is
  'Marks the campaign''s session live. Re-starting a running session preserves its started_at.';

-- ── End ──────────────────────────────────────────────────────────────────────

create function public.end_campaign_session(p_campaign_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, private
as $$
declare
  v_encounters integer := 0;
  v_chains     integer := 0;
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  update public.campaign_session_state
  set is_running = false, ended_at = now()
  where campaign_id = p_campaign_id and is_running;

  -- Ending the session ends what it contains. Combat first: an encounter left
  -- `is_running` when the DM closed the tab had nothing to clear it before
  -- this, so the reaper is new behaviour rather than a mirror of an old path.
  with stopped as (
    update public.encounter_state
    set is_running = false
    where campaign_id = p_campaign_id and is_running
    returning 1
  )
  select count(*)::integer into v_encounters from stopped;

  -- Then the open chains. `end_campaign_quest_session` (#755) pauses each at
  -- its current beat and logs the pause with reason 'Session ended' — it was
  -- written for this boundary and had no caller until now. Delegated rather
  -- than reimplemented so the transition log keeps one author.
  v_chains := public.end_campaign_quest_session(p_campaign_id);

  return jsonb_build_object('encounters_ended', v_encounters, 'chains_paused', v_chains);
end;
$$;

revoke execute on function public.end_campaign_session(uuid) from public, anon;
grant execute on function public.end_campaign_session(uuid) to authenticated, service_role;

comment on function public.end_campaign_session(uuid) is
  'Closes the table: ends the session, stops any running encounter, pauses every open chain at its beat.';
