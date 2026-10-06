-- What the party learned, session by session (#985, the maintainer's addition
-- on 6 Oct 2026). The session page lists what each session revealed, so a DM
-- who forgot something can correct it afterwards, and People groups "Met" by
-- session rather than by day.
--
-- Every learned moment now carries the session it belongs to:
--
--   people met         npc_reveals (20261005220422)       + session_id
--   places shared      location_reveals (new)             same shape as npc_reveals
--   handouts shared    handout_reveals (new)              same shape as npc_reveals
--   creatures          discovered_monsters                 + session_id
--   quest steps        quest_beat_transitions              + session_id
--   combat             encounter_state.session_id          (already, set by goLive)
--
-- A moment recorded while a session is open belongs to it (stamped on insert).
-- One recorded while none is open (sharing during prep) belongs to the next
-- session started: start_campaign_session attaches them. Moments from before
-- this log existed, and anything the DM leaves, have no session: the Sessions
-- page lists them to sort by hand ("learned outside any session"). Moving one
-- is a DM update of session_id alone.
--
-- `approximate` marks a moment whose time was reconstructed rather than
-- recorded (the backfills below and the one in npc_reveals' own migration).

-- The day the log began. Moments before it are never attached automatically:
-- their sessions are unknown, and guessing would bury them in the first one.
create function private.session_log_began()
returns timestamptz
language sql
immutable
set search_path = ''
as $$ select timestamptz '2026-10-06 00:00:00+00' $$;

-- ── Stamping: the open session, at insert ───────────────────────────────────

create function public.stamp_open_session()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.session_id is null and new.campaign_id is not null then
    select s.id into new.session_id
      from public.campaign_sessions s
     where s.campaign_id = new.campaign_id
       and s.started_at is not null
       and s.ended_at is null;
  end if;
  return new;
end;
$$;
revoke execute on function public.stamp_open_session() from public, anon, authenticated;

-- ── People met ──────────────────────────────────────────────────────────────

alter table public.npc_reveals
  add column session_id uuid references public.campaign_sessions (id) on delete set null,
  add column approximate boolean not null default false;
create index npc_reveals_session_id_idx on public.npc_reveals (session_id);

-- The backfill in 20261005220422 used the NPC's created_at.
update public.npc_reveals r set approximate = true
  from public.npcs n
 where n.id = r.npc_id and r.revealed_at = n.created_at and r.revealed_at < private.session_log_began();

create trigger npc_reveals_stamp_session
  before insert on public.npc_reveals
  for each row execute procedure public.stamp_open_session();

drop trigger if exists zz_same_campaign_refs on public.npc_reveals;
create trigger zz_same_campaign_refs
  before insert or update of npc_id, party_member_id, session_id, campaign_id on public.npc_reveals
  for each row execute procedure private.enforce_same_campaign_refs('npc_id', 'npcs', 'owned', 'party_member_id', 'party_members', 'owned', 'session_id', 'campaign_sessions', 'owned');

-- The DM may move a moment to another session, and change nothing else.
revoke update on public.npc_reveals from authenticated, anon;
grant update (session_id) on public.npc_reveals to authenticated;
create policy "npc_reveals_dm_update" on public.npc_reveals for update using (private.is_campaign_dm(campaign_id));

-- ── Places shared ───────────────────────────────────────────────────────────

create table public.location_reveals (
  location_id     uuid not null references public.locations (id) on delete cascade,
  party_member_id uuid not null references public.party_members (id) on delete cascade,
  campaign_id     uuid not null references public.campaigns (id) on delete cascade,
  revealed_at     timestamptz not null default now(),
  session_id      uuid references public.campaign_sessions (id) on delete set null,
  approximate     boolean not null default false,
  primary key (location_id, party_member_id)
);
create index location_reveals_campaign_id_idx on public.location_reveals (campaign_id);
create index location_reveals_party_member_id_idx on public.location_reveals (party_member_id);
create index location_reveals_session_id_idx on public.location_reveals (session_id);

-- ── Handouts shared ─────────────────────────────────────────────────────────

create table public.handout_reveals (
  document_id     uuid not null references public.scriptorium_documents (id) on delete cascade,
  party_member_id uuid not null references public.party_members (id) on delete cascade,
  campaign_id     uuid not null references public.campaigns (id) on delete cascade,
  revealed_at     timestamptz not null default now(),
  session_id      uuid references public.campaign_sessions (id) on delete set null,
  approximate     boolean not null default false,
  primary key (document_id, party_member_id)
);
create index handout_reveals_campaign_id_idx on public.handout_reveals (campaign_id);
create index handout_reveals_party_member_id_idx on public.handout_reveals (party_member_id);
create index handout_reveals_session_id_idx on public.handout_reveals (session_id);

-- Both new tables follow npc_reveals: append-only records (no updated_at),
-- written only by the triggers below, read by the member they belong to and
-- by the DM, the DM alone able to move a moment to another session.
alter table public.location_reveals enable row level security;
alter table public.handout_reveals enable row level security;

create policy "location_reveals_select" on public.location_reveals for select using (
  private.is_campaign_dm(campaign_id)
  or exists (select 1 from public.campaign_members cm
              where cm.user_id = (select auth.uid()) and cm.campaign_id = location_reveals.campaign_id
                and cm.party_member_id = location_reveals.party_member_id)
);
create policy "location_reveals_dm_update" on public.location_reveals for update using (private.is_campaign_dm(campaign_id));

create policy "handout_reveals_select" on public.handout_reveals for select using (
  private.is_campaign_dm(campaign_id)
  or exists (select 1 from public.campaign_members cm
              where cm.user_id = (select auth.uid()) and cm.campaign_id = handout_reveals.campaign_id
                and cm.party_member_id = handout_reveals.party_member_id)
);
create policy "handout_reveals_dm_update" on public.handout_reveals for update using (private.is_campaign_dm(campaign_id));

revoke insert, update, delete on public.location_reveals from authenticated, anon;
revoke insert, update, delete on public.handout_reveals from authenticated, anon;
grant update (session_id) on public.location_reveals to authenticated;
grant update (session_id) on public.handout_reveals to authenticated;

create trigger location_reveals_stamp_session before insert on public.location_reveals
  for each row execute procedure public.stamp_open_session();
create trigger handout_reveals_stamp_session before insert on public.handout_reveals
  for each row execute procedure public.stamp_open_session();

create trigger zz_same_campaign_refs
  before insert or update of location_id, party_member_id, session_id, campaign_id on public.location_reveals
  for each row execute procedure private.enforce_same_campaign_refs('location_id', 'locations', 'owned', 'party_member_id', 'party_members', 'owned', 'session_id', 'campaign_sessions', 'owned');
create trigger zz_same_campaign_refs
  before insert or update of document_id, party_member_id, session_id, campaign_id on public.handout_reveals
  for each row execute procedure private.enforce_same_campaign_refs('document_id', 'scriptorium_documents', 'owned', 'party_member_id', 'party_members', 'owned', 'session_id', 'campaign_sessions', 'owned');

-- Writers: the first moment a member is in the share list. Joined to the
-- campaign's own party members, so a stale or foreign id never becomes a row.
create function public.record_location_reveals()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.campaign_id is null or cardinality(new.player_visible_to) = 0 then
    return null;
  end if;
  insert into location_reveals (location_id, party_member_id, campaign_id)
  select new.id, pm.id, new.campaign_id
    from party_members pm
   where pm.campaign_id = new.campaign_id and pm.id = any (new.player_visible_to)
  on conflict do nothing;
  return null;
end;
$$;

create function public.record_handout_reveals()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.campaign_id is null or cardinality(new.player_visible_to) = 0 then
    return null;
  end if;
  insert into handout_reveals (document_id, party_member_id, campaign_id)
  select new.id, pm.id, new.campaign_id
    from party_members pm
   where pm.campaign_id = new.campaign_id and pm.id = any (new.player_visible_to)
  on conflict do nothing;
  return null;
end;
$$;

create trigger locations_record_reveals
  after insert or update of player_visible_to on public.locations
  for each row execute procedure public.record_location_reveals();
create trigger scriptorium_documents_record_reveals
  after insert or update of player_visible_to on public.scriptorium_documents
  for each row execute procedure public.record_handout_reveals();

revoke execute on function public.record_location_reveals() from public, anon, authenticated;
revoke execute on function public.record_handout_reveals() from public, anon, authenticated;

-- What is already shared: no recorded moment, so the row's created_at, marked
-- approximate, and no session (it waits in the unsorted list).
insert into public.location_reveals (location_id, party_member_id, campaign_id, revealed_at, approximate)
select l.id, pm.id, l.campaign_id, l.created_at, true
  from public.locations l
  join public.party_members pm on pm.campaign_id = l.campaign_id and pm.id = any (l.player_visible_to)
 where l.campaign_id is not null
on conflict do nothing;

insert into public.handout_reveals (document_id, party_member_id, campaign_id, revealed_at, approximate)
select d.id, pm.id, d.campaign_id, d.created_at, true
  from public.scriptorium_documents d
  join public.party_members pm on pm.campaign_id = d.campaign_id and pm.id = any (d.player_visible_to)
 where d.campaign_id is not null
on conflict do nothing;

-- ── Creatures and quest steps ───────────────────────────────────────────────

alter table public.discovered_monsters add column session_id uuid references public.campaign_sessions (id) on delete set null;
create index discovered_monsters_session_id_idx on public.discovered_monsters (session_id);
create trigger discovered_monsters_stamp_session before insert on public.discovered_monsters
  for each row execute procedure public.stamp_open_session();
drop trigger if exists zz_same_campaign_refs on public.discovered_monsters;
create trigger zz_same_campaign_refs
  before insert or update of monster_id, session_id, campaign_id on public.discovered_monsters
  for each row execute procedure private.enforce_same_campaign_refs('monster_id', 'monsters', 'owned', 'session_id', 'campaign_sessions', 'owned');

-- Quest history stays append-only in substance: the DM may re-file a step
-- under another session, and nothing else about it changes.
alter table public.quest_beat_transitions add column session_id uuid references public.campaign_sessions (id) on delete set null;
create index quest_beat_transitions_session_id_idx on public.quest_beat_transitions (session_id);
create trigger quest_beat_transitions_stamp_session before insert on public.quest_beat_transitions
  for each row execute procedure public.stamp_open_session();
drop trigger if exists zz_same_campaign_refs on public.quest_beat_transitions;
create trigger zz_same_campaign_refs
  before insert or update of thread_id, session_id, campaign_id on public.quest_beat_transitions
  for each row execute procedure private.enforce_same_campaign_refs('thread_id', 'quest_threads', 'unowned', 'session_id', 'campaign_sessions', 'owned');
revoke update on public.quest_beat_transitions from authenticated, anon;
grant update (session_id) on public.quest_beat_transitions to authenticated;
create policy "quest_beat_transitions_dm_update" on public.quest_beat_transitions for update using (private.is_campaign_dm(campaign_id));

-- ── Start attaches what was shared during prep ──────────────────────────────

create or replace function public.start_campaign_session(
  p_campaign_id uuid,
  p_number integer default null,
  p_title text default null,
  p_proposal_id uuid default null
)
returns public.campaign_sessions
language plpgsql
set search_path to 'public', 'private'
as $$
declare
  v_row   public.campaign_sessions;
  v_since timestamptz;
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  select * into v_row from public.campaign_sessions
   where campaign_id = p_campaign_id and started_at is not null and ended_at is null;
  if found then
    return v_row;
  end if;

  insert into public.campaign_sessions (campaign_id, user_id, number, title, started_at)
  values (p_campaign_id, auth.uid(), p_number, nullif(btrim(p_title), ''), now())
  returning * into v_row;

  if p_proposal_id is not null then
    update public.session_proposals
       set session_id = v_row.id
     where id = p_proposal_id and campaign_id = p_campaign_id;
  end if;

  -- What the DM shared since the last session ended (prep) was learned for
  -- this one. Never before the log began, never a reconstructed moment.
  select greatest(coalesce(max(ended_at), '-infinity'::timestamptz), private.session_log_began())
    into v_since
    from public.campaign_sessions
   where campaign_id = p_campaign_id and ended_at is not null;

  update public.npc_reveals set session_id = v_row.id
   where campaign_id = p_campaign_id and session_id is null and not approximate and revealed_at > v_since;
  update public.location_reveals set session_id = v_row.id
   where campaign_id = p_campaign_id and session_id is null and not approximate and revealed_at > v_since;
  update public.handout_reveals set session_id = v_row.id
   where campaign_id = p_campaign_id and session_id is null and not approximate and revealed_at > v_since;
  update public.discovered_monsters set session_id = v_row.id
   where campaign_id = p_campaign_id and session_id is null and discovered_at > v_since;
  update public.quest_beat_transitions set session_id = v_row.id
   where campaign_id = p_campaign_id and session_id is null and created_at > v_since;

  return v_row;
end;
$$;

-- ── Registries ──────────────────────────────────────────────────────────────

insert into private.demo_campaign_tables (table_name, tier, copy, reason) values
  ('location_reveals', 1, false, 'play state: written by triggers as places are shared; a demo starts with nothing shared'),
  ('handout_reveals', 1, false, 'play state: written by triggers as handouts are shared; a demo starts with nothing shared');
