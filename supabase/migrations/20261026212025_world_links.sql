-- World Web (#1084), wave 1: one table for every free tie between two things in a campaign.
--
-- A tie has exactly one home. A *link* is a typed tie with nothing more to say ("worships", "controls", "rival of")
-- and lives here, whatever the two kinds are. A *record* is a tie that carries facts of its own (a membership's role,
-- a kin link's parentage, an NPC's home, a pack's contents) and stays where it is; `get_connections` reads both into
-- one shape so a sheet asks one question. The six tables this replaces (npc_relationships, npc_pc_notes,
-- faction_relations, faction_locations, faction_items, faction_deities) move in and are dropped in a later migration of
-- the same release, once nothing reads them. The design is the World Web canvas named in the epic.
--
-- Each end is a real reference, one nullable column per kind, exactly one of them set: the kin_links shape
-- (20261022113302). Not a generated (kind, id) pair, because zz_same_campaign_refs is a BEFORE trigger and a stored
-- generated column is still null when it runs.

-- ── 1. The catalogue ──────────────────────────────────────────────────────────
-- Which types each pair of kinds may hold. supabase/functions/_shared/worldLinkCatalogue.ts is the source; it expands
-- the person pairs to NPC and PC ends, and src/lib/worldLinks/catalogueMirror.test.ts holds this table equal to it.
-- In `private` because nothing but the database's own checks reads it; the client reads the module.
create table private.world_link_types (
  from_kind text not null,
  to_kind text not null,
  type text not null,
  -- Reads the same both ways: stored with its ends in a fixed order, so it cannot exist twice for one pair.
  is_symmetric boolean not null,
  primary key (from_kind, to_kind, type)
);
revoke all on private.world_link_types from public, anon, authenticated;

-- catalogue:start
insert into private.world_link_types (from_kind, to_kind, type, is_symmetric) values
  ('npc', 'npc', 'friend', true),
  ('npc', 'npc', 'ally', true),
  ('npc', 'npc', 'lover', true),
  ('npc', 'npc', 'contact', true),
  ('npc', 'npc', 'rival', true),
  ('npc', 'npc', 'enemy', true),
  ('npc', 'npc', 'mentor_of', false),
  ('npc', 'npc', 'superior_of', false),
  ('npc', 'npc', 'chosen_family', true),
  ('npc', 'npc', 'former_ally', true),
  ('npc', 'npc', 'former_enemy', true),
  ('npc', 'npc', 'employer_of', false),
  ('npc', 'npc', 'patron_of', false),
  ('npc', 'npc', 'creditor_of', false),
  ('npc', 'npc', 'blackmails', false),
  ('npc', 'npc', 'betrayed', false),
  ('npc', 'npc', 'sworn_to', false),
  ('npc', 'party_member', 'friend', true),
  ('npc', 'party_member', 'ally', true),
  ('npc', 'party_member', 'lover', true),
  ('npc', 'party_member', 'contact', true),
  ('npc', 'party_member', 'rival', true),
  ('npc', 'party_member', 'enemy', true),
  ('npc', 'party_member', 'mentor_of', false),
  ('npc', 'party_member', 'superior_of', false),
  ('npc', 'party_member', 'chosen_family', true),
  ('npc', 'party_member', 'former_ally', true),
  ('npc', 'party_member', 'former_enemy', true),
  ('npc', 'party_member', 'employer_of', false),
  ('npc', 'party_member', 'patron_of', false),
  ('npc', 'party_member', 'creditor_of', false),
  ('npc', 'party_member', 'blackmails', false),
  ('npc', 'party_member', 'betrayed', false),
  ('npc', 'party_member', 'sworn_to', false),
  ('party_member', 'npc', 'friend', true),
  ('party_member', 'npc', 'ally', true),
  ('party_member', 'npc', 'lover', true),
  ('party_member', 'npc', 'contact', true),
  ('party_member', 'npc', 'rival', true),
  ('party_member', 'npc', 'enemy', true),
  ('party_member', 'npc', 'mentor_of', false),
  ('party_member', 'npc', 'superior_of', false),
  ('party_member', 'npc', 'chosen_family', true),
  ('party_member', 'npc', 'former_ally', true),
  ('party_member', 'npc', 'former_enemy', true),
  ('party_member', 'npc', 'employer_of', false),
  ('party_member', 'npc', 'patron_of', false),
  ('party_member', 'npc', 'creditor_of', false),
  ('party_member', 'npc', 'blackmails', false),
  ('party_member', 'npc', 'betrayed', false),
  ('party_member', 'npc', 'sworn_to', false),
  ('party_member', 'party_member', 'friend', true),
  ('party_member', 'party_member', 'ally', true),
  ('party_member', 'party_member', 'lover', true),
  ('party_member', 'party_member', 'contact', true),
  ('party_member', 'party_member', 'rival', true),
  ('party_member', 'party_member', 'enemy', true),
  ('party_member', 'party_member', 'mentor_of', false),
  ('party_member', 'party_member', 'superior_of', false),
  ('party_member', 'party_member', 'chosen_family', true),
  ('party_member', 'party_member', 'former_ally', true),
  ('party_member', 'party_member', 'former_enemy', true),
  ('party_member', 'party_member', 'employer_of', false),
  ('party_member', 'party_member', 'patron_of', false),
  ('party_member', 'party_member', 'creditor_of', false),
  ('party_member', 'party_member', 'blackmails', false),
  ('party_member', 'party_member', 'betrayed', false),
  ('party_member', 'party_member', 'sworn_to', false),
  ('npc', 'location', 'born_in', false),
  ('npc', 'location', 'rules', false),
  ('npc', 'location', 'works_at', false),
  ('npc', 'location', 'guards', false),
  ('npc', 'location', 'owns', false),
  ('npc', 'location', 'haunts', false),
  ('npc', 'location', 'hides_in', false),
  ('npc', 'location', 'buried_at', false),
  ('npc', 'location', 'exiled_from', false),
  ('npc', 'location', 'banned_from', false),
  ('npc', 'location', 'seeks', false),
  ('party_member', 'location', 'born_in', false),
  ('party_member', 'location', 'rules', false),
  ('party_member', 'location', 'works_at', false),
  ('party_member', 'location', 'guards', false),
  ('party_member', 'location', 'owns', false),
  ('party_member', 'location', 'haunts', false),
  ('party_member', 'location', 'hides_in', false),
  ('party_member', 'location', 'buried_at', false),
  ('party_member', 'location', 'exiled_from', false),
  ('party_member', 'location', 'banned_from', false),
  ('party_member', 'location', 'seeks', false),
  ('npc', 'deity', 'worships', false),
  ('npc', 'deity', 'serves', false),
  ('npc', 'deity', 'champion_of', false),
  ('npc', 'deity', 'chosen_of', false),
  ('npc', 'deity', 'blessed_by', false),
  ('npc', 'deity', 'cursed_by', false),
  ('npc', 'deity', 'defies', false),
  ('npc', 'deity', 'forsook', false),
  ('party_member', 'deity', 'worships', false),
  ('party_member', 'deity', 'serves', false),
  ('party_member', 'deity', 'champion_of', false),
  ('party_member', 'deity', 'chosen_of', false),
  ('party_member', 'deity', 'blessed_by', false),
  ('party_member', 'deity', 'cursed_by', false),
  ('party_member', 'deity', 'defies', false),
  ('party_member', 'deity', 'forsook', false),
  ('npc', 'item', 'seeks', false),
  ('npc', 'item', 'made', false),
  ('npc', 'item', 'guards', false),
  ('npc', 'item', 'stole', false),
  ('npc', 'item', 'lost', false),
  ('npc', 'item', 'owes', false),
  ('npc', 'item', 'bound_to', false),
  ('npc', 'item', 'cursed_by', false),
  ('party_member', 'item', 'seeks', false),
  ('party_member', 'item', 'made', false),
  ('party_member', 'item', 'guards', false),
  ('party_member', 'item', 'stole', false),
  ('party_member', 'item', 'lost', false),
  ('party_member', 'item', 'owes', false),
  ('party_member', 'item', 'bound_to', false),
  ('party_member', 'item', 'cursed_by', false),
  ('faction', 'faction', 'allied', false),
  ('faction', 'faction', 'friendly', false),
  ('faction', 'faction', 'neutral', false),
  ('faction', 'faction', 'suspicious', false),
  ('faction', 'faction', 'rival', false),
  ('faction', 'faction', 'hostile', false),
  ('faction', 'faction', 'secret_ally', false),
  ('faction', 'faction', 'secret_enemy', false),
  ('faction', 'location', 'controls', false),
  ('faction', 'location', 'based_in', false),
  ('faction', 'location', 'operates_in', false),
  ('faction', 'location', 'contests', false),
  ('faction', 'location', 'protects', false),
  ('faction', 'location', 'taxes', false),
  ('faction', 'location', 'raids', false),
  ('faction', 'location', 'founded', false),
  ('faction', 'location', 'banned_from', false),
  ('faction', 'deity', 'worships', false),
  ('faction', 'deity', 'serves', false),
  ('faction', 'deity', 'sponsored_by', false),
  ('faction', 'deity', 'opposes', false),
  ('faction', 'deity', 'suppresses', false),
  ('faction', 'item', 'holds', false),
  ('faction', 'item', 'seeks', false),
  ('faction', 'item', 'guards', false),
  ('faction', 'item', 'made', false),
  ('faction', 'item', 'lost', false),
  ('faction', 'item', 'forbids', false),
  ('location', 'location', 'allied_with', true),
  ('location', 'location', 'at_war_with', true),
  ('location', 'location', 'trades_with', true),
  ('location', 'location', 'rival_of', true),
  ('location', 'location', 'sister_town_of', true),
  ('location', 'location', 'liege_of', false),
  ('location', 'location', 'road_to', true),
  ('deity', 'deity', 'ally_of', true),
  ('deity', 'deity', 'rival_of', true),
  ('deity', 'deity', 'enemy_of', true),
  ('deity', 'deity', 'consort_of', true),
  ('deity', 'deity', 'parent_of', false),
  ('deity', 'deity', 'master_of', false),
  ('deity', 'deity', 'aspect_of', false),
  ('deity', 'deity', 'usurped', false),
  ('location', 'deity', 'sacred_to', false),
  ('location', 'deity', 'shrine_to', false),
  ('location', 'deity', 'blessed_by', false),
  ('location', 'deity', 'cursed_by', false),
  ('location', 'deity', 'forsaken_by', false),
  ('item', 'location', 'kept_at', false),
  ('item', 'location', 'hidden_at', false),
  ('item', 'location', 'lost_at', false),
  ('item', 'location', 'forged_at', false),
  ('item', 'deity', 'relic_of', false),
  ('item', 'deity', 'blessed_by', false),
  ('item', 'deity', 'cursed_by', false)
;
-- catalogue:end

-- ── 2. world_links ────────────────────────────────────────────────────────────
create table public.world_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  from_kind text not null,
  from_npc_id uuid references public.npcs (id) on delete cascade,
  from_party_member_id uuid references public.party_members (id) on delete cascade,
  from_faction_id uuid references public.factions (id) on delete cascade,
  from_location_id uuid references public.locations (id) on delete cascade,
  from_deity_id uuid references public.deities (id) on delete cascade,
  from_item_id uuid references public.items (id) on delete cascade,
  to_kind text not null,
  to_npc_id uuid references public.npcs (id) on delete cascade,
  to_party_member_id uuid references public.party_members (id) on delete cascade,
  to_faction_id uuid references public.factions (id) on delete cascade,
  to_location_id uuid references public.locations (id) on delete cascade,
  to_deity_id uuid references public.deities (id) on delete cascade,
  to_item_id uuid references public.items (id) on delete cascade,
  type text not null,
  -- The DM's own note; never shown to a player.
  note text not null default '',
  -- What someone who knows of the link reads (With the party's "Their connection" lives here now).
  told text not null default '',
  -- The party reveal, as on every entity: party_members ids. Nobody, to begin with.
  player_visible_to uuid[] not null default '{}',
  ai_provenance jsonb,
  from_id uuid generated always as (
    coalesce(from_npc_id, from_party_member_id, from_faction_id, from_location_id, from_deity_id, from_item_id)) stored,
  to_id uuid generated always as (
    coalesce(to_npc_id, to_party_member_id, to_faction_id, to_location_id, to_deity_id, to_item_id)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint world_links_one_from check (
    num_nonnulls(from_npc_id, from_party_member_id, from_faction_id, from_location_id, from_deity_id, from_item_id) = 1),
  constraint world_links_one_to check (
    num_nonnulls(to_npc_id, to_party_member_id, to_faction_id, to_location_id, to_deity_id, to_item_id) = 1),
  constraint world_links_from_kind check (case from_kind
    when 'npc' then from_npc_id is not null when 'party_member' then from_party_member_id is not null
    when 'faction' then from_faction_id is not null when 'location' then from_location_id is not null
    when 'deity' then from_deity_id is not null when 'item' then from_item_id is not null else false end),
  constraint world_links_to_kind check (case to_kind
    when 'npc' then to_npc_id is not null when 'party_member' then to_party_member_id is not null
    when 'faction' then to_faction_id is not null when 'location' then to_location_id is not null
    when 'deity' then to_deity_id is not null when 'item' then to_item_id is not null else false end),
  constraint world_links_not_self check (
    coalesce(from_npc_id, from_party_member_id, from_faction_id, from_location_id, from_deity_id, from_item_id)
    <> coalesce(to_npc_id, to_party_member_id, to_faction_id, to_location_id, to_deity_id, to_item_id)),
  -- A type outside its pair is refused here, by the catalogue.
  constraint world_links_type_known foreign key (from_kind, to_kind, type)
    references private.world_link_types (from_kind, to_kind, type)
);

-- One link per pair and type: a rival may also be a creditor, but never a rival twice.
create unique index world_links_one_per_type on public.world_links (from_id, to_id, type);
-- A faction's stance is held by each side for itself: one per direction, and the other side may differ.
create unique index world_links_one_stance on public.world_links (from_id, to_id)
  where from_kind = 'faction' and to_kind = 'faction';
create index world_links_campaign_idx on public.world_links (campaign_id);
create index world_links_user_idx on public.world_links (user_id);
create index world_links_to_idx on public.world_links (to_id);
create index world_links_type_idx on public.world_links (from_kind, to_kind, type);
create index world_links_from_npc_idx on public.world_links (from_npc_id) where from_npc_id is not null;
create index world_links_from_pm_idx on public.world_links (from_party_member_id) where from_party_member_id is not null;
create index world_links_from_faction_idx on public.world_links (from_faction_id) where from_faction_id is not null;
create index world_links_from_location_idx on public.world_links (from_location_id) where from_location_id is not null;
create index world_links_from_deity_idx on public.world_links (from_deity_id) where from_deity_id is not null;
create index world_links_from_item_idx on public.world_links (from_item_id) where from_item_id is not null;
create index world_links_to_npc_idx on public.world_links (to_npc_id) where to_npc_id is not null;
create index world_links_to_pm_idx on public.world_links (to_party_member_id) where to_party_member_id is not null;
create index world_links_to_faction_idx on public.world_links (to_faction_id) where to_faction_id is not null;
create index world_links_to_location_idx on public.world_links (to_location_id) where to_location_id is not null;
create index world_links_to_deity_idx on public.world_links (to_deity_id) where to_deity_id is not null;
create index world_links_to_item_idx on public.world_links (to_item_id) where to_item_id is not null;

create trigger world_links_updated_at
  before update on public.world_links
  for each row execute procedure update_updated_at();

-- A symmetric type is kept with its ends in one order, (kind, id) ascending, so "Brenna is Harl's friend" and "Harl
-- is Brenna's friend" are the same row and the unique index sees them as one. Definer only to read the catalogue,
-- which no client role can.
create function private.world_links_normalize()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_symmetric boolean;
  v_old public.world_links;
begin
  select t.is_symmetric into v_symmetric
    from private.world_link_types t
   where t.from_kind = new.from_kind and t.to_kind = new.to_kind and t.type = new.type;
  -- An unknown type is left to world_links_type_known, which names it.
  if coalesce(v_symmetric, false)
     and (new.to_kind, coalesce(new.to_npc_id, new.to_party_member_id, new.to_faction_id, new.to_location_id,
                                new.to_deity_id, new.to_item_id)::text)
       < (new.from_kind, coalesce(new.from_npc_id, new.from_party_member_id, new.from_faction_id, new.from_location_id,
                                  new.from_deity_id, new.from_item_id)::text) then
    v_old := new;
    new.from_kind := v_old.to_kind;
    new.from_npc_id := v_old.to_npc_id;
    new.from_party_member_id := v_old.to_party_member_id;
    new.from_faction_id := v_old.to_faction_id;
    new.from_location_id := v_old.to_location_id;
    new.from_deity_id := v_old.to_deity_id;
    new.from_item_id := v_old.to_item_id;
    new.to_kind := v_old.from_kind;
    new.to_npc_id := v_old.from_npc_id;
    new.to_party_member_id := v_old.from_party_member_id;
    new.to_faction_id := v_old.from_faction_id;
    new.to_location_id := v_old.from_location_id;
    new.to_deity_id := v_old.from_deity_id;
    new.to_item_id := v_old.from_item_id;
  end if;
  return new;
end;
$$;
revoke execute on function private.world_links_normalize() from public, anon, authenticated;

create trigger world_links_normalize
  before insert or update on public.world_links
  for each row execute procedure private.world_links_normalize();

-- Who wrote a link stays who wrote it: a co-DM cannot re-attribute one (and so have it vanish with someone's account).
create trigger world_links_guard_content_author
  before update on public.world_links
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();

create trigger zz_same_campaign_refs
  before insert or update of from_npc_id, from_party_member_id, from_faction_id, from_location_id, from_deity_id,
    from_item_id, to_npc_id, to_party_member_id, to_faction_id, to_location_id, to_deity_id, to_item_id, campaign_id
  on public.world_links
  for each row execute procedure private.enforce_same_campaign_refs(
    'from_npc_id', 'npcs', 'owned', 'from_party_member_id', 'party_members', 'owned',
    'from_faction_id', 'factions', 'owned', 'from_location_id', 'locations', 'owned',
    'from_deity_id', 'deities', 'owned', 'from_item_id', 'items', 'owned',
    'to_npc_id', 'npcs', 'owned', 'to_party_member_id', 'party_members', 'owned',
    'to_faction_id', 'factions', 'owned', 'to_location_id', 'locations', 'owned',
    'to_deity_id', 'deities', 'owned', 'to_item_id', 'items', 'owned');

-- Access is by campaign role, never by user_id, as kin_links: a co-DM edits the ties a fellow DM drew. Players never
-- read the table; they read their own projection, which applies the reveal and both ends' visibility.
alter table public.world_links enable row level security;
create policy "world_links_select" on public.world_links for select using (private.is_campaign_dm(campaign_id));
create policy "world_links_insert" on public.world_links for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "world_links_update" on public.world_links for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "world_links_delete" on public.world_links for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.world_links to authenticated, service_role;

create trigger world_links_signal_insert after insert on public.world_links
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger world_links_signal_update after update on public.world_links
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger world_links_signal_delete after delete on public.world_links
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

insert into private.demo_campaign_tables (table_name, tier, copy, reason) values ('world_links', 1, true, null);

-- ── 2b. A membership has its own reveal ──────────────────────────────────────
-- Knowing a faction is not knowing who is in it, though over a campaign the party learns that too. So a membership
-- carries the party reveal links and every entity carry, and the players' reads honour it (20261026213103). It starts
-- revealed to exactly the characters who can read it today: the ones in that faction, whose own membership has always
-- let them read its roster (faction_npcs_select, faction_party_members_select).
alter table public.faction_npcs add column player_visible_to uuid[] not null default '{}';
alter table public.faction_party_members add column player_visible_to uuid[] not null default '{}';
update public.faction_npcs m
   set player_visible_to = coalesce((select array_agg(o.party_member_id) from public.faction_party_members o
                                      where o.faction_id = m.faction_id), '{}');
update public.faction_party_members m
   set player_visible_to = coalesce((select array_agg(o.party_member_id) from public.faction_party_members o
                                      where o.faction_id = m.faction_id), '{}');

-- ── 3. One read for a sheet: links and records together ───────────────────────
-- Every tie of one thing, from its own side: `outward` is true when the thing is the tie's `from` end, so the client
-- reads `forward` or `reverse` from the catalogue. Invoker, so each table's own RLS decides what comes back; a row
-- whose far end the caller cannot read is dropped rather than shown nameless. Players read their own projection.
-- `p_campaign_id` narrows ties that carry a campaign (links, inventories, residents, shelves, quests) for a thing
-- that lives outside any one campaign: a vault item or a general place is shown with this campaign's ties only.
create function public.get_connections(p_kind text, p_id uuid, p_campaign_id uuid default null)
returns table (
  source text,
  row_id uuid,
  type text,
  outward boolean,
  other_kind text,
  other_id uuid,
  other_name text,
  other_image text,
  note text,
  told text,
  player_visible_to uuid[],
  role text,
  status text,
  ai_provenance jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ties (source, row_id, type, outward, other_kind, other_id, note, told, player_visible_to, role, status,
             ai_provenance, campaign_id) as (
    -- Links, either end.
    select 'link', l.id, l.type, true, l.to_kind, l.to_id, l.note, l.told, l.player_visible_to, null, null,
           l.ai_provenance, l.campaign_id
      from public.world_links l where l.from_kind = p_kind and l.from_id = p_id
    union all
    select 'link', l.id, l.type, false, l.from_kind, l.from_id, l.note, l.told, l.player_visible_to, null, null,
           l.ai_provenance, l.campaign_id
      from public.world_links l where l.to_kind = p_kind and l.to_id = p_id
    -- Membership.
    union all
    select 'membership', m.id, 'member_of', true, 'faction', m.faction_id, null, null, m.player_visible_to, m.role,
           m.status, null, null
      from public.faction_npcs m where p_kind = 'npc' and m.npc_id = p_id
    union all
    select 'membership', m.id, 'member_of', true, 'faction', m.faction_id, null, null, m.player_visible_to, m.role,
           m.status, null, null
      from public.faction_party_members m where p_kind = 'party_member' and m.party_member_id = p_id
    union all
    select 'membership', m.id, 'member_of', false, 'npc', m.npc_id, null, null, m.player_visible_to, m.role, m.status,
           null, null
      from public.faction_npcs m where p_kind = 'faction' and m.faction_id = p_id
    union all
    select 'membership', m.id, 'member_of', false, 'party_member', m.party_member_id, null, null, m.player_visible_to,
           m.role, m.status, null, null
      from public.faction_party_members m where p_kind = 'faction' and m.faction_id = p_id
    -- An NPC's home.
    union all
    select 'npc_home', n.id, 'lives_in', true, 'location', n.location_id, null, null, null, null, null, null, null
      from public.npcs n where p_kind = 'npc' and n.id = p_id and n.location_id is not null
    union all
    select 'npc_home', n.id, 'lives_in', false, 'npc', n.id, null, null, null, null, null, null, n.campaign_id
      from public.npcs n where p_kind = 'location' and n.location_id = p_id
    -- A PC's place.
    union all
    select 'pc_place', pm.id, 'is_at', true, 'location', pm.current_location_id, null, null, null, null, null, null,
           null
      from public.party_members pm
     where p_kind = 'party_member' and pm.id = p_id and pm.current_location_id is not null
    union all
    select 'pc_place', pm.id, 'is_at', false, 'party_member', pm.id, null, null, null, null, null, null,
           pm.campaign_id
      from public.party_members pm where p_kind = 'location' and pm.current_location_id = p_id
    -- A venue's keeper.
    union all
    select 'keeper', lo.id, 'keeps', true, 'location', lo.id, null, null, null, null, null, null, null
      from public.locations lo where p_kind = 'npc' and lo.npc_owner_id = p_id
    union all
    select 'keeper', lo.id, 'keeps', false, 'npc', lo.npc_owner_id, null, null, null, null, null, null, null
      from public.locations lo where p_kind = 'location' and lo.id = p_id and lo.npc_owner_id is not null
    -- A house's seat.
    union all
    select 'seat', f.id, 'seat', true, 'location', f.seat_location_id, null, null, null, null, null, null, null
      from public.factions f where p_kind = 'faction' and f.id = p_id and f.seat_location_id is not null
    union all
    select 'seat', f.id, 'seat', false, 'faction', f.id, null, null, null, null, null, null, null
      from public.factions f where p_kind = 'location' and f.seat_location_id = p_id
    -- A PC's patron deity.
    union all
    select 'patron_deity', pm.id, 'patron_deity', true, 'deity', pm.deity_id, null, null, null, null, null, null, null
      from public.party_members pm where p_kind = 'party_member' and pm.id = p_id and pm.deity_id is not null
    union all
    select 'patron_deity', pm.id, 'patron_deity', false, 'party_member', pm.id, null, null, null, null, null, null,
           null
      from public.party_members pm where p_kind = 'deity' and pm.deity_id = p_id
    -- What someone carries. A row with no item of the campaign's own (a library or a hand-typed one) has no sheet to
    -- point at, so it is not a tie.
    union all
    select 'inventory', i.id, 'carries', true, 'item', i.item_id, null, null, null, null, null, null, i.campaign_id
      from public.npc_inventory i where p_kind = 'npc' and i.npc_id = p_id and i.item_id is not null
    union all
    select 'inventory', i.id, 'carries', true, 'item', i.item_id, null, null, null, null, null, null, i.campaign_id
      from public.party_inventory i where p_kind = 'party_member' and i.carried_by = p_id and i.item_id is not null
    union all
    select 'inventory', i.id, 'carries', false, 'npc', i.npc_id, null, null, null, null, null, null, i.campaign_id
      from public.npc_inventory i where p_kind = 'item' and i.item_id = p_id
    union all
    select 'inventory', i.id, 'carries', false, 'party_member', i.carried_by, null, null, null, null, null, null,
           i.campaign_id
      from public.party_inventory i where p_kind = 'item' and i.item_id = p_id and i.carried_by is not null
    -- What a store sells.
    union all
    select 'store', s.id, 'sold_at', true, 'location', s.location_id, null, null, null, null, null, null,
           (select lo.campaign_id from public.locations lo where lo.id = s.location_id)
      from public.store_items s where p_kind = 'item' and s.item_id = p_id
    union all
    select 'store', s.id, 'sold_at', false, 'item', s.item_id, null, null, null, null, null, null,
           (select lo.campaign_id from public.locations lo where lo.id = s.location_id)
      from public.store_items s where p_kind = 'location' and s.location_id = p_id and s.item_id is not null
    -- A quest's own records, read from the thing's side (the quest is always the `from`).
    union all
    select 'quest', q.id, 'quest_giver', false, 'quest', q.id, null, null, null, null, q.status::text, null,
           q.campaign_id
      from public.quests q where p_kind = 'npc' and q.giver_npc_id = p_id
    union all
    select 'quest', q.id, 'quest_place', false, 'quest', q.id, null, null, null, null, q.status::text, null,
           q.campaign_id
      from public.quests q where p_kind = 'location' and q.location_id = p_id
    union all
    select 'quest', r.id, 'quest_ref', false, 'quest', r.quest_id, null, null, null, null, q.status::text, null,
           q.campaign_id
      from public.quest_refs r
      join public.quests q on q.id = r.quest_id
     where r.ref_type = p_kind and r.ref_id = p_id::text
       -- Already said by the giver or the place.
       and q.giver_npc_id is distinct from p_id and q.location_id is distinct from p_id
  )
  select t.source, t.row_id, t.type, t.outward, t.other_kind, t.other_id,
         coalesce(n.name, pm.name, f.name, lo.name, d.name, i.name, q.title),
         coalesce(n.portrait_url, pm.portrait_url, f.emblem_url, lo.image_url, d.portrait_url, d.symbol_image_url,
                  i.image_url),
         t.note, t.told, t.player_visible_to, t.role, t.status, t.ai_provenance
    from ties t
    left join public.npcs n on t.other_kind = 'npc' and n.id = t.other_id
    left join public.party_members pm on t.other_kind = 'party_member' and pm.id = t.other_id
    left join public.factions f on t.other_kind = 'faction' and f.id = t.other_id
    left join public.locations lo on t.other_kind = 'location' and lo.id = t.other_id
    left join public.deities d on t.other_kind = 'deity' and d.id = t.other_id
    left join public.items i on t.other_kind = 'item' and i.id = t.other_id
    left join public.quests q on t.other_kind = 'quest' and q.id = t.other_id
   where coalesce(n.id, pm.id, f.id, lo.id, d.id, i.id, q.id) is not null
     and (p_campaign_id is null or t.campaign_id is null or t.campaign_id = p_campaign_id)
$$;

revoke execute on function public.get_connections(text, uuid, uuid) from public, anon;
grant execute on function public.get_connections(text, uuid, uuid) to authenticated, service_role;
