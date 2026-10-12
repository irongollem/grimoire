-- What an NPC and the party have told each other (#1019).
--
-- "What did Bram already admit last session?" had no home. npc_reveals says
-- when a member first met an NPC, npc_pc_notes is one player-readable note per
-- (NPC, member), and the DM's own note is free prose. None of them records the
-- content of an exchange: what the NPC revealed, what the party told them, a
-- promise, a lie believed, how their attitude moved. npc_memories is that
-- ledger, one short line per thing worth remembering, read on the NPC's sheet
-- as a timeline grouped by session and handed to the Voice Coach so suggested
-- lines stay consistent with what has already been said.
--
-- Kinds:
--   revealed  the NPC told the party something
--   learned   the party told the NPC something
--   promise   a promise made, either way
--   deceived  a lie told and believed, either way
--   attitude  how the NPC's attitude toward the party moved
--   event     something that happened with them
--
-- A ledger, not a log: the DM may fix a typo or move a line to another
-- session, so rows are updatable (and carry updated_at), but nothing rewrites
-- them on the DM's behalf.
--
-- Columns worth a word:
--   campaign_id        always the NPC's own campaign, set by the normalize
--                      trigger rather than trusted from the caller.
--   session_id         the session it belongs to. The client sends the one it
--                      means (the running session, else the last one played,
--                      since a line written between sessions is usually a
--                      recap of the last one), and null means what it says:
--                      outside any session. So there is no stamp_open_session()
--                      trigger here, unlike the reveal tables: it cannot tell a
--                      null the DM chose from a column left out, and would file
--                      a line the DM put outside any session under the running
--                      one. MCP, the one writer that may leave it out, fills
--                      the running session itself. Nor does
--                      start_campaign_session sweep unstamped memories into the
--                      next session: a reveal made during prep is learned next
--                      session, a memory written during prep is about one
--                      already played.
--   party_member_ids   who was there. Empty means not recorded.
--   player_visible_to  the members who can read the line on their People
--                      page. A player reads the row itself (it was written to
--                      be shared), so there is no projection.
--   user_id            who wrote it; null once that account is gone, so a
--                      co-DM leaving does not take the campaign's history.
--   ai_provenance      set when the line came from the Voice Coach (the DM
--                      marked a suggested line as said).
--
-- Not here yet: a reference to the [secret] block a line discloses. Secret
-- blocks carry no stable id and NPC prose has none, so that needs block ids
-- and a campaign-wide picker first; it is tracked in #1053.

create table public.npc_memories (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references public.campaigns (id) on delete cascade,
  npc_id            uuid not null references public.npcs (id) on delete cascade,
  user_id           uuid default auth.uid() references auth.users (id) on delete set null,
  session_id        uuid references public.campaign_sessions (id) on delete set null,
  kind              text not null
                    check (kind in ('revealed', 'learned', 'promise', 'deceived', 'attitude', 'event')),
  body              text not null check (char_length(body) between 1 and 1000),
  party_member_ids  uuid[] not null default '{}',
  player_visible_to uuid[] not null default '{}',
  ai_provenance     jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index npc_memories_npc_id_created_at_idx on public.npc_memories (npc_id, created_at desc);
create index npc_memories_campaign_id_idx on public.npc_memories (campaign_id);
create index npc_memories_session_id_idx on public.npc_memories (session_id);
create index npc_memories_user_id_idx on public.npc_memories (user_id);

-- ── Normalize: the campaign comes from the NPC, members from that campaign ───
-- An id in either array that is not a party member of the NPC's campaign is
-- dropped, so a stale id (a deleted character) or a foreign one (a copied
-- campaign, a guessed uuid) can never let another campaign's player read a
-- line.
--
-- SECURITY DEFINER because `npcs` is readable by its owner only: as an invoker
-- this would refuse a co-DM writing about an NPC another DM made, for a reason
-- that has nothing to do with authorization. It decides nothing itself. It only
-- normalizes, and RLS then judges the row against the campaign it derived, so a
-- writer who is not that campaign's DM is refused by the insert/update policy.
-- A trigger function, so it needs no EXECUTE grant and has none.
--
-- The author is fixed at insert: an update keeps the original writer, except
-- that the user_id foreign key's own `on delete set null` must get through, or
-- deleting an account that wrote a memory would fail.

create function private.normalize_npc_memory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is not null then
    new.user_id := old.user_id;
  end if;
  select n.campaign_id into new.campaign_id from public.npcs n where n.id = new.npc_id;
  if new.campaign_id is null then
    raise exception 'A memory belongs to an NPC in a campaign';
  end if;
  new.body := btrim(new.body);
  new.party_member_ids := array(
    select pm.id from public.party_members pm
     where pm.campaign_id = new.campaign_id and pm.id = any (new.party_member_ids)
     order by pm.id);
  new.player_visible_to := array(
    select pm.id from public.party_members pm
     where pm.campaign_id = new.campaign_id and pm.id = any (new.player_visible_to)
     order by pm.id);
  return new;
end;
$$;
revoke execute on function private.normalize_npc_memory() from public, anon, authenticated;

-- Trigger order is by name: normalize sets campaign_id before the
-- same-campaign check reads it.
create trigger npc_memories_normalize
  before insert or update on public.npc_memories
  for each row execute procedure private.normalize_npc_memory();

create trigger npc_memories_updated_at
  before update on public.npc_memories
  for each row execute procedure update_updated_at();

create trigger zz_same_campaign_refs
  before insert or update of npc_id, session_id, campaign_id on public.npc_memories
  for each row execute procedure private.enforce_same_campaign_refs('npc_id', 'npcs', 'owned', 'session_id', 'campaign_sessions', 'owned');

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- The campaign's DMs read and write everything. A player reads the lines
-- shared with their own party member.

alter table public.npc_memories enable row level security;

create policy "npc_memories_select" on public.npc_memories for select using (
  private.is_campaign_dm(campaign_id)
  or exists (
    select 1 from public.campaign_members cm
     where cm.user_id = (select auth.uid())
       and cm.campaign_id = npc_memories.campaign_id
       and cm.role = 'player'
       and cm.party_member_id = any (npc_memories.player_visible_to)
  )
);
create policy "npc_memories_insert" on public.npc_memories for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "npc_memories_update" on public.npc_memories for update
  using (private.is_campaign_dm(campaign_id))
  with check (private.is_campaign_dm(campaign_id));
create policy "npc_memories_delete" on public.npc_memories for delete
  using (private.is_campaign_dm(campaign_id));

-- ── Live sync: the campaign doorbell ────────────────────────────────────────
-- A ring names the table and never carries a row, and each client re-reads
-- through the policy above, so a DM-only line never reaches a player.

create trigger npc_memories_signal_insert after insert on public.npc_memories
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger npc_memories_signal_update after update on public.npc_memories
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger npc_memories_signal_delete after delete on public.npc_memories
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

-- ── The session log's links ─────────────────────────────────────────────────
-- A new foreign key into campaign_sessions must move with a merge
-- (merge_campaign_sessions.test.sql holds the list equal to pg_constraint).

create or replace function public.merge_campaign_sessions(p_keep uuid, p_absorb uuid)
returns public.campaign_sessions
language plpgsql
security definer
set search_path to 'public', 'private'
as $$
declare
  v_keep   public.campaign_sessions;
  v_absorb public.campaign_sessions;
begin
  -- Authorize before locking anything: a caller who may not merge these rows
  -- must not be able to hold locks on them either, even for a moment.
  -- One message for missing and foreign alike: a caller learns nothing about
  -- sessions in a campaign they do not run.
  select * into v_keep from public.campaign_sessions where id = p_keep;
  select * into v_absorb from public.campaign_sessions where id = p_absorb;
  if auth.uid() is null
     or v_keep.id is null
     or v_absorb.id is null
     or v_keep.campaign_id <> v_absorb.campaign_id
     or not coalesce(private.is_campaign_dm(v_keep.campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  -- Both rows locked in one statement, in id order: two merges naming the same
  -- pair the other way round would otherwise each hold one row and wait on
  -- the other. Then read again, since a concurrent merge may have changed or
  -- removed either while this one waited.
  perform 1 from public.campaign_sessions where id in (p_keep, p_absorb) order by id for update;
  select * into v_keep from public.campaign_sessions where id = p_keep;
  select * into v_absorb from public.campaign_sessions where id = p_absorb;
  if v_keep.id is null or v_absorb.id is null then
    raise exception 'That session was merged or deleted in the meantime';
  end if;

  if v_keep.id = v_absorb.id then
    raise exception 'A session cannot be merged into itself';
  end if;
  if (v_keep.started_at is not null and v_keep.ended_at is null)
     or (v_absorb.started_at is not null and v_absorb.ended_at is null) then
    raise exception 'End the running session before merging it';
  end if;

  update public.notes                  set session_id = p_keep where session_id = p_absorb;
  update public.session_proposals      set session_id = p_keep where session_id = p_absorb;
  update public.encounter_state        set session_id = p_keep where session_id = p_absorb;
  update public.npc_reveals            set session_id = p_keep where session_id = p_absorb;
  update public.location_reveals       set session_id = p_keep where session_id = p_absorb;
  update public.handout_reveals        set session_id = p_keep where session_id = p_absorb;
  update public.discovered_monsters    set session_id = p_keep where session_id = p_absorb;
  update public.quest_beat_transitions set session_id = p_keep where session_id = p_absorb;
  update public.npc_memories           set session_id = p_keep where session_id = p_absorb;

  delete from public.campaign_sessions where id = p_absorb;

  update public.campaign_sessions
     set number     = coalesce(v_keep.number, v_absorb.number),
         title      = coalesce(nullif(btrim(v_keep.title), ''), nullif(btrim(v_absorb.title), '')),
         played_on  = coalesce(v_keep.played_on, v_absorb.played_on),
         started_at = case
                        when v_keep.started_at is null then v_absorb.started_at
                        when v_absorb.started_at is null then v_keep.started_at
                        else least(v_keep.started_at, v_absorb.started_at)
                      end,
         ended_at   = case
                        when v_keep.started_at is null then v_absorb.ended_at
                        when v_absorb.started_at is null then v_keep.ended_at
                        else greatest(v_keep.ended_at, v_absorb.ended_at)
                      end
   where id = p_keep
  returning * into v_keep;

  return v_keep;
end;
$$;

-- ── Registries ──────────────────────────────────────────────────────────────

insert into private.demo_campaign_tables (table_name, tier, copy, reason)
values ('npc_memories', 1, false, 'play state: what was said at the table; a demo starts with nothing said');
