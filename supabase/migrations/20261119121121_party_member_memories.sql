-- A party member played by the AI (#1021 row 26).
--
-- The maintainer, 19 Nov 2026: the rest of the party sits down at the AI table too, and at a real table a player
-- who is away may have their character played for the evening. Two things are his:
--   "speak if there's enough character data and the player enabled on their sheet", and
--   "they should then keep a memory like an NPC which the actual player can read".
--
-- So a sheet gets a switch its own player sets, and a party member gets a ledger of what they lived through while
-- someone else played them, as an NPC has (`npc_memories`), which their player reads.

-- The player's own word that the AI may speak for their character. Off until they say so: without it the
-- character only acts, told by the Narrator, and is given no line.
alter table public.party_members
  add column ai_speaks boolean not null default false;

comment on column public.party_members.ai_speaks is
  'The player''s (or, for a character nobody has claimed, the DM''s) word that the AI may speak for this character when someone else plays them (#1021 row 26).';

create table public.party_member_memories (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  party_member_id uuid not null references public.party_members (id) on delete cascade,
  -- Whose table it was written at: the Dungeon Master who had the character played.
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The play session it happened in; null when there was none.
  session_id uuid references public.campaign_sessions (id) on delete set null,
  -- The same kinds an NPC's memory has (`npc_memories`): the character's call files them the same way.
  kind text not null default 'event' check (kind in ('revealed', 'learned', 'promise', 'deceived', 'attitude', 'event')),
  body text not null check (length(btrim(body)) between 1 and 1000),
  ai_provenance jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index party_member_memories_member_idx on public.party_member_memories (party_member_id, created_at desc);
create index party_member_memories_campaign_idx on public.party_member_memories (campaign_id);
create index party_member_memories_user_idx on public.party_member_memories (user_id);
create index party_member_memories_session_idx on public.party_member_memories (session_id) where session_id is not null;

create trigger party_member_memories_updated_at
  before update on public.party_member_memories
  for each row execute procedure update_updated_at();

-- A memory is of a character of its own campaign, in a session of that campaign.
create trigger zz_same_campaign_refs
  before insert or update of party_member_id, session_id, campaign_id
  on public.party_member_memories
  for each row execute function private.enforce_same_campaign_refs(
    'party_member_id', 'party_members', 'owned',
    'session_id', 'campaign_sessions', 'owned'
  );

alter table public.party_member_memories enable row level security;

-- Read by the campaign's Dungeon Master, and by the player whose character it is: that is the point of keeping it.
-- One policy, the two readers OR-ed. Written by the Dungeon Master (and by the server, which bypasses these).
create policy "party_member_memories_select" on public.party_member_memories
  for select using (
    private.is_campaign_dm(campaign_id)
    or exists (
      select 1 from public.campaign_members cm
       where cm.campaign_id = party_member_memories.campaign_id
         and cm.user_id = (select auth.uid())
         and cm.party_member_id = party_member_memories.party_member_id
    )
  );
create policy "party_member_memories_insert" on public.party_member_memories
  for insert with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "party_member_memories_update" on public.party_member_memories
  for update using (private.is_campaign_dm(campaign_id));
create policy "party_member_memories_delete" on public.party_member_memories
  for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.party_member_memories to authenticated, service_role;

-- Live: a memory filed at the table reaches the player's page without a reload.
create trigger party_member_memories_signal_insert
  after insert on public.party_member_memories
  referencing new table as changed
  for each statement execute function signal_campaign_change();
create trigger party_member_memories_signal_update
  after update on public.party_member_memories
  referencing old table as left_rows new table as changed
  for each statement execute function signal_campaign_change();
create trigger party_member_memories_signal_delete
  after delete on public.party_member_memories
  referencing old table as changed
  for each statement execute function signal_campaign_change();

-- Play state, like an NPC's memories: a demo copy starts with nothing lived through.
insert into private.demo_campaign_tables (table_name, tier, parent_column, parent_table, copy, defer_columns, reason)
values ('party_member_memories', 1, null, null, false, '{}', 'play state: what a party member lived through while someone else played them; a demo starts with none');

-- Merging two play sessions moves every link into the session log: this table's too.
CREATE OR REPLACE FUNCTION public.merge_campaign_sessions(p_keep uuid, p_absorb uuid)
 RETURNS campaign_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
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
  update public.party_member_memories  set session_id = p_keep where session_id = p_absorb;
  update public.character_caretakers   set session_id = p_keep where session_id = p_absorb;
  update public.agent_sessions         set campaign_session_id = p_keep where campaign_session_id = p_absorb;
  update public.story_facts            set session_id = p_keep where session_id = p_absorb;

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
$function$;
