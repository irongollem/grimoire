-- The record: what is true in a campaign's story, kept apart from how it is told (#1021).
--
-- A session note is written to be remembered at the table: it dramatises, compresses and drops things. A
-- character's memories are about that character. A quest move says a beat was reached, not what was agreed there.
-- Anything that is none of these (the party holds the brass key, the bridge is burned, the debt is forty gold) had
-- no home, and that is what a narrator forgets. The maintainer's words, 16 Nov 2026: "long running quests shouldnt
-- be a reason to start forgetting things".
--
-- `story_facts` holds one plain sentence per fact, written when it happens, and `story_fact_links` ties each fact
-- to what it is about (a person, a place, a quest, a beat, an item, a monster). The ties are how a fact is found
-- again: when someone walks into the scene, the facts tied to them come along.
--
-- Three rules live in the schema, not in the code that writes it:
--   1. A fact is overtaken, never rewritten. Its sentence cannot be changed; a later fact names the one it closes
--      (`supersedes_id`) and both stay, so the story can be checked backwards. A correction by the player is such
--      a later fact, not an edit.
--   2. A fact the party has not learned yet is hidden from players (`known_to_player = false`) until it comes out.
--      That flag is the one thing that may change on a fact.
--   3. A fact and everything it points at are of one campaign.
--
-- The AI table files facts as the DM who is playing. A DM running a table in person may file them too and is never
-- made to (maintainer: "a real-table run doesnt write everything down").

create table public.story_facts (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references public.campaigns (id) on delete cascade,
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The sitting it happened in.
  session_id       uuid references public.campaign_sessions (id) on delete set null,
  -- The AI table's conversation that filed it, when one did.
  agent_session_id uuid references public.agent_sessions (id) on delete set null,
  body             text not null check (char_length(body) between 1 and 600),
  known_to_player  boolean not null default true,
  -- The earlier fact this one closes.
  supersedes_id    uuid references public.story_facts (id) on delete set null,
  -- Who put it on record: the AI table, a DM by hand, or a correction to an earlier fact.
  source           text not null default 'dm' check (source in ('table', 'dm', 'correction')),
  ai_provenance    jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint story_facts_not_its_own_successor check (supersedes_id is null or supersedes_id <> id)
);

create index story_facts_campaign_idx on public.story_facts (campaign_id, created_at desc);
create index story_facts_user_idx on public.story_facts (user_id);
create index story_facts_session_idx on public.story_facts (session_id) where session_id is not null;
create index story_facts_agent_session_idx on public.story_facts (agent_session_id) where agent_session_id is not null;
create index story_facts_supersedes_idx on public.story_facts (supersedes_id) where supersedes_id is not null;

create trigger story_facts_updated_at
  before update on public.story_facts
  for each row execute procedure update_updated_at();

-- Rule 1. SECURITY INVOKER and no table reads: it only compares the row with itself.
create function public.story_facts_keep_what_was_written()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.body is distinct from old.body
     or new.campaign_id is distinct from old.campaign_id
     or new.user_id is distinct from old.user_id
     or new.source is distinct from old.source
     or new.created_at is distinct from old.created_at
     or (old.supersedes_id is not null and new.supersedes_id is distinct from old.supersedes_id
         and new.supersedes_id is not null)
  then
    raise exception using
      errcode = '23514',
      message = 'A fact on record is not rewritten: file a new fact that supersedes it',
      hint = 'Only known_to_player may change, and session links may be cleared.';
  end if;
  return new;
end;
$$;

revoke execute on function public.story_facts_keep_what_was_written() from public, anon, authenticated;

create trigger story_facts_keep_what_was_written
  before update on public.story_facts
  for each row execute procedure public.story_facts_keep_what_was_written();

create trigger zz_same_campaign_refs
  before insert or update of session_id, agent_session_id, supersedes_id, campaign_id
  on public.story_facts
  for each row execute procedure private.enforce_same_campaign_refs(
    'session_id', 'campaign_sessions', 'owned',
    'agent_session_id', 'agent_sessions', 'owned',
    'supersedes_id', 'story_facts', 'owned');

alter table public.story_facts enable row level security;

-- A DM reads every fact. A member reads what the party knows. One policy per command.
create policy "story_facts_select" on public.story_facts for select
  using (private.is_campaign_dm(campaign_id) or (known_to_player and private.is_campaign_member(campaign_id)));
create policy "story_facts_insert" on public.story_facts for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "story_facts_update" on public.story_facts for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "story_facts_delete" on public.story_facts for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.story_facts to authenticated, service_role;

create trigger story_facts_signal_insert after insert on public.story_facts
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger story_facts_signal_update after update on public.story_facts
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger story_facts_signal_delete after delete on public.story_facts
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

-- ── What a fact is about ────────────────────────────────────────────────────

-- One real foreign key per kind, as world_links: a deleted NPC takes its ties with it, and zz_same_campaign_refs
-- can check each. A library monster has a text id and no row here to point at, so it is not a kind yet.
create table public.story_fact_links (
  id            uuid primary key default gen_random_uuid(),
  fact_id       uuid not null references public.story_facts (id) on delete cascade,
  campaign_id   uuid not null references public.campaigns (id) on delete cascade,
  kind          text not null check (kind in ('npc', 'location', 'quest', 'quest_beat', 'item', 'monster')),
  npc_id        uuid references public.npcs (id) on delete cascade,
  location_id   uuid references public.locations (id) on delete cascade,
  quest_id      uuid references public.quests (id) on delete cascade,
  quest_beat_id uuid references public.quest_beats (id) on delete cascade,
  item_id       uuid references public.items (id) on delete cascade,
  monster_id    uuid references public.monsters (id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint story_fact_links_one_target
    check (num_nonnulls(npc_id, location_id, quest_id, quest_beat_id, item_id, monster_id) = 1),
  constraint story_fact_links_kind_matches check (
    case kind
      when 'npc' then npc_id is not null
      when 'location' then location_id is not null
      when 'quest' then quest_id is not null
      when 'quest_beat' then quest_beat_id is not null
      when 'item' then item_id is not null
      when 'monster' then monster_id is not null
      else false
    end)
);

create index story_fact_links_fact_idx on public.story_fact_links (fact_id);
create index story_fact_links_campaign_idx on public.story_fact_links (campaign_id);
create unique index story_fact_links_npc_uq on public.story_fact_links (npc_id, fact_id) where npc_id is not null;
create unique index story_fact_links_location_uq on public.story_fact_links (location_id, fact_id) where location_id is not null;
create unique index story_fact_links_quest_uq on public.story_fact_links (quest_id, fact_id) where quest_id is not null;
create unique index story_fact_links_beat_uq on public.story_fact_links (quest_beat_id, fact_id) where quest_beat_id is not null;
create unique index story_fact_links_item_uq on public.story_fact_links (item_id, fact_id) where item_id is not null;
create unique index story_fact_links_monster_uq on public.story_fact_links (monster_id, fact_id) where monster_id is not null;

create trigger story_fact_links_updated_at
  before update on public.story_fact_links
  for each row execute procedure update_updated_at();

create trigger zz_same_campaign_refs
  before insert or update of fact_id, npc_id, location_id, quest_id, quest_beat_id, item_id, monster_id, campaign_id
  on public.story_fact_links
  for each row execute procedure private.enforce_same_campaign_refs(
    'fact_id', 'story_facts', 'owned',
    'npc_id', 'npcs', 'owned',
    'location_id', 'locations', 'owned',
    'quest_id', 'quests', 'owned',
    'quest_beat_id', 'quest_beats', 'unowned',
    'item_id', 'items', 'owned',
    'monster_id', 'monsters', 'owned');

alter table public.story_fact_links enable row level security;

-- A tie is readable where its fact is: a DM always, a member when the party knows the fact. Otherwise the ties of
-- a hidden fact would say who it is about.
create policy "story_fact_links_select" on public.story_fact_links for select
  using (
    private.is_campaign_dm(campaign_id)
    or (private.is_campaign_member(campaign_id)
        and exists (select 1 from public.story_facts f where f.id = fact_id and f.known_to_player))
  );
create policy "story_fact_links_insert" on public.story_fact_links for insert
  with check (private.is_campaign_dm(campaign_id));
create policy "story_fact_links_update" on public.story_fact_links for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "story_fact_links_delete" on public.story_fact_links for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.story_fact_links to authenticated, service_role;

create trigger story_fact_links_signal_insert after insert on public.story_fact_links
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger story_fact_links_signal_update after update on public.story_fact_links
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger story_fact_links_signal_delete after delete on public.story_fact_links
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

-- What happened at someone's table is theirs, not the template's: a copy of a demo campaign starts with a clean record.
insert into private.demo_campaign_tables (table_name, tier, copy, reason) values
  ('story_facts', 1, false, 'the record of one table''s play, not part of the template'),
  ('story_fact_links', 1, false, 'the record of one table''s play, not part of the template');

-- ── Merging two session rows keeps the record and the conversation ──────────

-- merge_campaign_sessions lists by hand every table that points at a session (its test fails on a new one), so
-- that merging "the evening as run" into "the evening as written up" moves everything across. Two more now point
-- at one: a conversation at the AI table and the facts on record. The body is the live definition (checked against
-- production, 16 Nov 2026) with those two lines added; nothing else changes.
CREATE OR REPLACE FUNCTION public.merge_campaign_sessions(p_keep uuid, p_absorb uuid)
 RETURNS campaign_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
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
$$;
