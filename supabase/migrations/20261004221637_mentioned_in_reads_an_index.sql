-- "Mentioned in" reads an index instead of scanning six tables (#972, story 8).
--
-- An NPC, place, monster, faction or party member page lists everything that
-- @mentions it. That list ran six `like '%<id>%'` scans (notes, NPCs,
-- locations, factions, quest beats, party members) on every open, and could
-- never be cached: no invalidation reached it, so it re-read on every mount.
-- Here the mentions are extracted once, when the text is written, into one
-- indexed table; the client reads it through `get_entity_backlinks` and is
-- told about changes by the campaign_sync doorbell.
--
-- Rows are derived, never authored: there is no owner column, no write policy
-- and no updated_at (a source's rows are replaced, never edited). Only the
-- trigger below writes them.

-- ── Extraction ─────────────────────────────────────────────────────────────

-- The ids of every `entityMention` node in a rich-text value (Tiptap JSON
-- stored as text). Plain text, legacy HTML, or JSON that is not an object
-- yields nothing, the same as the client's `contentMentionsEntity`. A word
-- "entityMention" typed into the text is a `text` node's value, not a node
-- type, so it never matches.
create function private.mention_target_ids(p_value text)
returns setof text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or left(ltrim(p_value), 1) <> '{' then
    return;
  end if;
  return query
    select distinct t #>> '{}'
      from jsonb_path_query(p_value::jsonb, 'strict $.** ? (@.type == "entityMention").attrs.id') as t
     where t #>> '{}' is not null and t #>> '{}' <> '';
exception when others then
  return;
end;
$$;

-- ── The index ──────────────────────────────────────────────────────────────

create table public.entity_mentions (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  source_kind text not null check (source_kind in ('note', 'npc', 'location', 'faction', 'quest-beat', 'party-member')),
  source_id   uuid not null,
  -- Text, not uuid: a library monster's id is a slug and the party mention is
  -- the literal `party-group`. No foreign key: a target can live in the shared
  -- library, and a mention of something since deleted is harmless (nobody asks
  -- for it).
  target_id   text not null,
  created_at  timestamptz not null default now(),
  primary key (source_kind, source_id, target_id)
);

create index entity_mentions_target_idx on public.entity_mentions (campaign_id, target_id);

alter table public.entity_mentions enable row level security;

-- DM-only, and the read path joins back to each source table as the caller
-- (`get_entity_backlinks` is SECURITY INVOKER), so the source row's own RLS
-- still decides. A player reading this table could learn that an NPC appears in
-- a DM-only quest beat; "Mentioned in" is not shown in the player portal.
create policy "entity_mentions_select" on public.entity_mentions
  for select using (private.is_campaign_dm(campaign_id));

-- ── Upkeep ─────────────────────────────────────────────────────────────────

-- Row trigger on every source table. tg_argv[0] is the source kind, the rest
-- are the rich-text columns that can hold mentions. A source's rows are only
-- rewritten when the extracted set (or its campaign) actually changed, so an
-- autosave that leaves the mentions alone writes nothing and rings nothing.
-- A source with no campaign keeps no rows: "Mentioned in" is per campaign.
create function private.sync_entity_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind     text := tg_argv[0];
  v_new      jsonb;
  v_old      jsonb;
  v_campaign uuid;
  v_targets  text[];
  v_existing text[];
begin
  if tg_op = 'DELETE' then
    delete from public.entity_mentions where source_kind = v_kind and source_id = old.id;
    return null;
  end if;

  v_new := to_jsonb(new);
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    if v_new -> 'campaign_id' is not distinct from v_old -> 'campaign_id'
       and not exists (
         select 1 from generate_series(1, tg_nargs - 1) as g
          where v_new -> tg_argv[g] is distinct from v_old -> tg_argv[g]
       ) then
      return null;
    end if;
  end if;

  v_campaign := (v_new ->> 'campaign_id')::uuid;
  if v_campaign is null then
    delete from public.entity_mentions where source_kind = v_kind and source_id = new.id;
    return null;
  end if;

  select coalesce(array_agg(distinct t order by t), '{}')
    into v_targets
    from generate_series(1, tg_nargs - 1) as g,
         private.mention_target_ids(v_new ->> tg_argv[g]) as t;

  select coalesce(array_agg(m.campaign_id::text || ':' || m.target_id order by m.target_id), '{}')
    into v_existing
    from public.entity_mentions m
   where m.source_kind = v_kind and m.source_id = new.id;

  if v_existing = (select coalesce(array_agg(v_campaign::text || ':' || x order by x), '{}') from unnest(v_targets) as x) then
    return null;
  end if;

  delete from public.entity_mentions where source_kind = v_kind and source_id = new.id;
  insert into public.entity_mentions (campaign_id, source_kind, source_id, target_id)
  select v_campaign, v_kind, new.id, x from unnest(v_targets) as x;
  return null;
end;
$$;

revoke execute on function private.sync_entity_mentions() from public, anon, authenticated;

create trigger notes_entity_mentions
  after insert or update of content, campaign_id or delete on public.notes
  for each row execute function private.sync_entity_mentions('note', 'content');

create trigger npcs_entity_mentions
  after insert or update of appearance, personality, backstory, notes, campaign_id or delete on public.npcs
  for each row execute function private.sync_entity_mentions('npc', 'appearance', 'personality', 'backstory', 'notes');

-- `locations.notes` is plain text (see 20261004212629), so only the description.
create trigger locations_entity_mentions
  after insert or update of description, campaign_id or delete on public.locations
  for each row execute function private.sync_entity_mentions('location', 'description');

create trigger factions_entity_mentions
  after insert or update of description, campaign_id or delete on public.factions
  for each row execute function private.sync_entity_mentions('faction', 'description');

create trigger quest_beats_entity_mentions
  after insert or update of dm_content, read_aloud, how_it_plays, campaign_id or delete on public.quest_beats
  for each row execute function private.sync_entity_mentions('quest-beat', 'dm_content', 'read_aloud', 'how_it_plays');

create trigger party_members_entity_mentions
  after insert or update of physical_description, personality_traits, ideals, bonds, flaws, notes, campaign_id or delete on public.party_members
  for each row execute function private.sync_entity_mentions('party-member', 'physical_description', 'personality_traits', 'ideals', 'bonds', 'flaws', 'notes');

-- ── Backfill ───────────────────────────────────────────────────────────────

insert into public.entity_mentions (campaign_id, source_kind, source_id, target_id)
select distinct s.campaign_id, s.kind, s.id, t
  from (
    select campaign_id, 'note' as kind, id, content as body from public.notes
    union all select campaign_id, 'npc', id, appearance from public.npcs
    union all select campaign_id, 'npc', id, personality from public.npcs
    union all select campaign_id, 'npc', id, backstory from public.npcs
    union all select campaign_id, 'npc', id, notes from public.npcs
    union all select campaign_id, 'location', id, description from public.locations
    union all select campaign_id, 'faction', id, description from public.factions
    union all select campaign_id, 'quest-beat', id, dm_content from public.quest_beats
    union all select campaign_id, 'quest-beat', id, read_aloud from public.quest_beats
    union all select campaign_id, 'quest-beat', id, how_it_plays from public.quest_beats
    union all select campaign_id, 'party-member', id, physical_description from public.party_members
    union all select campaign_id, 'party-member', id, personality_traits from public.party_members
    union all select campaign_id, 'party-member', id, ideals from public.party_members
    union all select campaign_id, 'party-member', id, bonds from public.party_members
    union all select campaign_id, 'party-member', id, flaws from public.party_members
    union all select campaign_id, 'party-member', id, notes from public.party_members
  ) as s,
  private.mention_target_ids(s.body) as t
 where s.campaign_id is not null
on conflict do nothing;

-- Derived, so never copied: the demo copy inserts the source rows, and their
-- trigger rebuilds the index for the copy as it goes.
insert into private.demo_campaign_tables (table_name, tier, parent_column, parent_table, copy, reason)
values ('entity_mentions', 1, null, null, false, 'derived: rebuilt by the source tables'' trigger as the copy inserts them');

-- ── Live sync ──────────────────────────────────────────────────────────────

-- A doorbell table, never published: a mention row names DM content. Every
-- write rings `entity_mentions`, which the client maps to the `backlinks` key.
create trigger entity_mentions_signal_insert
  after insert on public.entity_mentions
  referencing new table as changed
  for each statement execute function public.signal_campaign_change();

create trigger entity_mentions_signal_update
  after update on public.entity_mentions
  referencing new table as changed
  for each statement execute function public.signal_campaign_change();

create trigger entity_mentions_signal_delete
  after delete on public.entity_mentions
  referencing old table as changed
  for each statement execute function public.signal_campaign_change();

-- ── Read ───────────────────────────────────────────────────────────────────

-- Everything in a campaign that mentions `p_target_id`, joined to its source
-- as the caller, so RLS on each source table applies. A row never lists itself
-- (an NPC's own text naming its own id). Titles are raw: the client formats
-- them ("Untitled note", "<quest> · <beat>"), as it always has.
create function public.get_entity_backlinks(p_campaign_id uuid, p_target_id text)
returns table (kind text, id uuid, title text, quest_id uuid, quest_title text)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.source_kind, n.id, n.title, null::uuid, null::text
    from public.entity_mentions m join public.notes n on n.id = m.source_id
   where m.campaign_id = p_campaign_id and m.target_id = p_target_id and m.source_kind = 'note'
  union all
  select m.source_kind, x.id, x.name, null, null
    from public.entity_mentions m join public.npcs x on x.id = m.source_id
   where m.campaign_id = p_campaign_id and m.target_id = p_target_id and m.source_kind = 'npc'
     and x.id::text <> p_target_id
  union all
  select m.source_kind, x.id, x.name, null, null
    from public.entity_mentions m join public.locations x on x.id = m.source_id
   where m.campaign_id = p_campaign_id and m.target_id = p_target_id and m.source_kind = 'location'
     and x.id::text <> p_target_id
  union all
  select m.source_kind, x.id, x.name, null, null
    from public.entity_mentions m join public.factions x on x.id = m.source_id
   where m.campaign_id = p_campaign_id and m.target_id = p_target_id and m.source_kind = 'faction'
     and x.id::text <> p_target_id
  union all
  select m.source_kind, b.id, b.title, q.id, q.title
    from public.entity_mentions m
    join public.quest_beats b on b.id = m.source_id
    join public.quests q on q.id = b.quest_id
   where m.campaign_id = p_campaign_id and m.target_id = p_target_id and m.source_kind = 'quest-beat'
  union all
  select m.source_kind, x.id, x.name, null, null
    from public.entity_mentions m join public.party_members x on x.id = m.source_id
   where m.campaign_id = p_campaign_id and m.target_id = p_target_id and m.source_kind = 'party-member'
     and x.id::text <> p_target_id;
$$;

revoke execute on function public.get_entity_backlinks(uuid, text) from public, anon;
grant execute on function public.get_entity_backlinks(uuid, text) to authenticated, service_role;
