-- The campaign's canon (#1226, story 2): one table for the world's larger shape, and the world web's seventh kind.
--
-- The design is the canvas *Campaign Canon* (claude.ai artifact MAukzQW1bDDG832DT4ZepT), approved 19 Nov 2026; the
-- decisions are in the epic's body. Every part (premise and tone, truths, what is moving, secrets and questions,
-- lore, the chronicle) shares a title, a rich-text body, a picture, the party reveal and links, so one table carries
-- them and a part differs by a few columns. Later stories add their own columns and child tables (a force's steps, a
-- lore entry's passages, a secret's clues); this migration builds what story 2 shows and the kind every part links
-- through.
--
-- Canon lives in its own table, never on the `campaigns` row: every member of a campaign, players included, can
-- read that row (campaigns_select), so nothing the DM keeps back may sit there (#1228 is the same lesson for keys).

-- ── 1. canon_entries ──────────────────────────────────────────────────────────
create table public.canon_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  part text not null
    constraint canon_entries_part check (part in ('premise', 'truth', 'force', 'secret', 'question', 'lore', 'chronicle')),
  -- Premise and tone is a short list of its own: the pitch, themes, what it is like at the table, the voice its text
  -- is written in and the look its pictures are painted in (what every AI suggestion reads), and lines and veils.
  premise_kind text
    constraint canon_entries_premise_kind_known check (premise_kind in ('pitch', 'theme', 'table', 'voice', 'look', 'line', 'veil')),
  -- A truth says who knows it. 'some' names them through world_links (`known_to`), never in free text.
  knowledge text
    constraint canon_entries_knowledge_known check (knowledge in ('all', 'some', 'secret')),
  -- A one-line entry (a truth, a theme, a line) is its title; a longer one (the pitch, lore) has a body too.
  title text not null default '',
  -- Tiptap JSON, as a note's content; DM-only secret blocks are withheld from players by the projection.
  body text,
  sort_order integer not null default 0,
  -- The party reveal every entity carries (party_members ids). A truth ignores it: its knowledge mark is its audience.
  player_visible_to uuid[] not null default '{}',
  image_url text,
  ai_provenance jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canon_entries_premise_has_kind check ((part = 'premise') = (premise_kind is not null)),
  constraint canon_entries_truth_has_knowledge check ((part = 'truth') = (knowledge is not null))
);

create index canon_entries_campaign_part_idx on public.canon_entries (campaign_id, part, sort_order);
create index canon_entries_user_idx on public.canon_entries (user_id);

create trigger canon_entries_updated_at
  before update on public.canon_entries
  for each row execute procedure update_updated_at();

-- An entry's part never changes. Each part has its own audience and its own child rows (a lore entry's passages, a
-- secret's clues, a force's steps), so a lore entry turned into a truth known to all would hand every member its
-- untold passages. A DM who wants a truth from a fact makes a new entry ("Make it a truth" does).
create function private.canon_entries_part_is_fixed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.part is distinct from old.part then
    raise exception using errcode = '23514', message = 'A canon entry''s part does not change: make a new entry';
  end if;
  return new;
end;
$$;
revoke execute on function private.canon_entries_part_is_fixed() from public, anon, authenticated;

create trigger canon_entries_part_is_fixed
  before update of part on public.canon_entries
  for each row execute procedure private.canon_entries_part_is_fixed();

-- Who wrote an entry stays who wrote it, as on world_links.
create trigger canon_entries_guard_content_author
  before update on public.canon_entries
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();

-- An entry the AI wrote is marked edited the first time its words change, whoever changes them (the page, MCP, a later
-- story's editor): the AI Act's marking follows the text, not the screen that edited it. A write that re-stamps the
-- provenance itself (an accepted suggestion replacing the text) is left alone, and `edited` never goes back to false.
create function private.canon_entries_mark_edited()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.ai_provenance is not null
     and new.ai_provenance is not distinct from old.ai_provenance
     and coalesce((old.ai_provenance ->> 'edited')::boolean, false) = false
     and (new.title is distinct from old.title or new.body is distinct from old.body) then
    new.ai_provenance := jsonb_set(old.ai_provenance, '{edited}', 'true'::jsonb);
  end if;
  return new;
end;
$$;
revoke execute on function private.canon_entries_mark_edited() from public, anon, authenticated;

create trigger canon_entries_mark_edited
  before update on public.canon_entries
  for each row execute procedure private.canon_entries_mark_edited();

-- By campaign role, as world_links: a co-DM edits the canon a fellow DM wrote. Players never read the table; they read
-- get_player_canon, which applies each part's own audience.
alter table public.canon_entries enable row level security;
create policy "canon_entries_select" on public.canon_entries for select using (private.is_campaign_dm(campaign_id));
create policy "canon_entries_insert" on public.canon_entries for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "canon_entries_update" on public.canon_entries for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "canon_entries_delete" on public.canon_entries for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.canon_entries to authenticated, service_role;

create trigger canon_entries_signal_insert after insert on public.canon_entries
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger canon_entries_signal_update after update on public.canon_entries
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger canon_entries_signal_delete after delete on public.canon_entries
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

insert into private.demo_campaign_tables (table_name, tier, copy, reason) values ('canon_entries', 1, true, null);

-- ── 3. The premise takes over the campaign row's pitch and the AI tab's setting prompt ─────────────────────────────
-- No legacy: one place for the pitch. `campaigns.description` (no edit field; shown on the campaign card) becomes the
-- pitch, shared with the party as the row was; `ai_setting_prompt` (a DM-only brief for the generators) becomes a pitch
-- the DM keeps to themselves until they share it. In production on 19 Nov 2026 two campaigns had a description and one
-- a setting prompt, never both, so nothing is merged. Plain text becomes a Tiptap document, one paragraph per block.
create function private.plain_text_to_tiptap(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('type', 'doc', 'content', coalesce(jsonb_agg(
           jsonb_build_object('type', 'paragraph', 'content',
             jsonb_build_array(jsonb_build_object('type', 'text', 'text', p.para))) order by p.n), '[]'::jsonb))::text
    from (select trim(t.para) as para, t.n
            from regexp_split_to_table(p_text, E'\\n\\s*\\n') with ordinality as t(para, n)) p
   where p.para <> ''
$$;
revoke execute on function private.plain_text_to_tiptap(text) from public, anon, authenticated;

insert into public.canon_entries (user_id, campaign_id, part, premise_kind, body, player_visible_to)
select c.user_id, c.id, 'premise', 'pitch', private.plain_text_to_tiptap(c.description),
       coalesce((select array_agg(pm.id) from public.party_members pm where pm.campaign_id = c.id), '{}')
  from public.campaigns c
 where nullif(trim(c.description), '') is not null;

insert into public.canon_entries (user_id, campaign_id, part, premise_kind, body)
select c.user_id, c.id, 'premise', 'pitch', private.plain_text_to_tiptap(c.ai_setting_prompt)
  from public.campaigns c
 where nullif(trim(c.ai_setting_prompt), '') is not null;

drop function private.plain_text_to_tiptap(text);

alter table public.campaigns drop column description, drop column ai_setting_prompt;

-- ── 4. The world web's seventh kind ───────────────────────────────────────────
-- A canon entry is a link end like any other (supabase/functions/_shared/worldLinkCatalogue.ts, the canon_* pairs):
-- it is about people, places and powers, took place somewhere, is known to some, and led to other entries.
alter table public.world_links
  add column from_canon_entry_id uuid references public.canon_entries (id) on delete cascade,
  add column to_canon_entry_id uuid references public.canon_entries (id) on delete cascade;

-- The generated ends name every kind, so they are rebuilt (a generated column cannot be altered); their indexes go with
-- them and come back below.
alter table public.world_links
  drop constraint world_links_one_from,
  drop constraint world_links_one_to,
  drop constraint world_links_from_kind,
  drop constraint world_links_to_kind,
  drop constraint world_links_not_self;
alter table public.world_links drop column from_id, drop column to_id;
alter table public.world_links
  add column from_id uuid generated always as (coalesce(from_npc_id, from_party_member_id, from_faction_id, from_location_id, from_deity_id, from_item_id, from_canon_entry_id)) stored,
  add column to_id uuid generated always as (coalesce(to_npc_id, to_party_member_id, to_faction_id, to_location_id, to_deity_id, to_item_id, to_canon_entry_id)) stored;

alter table public.world_links
  add constraint world_links_one_from check (num_nonnulls(from_npc_id, from_party_member_id, from_faction_id, from_location_id, from_deity_id, from_item_id, from_canon_entry_id) = 1),
  add constraint world_links_one_to check (num_nonnulls(to_npc_id, to_party_member_id, to_faction_id, to_location_id, to_deity_id, to_item_id, to_canon_entry_id) = 1),
  add constraint world_links_from_kind check (case from_kind
    when 'npc' then from_npc_id is not null when 'party_member' then from_party_member_id is not null
    when 'faction' then from_faction_id is not null when 'location' then from_location_id is not null
    when 'deity' then from_deity_id is not null when 'item' then from_item_id is not null
    when 'canon' then from_canon_entry_id is not null else false end),
  add constraint world_links_to_kind check (case to_kind
    when 'npc' then to_npc_id is not null when 'party_member' then to_party_member_id is not null
    when 'faction' then to_faction_id is not null when 'location' then to_location_id is not null
    when 'deity' then to_deity_id is not null when 'item' then to_item_id is not null
    when 'canon' then to_canon_entry_id is not null else false end),
  add constraint world_links_not_self check (coalesce(from_npc_id, from_party_member_id, from_faction_id, from_location_id, from_deity_id, from_item_id, from_canon_entry_id) <> coalesce(to_npc_id, to_party_member_id, to_faction_id, to_location_id, to_deity_id, to_item_id, to_canon_entry_id));

create unique index world_links_one_per_type on public.world_links (from_id, to_id, type);
create unique index world_links_one_stance on public.world_links (from_id, to_id)
  where from_kind = 'faction' and to_kind = 'faction';
create index world_links_to_idx on public.world_links (to_id);
create index world_links_from_canon_idx on public.world_links (from_canon_entry_id) where from_canon_entry_id is not null;
create index world_links_to_canon_idx on public.world_links (to_canon_entry_id) where to_canon_entry_id is not null;

drop trigger zz_same_campaign_refs on public.world_links;
create trigger zz_same_campaign_refs
  before insert or update of from_npc_id, from_party_member_id, from_faction_id, from_location_id, from_deity_id, from_item_id, from_canon_entry_id,
    to_npc_id, to_party_member_id, to_faction_id, to_location_id, to_deity_id, to_item_id, to_canon_entry_id, campaign_id
  on public.world_links
  for each row execute procedure private.enforce_same_campaign_refs(
    'from_npc_id', 'npcs', 'owned', 'from_party_member_id', 'party_members', 'owned',
    'from_faction_id', 'factions', 'owned', 'from_location_id', 'locations', 'owned',
    'from_deity_id', 'deities', 'owned', 'from_item_id', 'items', 'owned',
    'from_canon_entry_id', 'canon_entries', 'owned',
    'to_npc_id', 'npcs', 'owned', 'to_party_member_id', 'party_members', 'owned',
    'to_faction_id', 'factions', 'owned', 'to_location_id', 'locations', 'owned',
    'to_deity_id', 'deities', 'owned', 'to_item_id', 'items', 'owned',
    'to_canon_entry_id', 'canon_entries', 'owned');

-- The catalogue, restated whole: src/lib/worldLinks/catalogueMirror.test.ts reads the newest block between the markers.
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
  ('item', 'deity', 'cursed_by', false),
  ('canon', 'npc', 'about', false),
  ('canon', 'npc', 'known_to', false),
  ('canon', 'party_member', 'about', false),
  ('canon', 'party_member', 'known_to', false),
  ('canon', 'faction', 'about', false),
  ('canon', 'faction', 'known_to', false),
  ('canon', 'location', 'about', false),
  ('canon', 'location', 'took_place_at', false),
  ('canon', 'deity', 'about', false),
  ('canon', 'item', 'about', false),
  ('canon', 'canon', 'led_to', false),
  ('canon', 'canon', 'related_to', true)
on conflict do nothing;
-- catalogue:end

-- Symmetric ends are ordered with the canon columns too.
create or replace function private.world_links_normalize()
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
                                new.to_deity_id, new.to_item_id, new.to_canon_entry_id)::text)
       < (new.from_kind, coalesce(new.from_npc_id, new.from_party_member_id, new.from_faction_id, new.from_location_id,
                                  new.from_deity_id, new.from_item_id, new.from_canon_entry_id)::text) then
    v_old := new;
    new.from_kind := v_old.to_kind;
    new.from_npc_id := v_old.to_npc_id;
    new.from_party_member_id := v_old.to_party_member_id;
    new.from_faction_id := v_old.to_faction_id;
    new.from_location_id := v_old.to_location_id;
    new.from_deity_id := v_old.to_deity_id;
    new.from_item_id := v_old.to_item_id;
    new.from_canon_entry_id := v_old.to_canon_entry_id;
    new.to_kind := v_old.from_kind;
    new.to_npc_id := v_old.from_npc_id;
    new.to_party_member_id := v_old.from_party_member_id;
    new.to_faction_id := v_old.from_faction_id;
    new.to_location_id := v_old.from_location_id;
    new.to_deity_id := v_old.from_deity_id;
    new.to_item_id := v_old.from_item_id;
    new.to_canon_entry_id := v_old.from_canon_entry_id;
  end if;
  return new;
end;
$$;

-- ── 2. Who among the party may read an entry ──────────────────────────────────
-- One rule, used by the players' read and by the players' web, so the two never disagree. Total: an absent entry or
-- member is false, never NULL (CLAUDE.md, migration rules item 3).
--  - A truth: known to all is every member's; known to some is the members it is `known_to` directly, and the members
--    of a faction it is known to; a secret truth is nobody's.
--  - Premise and tone: what the DM shared, except the voice and the look, which are the AI's brief and nobody else's.
--  - Lore and the chronicle: what the DM shared.
--  - What is moving and open questions: never. A secret: never yet (story 3 reveals one).
create function private.canon_entry_seen(p_entry_id uuid, p_member uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select case e.part
      when 'truth' then
        e.knowledge = 'all'
        or (e.knowledge = 'some' and exists (
              select 1 from public.world_links l
               where l.from_canon_entry_id = e.id and l.type = 'known_to'
                 and (l.to_party_member_id = p_member
                      or exists (select 1 from public.faction_party_members m
                                  where m.faction_id = l.to_faction_id and m.party_member_id = p_member))))
      when 'premise' then e.premise_kind not in ('voice', 'look') and p_member = any (e.player_visible_to)
      when 'lore' then p_member = any (e.player_visible_to)
      when 'chronicle' then p_member = any (e.player_visible_to)
      else false
    end
      from public.canon_entries e
     where e.id = p_entry_id and p_member is not null), false)
$$;
revoke execute on function private.canon_entry_seen(uuid, uuid) from public, anon, authenticated;

-- The players' read. A player reads as their own seat; a DM previews as one member. It returns its own columns, not
-- the table's row, so a column a later story adds is never handed out by accident and never breaks this read: who
-- wrote it, the campaign and the reveal list (it names who else was told) are left out, and secret blocks in the body
-- are withheld.
create function public.get_player_canon(p_campaign_id uuid, p_preview_member_id uuid default null)
returns table (
  id uuid,
  part text,
  premise_kind text,
  knowledge text,
  title text,
  body text,
  sort_order integer,
  image_url text,
  ai_provenance jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with me (member) as (
    select cm.party_member_id from public.campaign_members cm
     where cm.campaign_id = p_campaign_id and cm.user_id = (select auth.uid()) and cm.party_member_id is not null
       and p_preview_member_id is null
    union
    select p_preview_member_id
     where p_preview_member_id is not null and private.is_campaign_dm(p_campaign_id)
       and exists (select 1 from public.party_members pm
                    where pm.id = p_preview_member_id and pm.campaign_id = p_campaign_id)
  )
  select e.id, e.part, e.premise_kind, e.knowledge, e.title, private.withhold_secret_blocks(e.body), e.sort_order,
         e.image_url, e.ai_provenance, e.created_at, e.updated_at
    from public.canon_entries e
   where e.campaign_id = p_campaign_id
     and exists (select 1 from me where private.canon_entry_seen(e.id, me.member))
   order by e.part, e.sort_order, e.created_at
$$;
revoke execute on function public.get_player_canon(uuid, uuid) from public, anon;
grant execute on function public.get_player_canon(uuid, uuid) to authenticated, service_role;

-- ── 5. The reads that name every kind ─────────────────────────────────────────
create or replace function public.get_connections(p_kind text, p_id uuid, p_campaign_id uuid default null)
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
         coalesce(n.name, pm.name, f.name, lo.name, d.name, i.name, q.title, nullif(ce.title, '')),
         coalesce(n.portrait_url, pm.portrait_url, f.emblem_url, lo.image_url, d.portrait_url, d.symbol_image_url,
                  i.image_url, ce.image_url),
         t.note, t.told, t.player_visible_to, t.role, t.status, t.ai_provenance
    from ties t
    left join public.npcs n on t.other_kind = 'npc' and n.id = t.other_id
    left join public.party_members pm on t.other_kind = 'party_member' and pm.id = t.other_id
    left join public.factions f on t.other_kind = 'faction' and f.id = t.other_id
    left join public.locations lo on t.other_kind = 'location' and lo.id = t.other_id
    left join public.deities d on t.other_kind = 'deity' and d.id = t.other_id
    left join public.items i on t.other_kind = 'item' and i.id = t.other_id
    left join public.quests q on t.other_kind = 'quest' and q.id = t.other_id
    left join public.canon_entries ce on t.other_kind = 'canon' and ce.id = t.other_id
   where coalesce(n.id, pm.id, f.id, lo.id, d.id, i.id, q.id, ce.id) is not null
     and (p_campaign_id is null or t.campaign_id is null or t.campaign_id = p_campaign_id)
$$;

create or replace function public.get_world_ties(p_campaign_id uuid)
returns table (
  source text,
  row_id uuid,
  type text,
  from_kind text,
  from_id uuid,
  from_name text,
  from_image text,
  to_kind text,
  to_id uuid,
  to_name text,
  to_image text,
  note text,
  told text,
  player_visible_to uuid[],
  role text,
  status text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ties (source, row_id, type, from_kind, from_id, to_kind, to_id, note, told, player_visible_to, role, status) as (
    select 'link', l.id, l.type, l.from_kind, l.from_id, l.to_kind, l.to_id, l.note, l.told, l.player_visible_to, null, null
      from public.world_links l where l.campaign_id = p_campaign_id
    union all
    select 'kin', k.id, k.kind || '_of',
           case when k.from_npc_id is not null then 'npc' else 'party_member' end,
           coalesce(k.from_npc_id, k.from_party_member_id),
           case when k.to_npc_id is not null then 'npc' else 'party_member' end,
           coalesce(k.to_npc_id, k.to_party_member_id), nullif(k.note, ''), null, null, k.parent_role, null
      from public.kin_links k where k.campaign_id = p_campaign_id
    union all
    select 'membership', m.id, 'member_of', 'npc', m.npc_id, 'faction', m.faction_id, null, null, m.player_visible_to,
           m.role, m.status
      from public.faction_npcs m join public.factions f on f.id = m.faction_id where f.campaign_id = p_campaign_id
    union all
    select 'membership', m.id, 'member_of', 'party_member', m.party_member_id, 'faction', m.faction_id, null, null,
           m.player_visible_to, m.role, m.status
      from public.faction_party_members m join public.factions f on f.id = m.faction_id
     where f.campaign_id = p_campaign_id
    union all
    select 'npc_home', n.id, 'lives_in', 'npc', n.id, 'location', n.location_id, null, null, null, null, null
      from public.npcs n where n.campaign_id = p_campaign_id and n.location_id is not null
    union all
    select 'pc_place', pm.id, 'is_at', 'party_member', pm.id, 'location', pm.current_location_id, null, null, null, null, null
      from public.party_members pm where pm.campaign_id = p_campaign_id and pm.current_location_id is not null
    union all
    select 'keeper', lo.id, 'keeps', 'npc', lo.npc_owner_id, 'location', lo.id, null, null, null, null, null
      from public.locations lo where lo.campaign_id = p_campaign_id and lo.npc_owner_id is not null
    union all
    select 'seat', f.id, 'seat', 'faction', f.id, 'location', f.seat_location_id, null, null, null, null, null
      from public.factions f where f.campaign_id = p_campaign_id and f.seat_location_id is not null
    union all
    select 'patron_deity', pm.id, 'patron_deity', 'party_member', pm.id, 'deity', pm.deity_id, null, null, null, null, null
      from public.party_members pm where pm.campaign_id = p_campaign_id and pm.deity_id is not null
    union all
    select 'inventory', i.id, 'carries', 'npc', i.npc_id, 'item', i.item_id, null, null, null, null, null
      from public.npc_inventory i where i.campaign_id = p_campaign_id and i.item_id is not null
    union all
    select 'inventory', i.id, 'carries', 'party_member', i.carried_by, 'item', i.item_id, null, null, null, null, null
      from public.party_inventory i
     where i.campaign_id = p_campaign_id and i.item_id is not null and i.carried_by is not null
    union all
    select 'store', s.id, 'sold_at', 'item', s.item_id, 'location', s.location_id, null, null, null, null, null
      from public.store_items s join public.locations lo on lo.id = s.location_id
     where lo.campaign_id = p_campaign_id and s.item_id is not null
    union all
    select 'quest', q.id, 'quest_giver', 'quest', q.id, 'npc', q.giver_npc_id, null, null, null, null, q.status::text
      from public.quests q where q.campaign_id = p_campaign_id and q.giver_npc_id is not null
    union all
    select 'quest', q.id, 'quest_place', 'quest', q.id, 'location', q.location_id, null, null, null, null, q.status::text
      from public.quests q where q.campaign_id = p_campaign_id and q.location_id is not null
    union all
    select 'quest', r.id, 'quest_ref', 'quest', q.id, r.ref_type, case when r.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then r.ref_id::uuid end, null, null, null, null, q.status::text
      from public.quest_refs r join public.quests q on q.id = r.quest_id
     where q.campaign_id = p_campaign_id and r.ref_type in ('npc', 'location', 'faction', 'item')
       and r.ref_id is distinct from q.giver_npc_id::text and r.ref_id is distinct from q.location_id::text
       -- A shared-library ref holds a text slug, not a row of this campaign: it names nothing a tie can reach.
       and r.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  names (kind, id, name, image) as (
    select 'npc', n.id, n.name, n.portrait_url from public.npcs n where n.campaign_id = p_campaign_id
    union all
    select 'party_member', pm.id, pm.name, pm.portrait_url from public.party_members pm
     where pm.campaign_id = p_campaign_id
    union all
    select 'faction', f.id, f.name, f.emblem_url from public.factions f where f.campaign_id = p_campaign_id
    union all
    select 'location', lo.id, lo.name, lo.image_url from public.locations lo where lo.campaign_id = p_campaign_id
    union all
    select 'deity', d.id, d.name, coalesce(d.portrait_url, d.symbol_image_url) from public.deities d
     where d.campaign_id = p_campaign_id
    union all
    -- The campaign's own items and the DM's vault (campaign_id null), which a campaign's packs may hold.
    select 'item', i.id, i.name, i.image_url from public.items i
     where i.campaign_id = p_campaign_id or i.campaign_id is null
    union all
    select 'quest', q.id, q.title, null from public.quests q where q.campaign_id = p_campaign_id
    union all
    select 'canon', ce.id, ce.title, ce.image_url from public.canon_entries ce where ce.campaign_id = p_campaign_id
  )
  select t.source, t.row_id, t.type, t.from_kind, t.from_id, a.name, a.image, t.to_kind, t.to_id, b.name, b.image,
         t.note, t.told, t.player_visible_to, t.role, t.status
    from ties t
    join names a on a.kind = t.from_kind and a.id = t.from_id
    join names b on b.kind = t.to_kind and b.id = t.to_id
$$;

CREATE OR REPLACE FUNCTION private.player_world_ties(p_campaign_id uuid, p_member uuid, p_preview uuid)
 RETURNS TABLE(source text, row_id uuid, type text, from_kind text, from_id uuid, from_name text, from_image text, to_kind text, to_id uuid, to_name text, to_image text, told text, role text, status text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with seen_npcs as (
    select v.id, v.name, v.portrait_url, v.location_id
      from public.get_player_visible_npcs(p_campaign_id, null, p_preview) v
     where v.name is not null
  ),
  seen_factions as (
    select v.id, v.name, v.emblem_url, v.seat_location_id
      from public.get_player_visible_factions(p_campaign_id, p_preview) v
  ),
  seen_locations as (
    select lo.id, lo.name, lo.image_url, lo.is_inventory_shared
      from public.locations lo
     where lo.campaign_id = p_campaign_id and p_member = any (lo.player_visible_to)
  ),
  seen_items as (
    select i.id, i.name, i.image_url from public.items i
     where exists (select 1 from public.party_inventory pi
                    where pi.campaign_id = p_campaign_id and pi.item_id = i.id)
        or exists (select 1 from public.store_items s join seen_locations sl on sl.id = s.location_id
                    where s.item_id = i.id and s.visible and sl.is_inventory_shared)
  ),
  seen (kind, id, name, image) as (
    select 'npc', n.id, n.name, n.portrait_url from seen_npcs n
    union all
    select 'party_member', pm.id, pm.name, pm.portrait_url from public.party_members pm
     where pm.campaign_id = p_campaign_id
    union all
    select 'faction', f.id, f.name, f.emblem_url from seen_factions f
    union all
    select 'location', lo.id, lo.name, lo.image_url from seen_locations lo
    union all
    select 'deity', d.id, d.name, coalesce(d.portrait_url, d.symbol_image_url) from public.deities d
     where d.campaign_id = p_campaign_id and p_member = any (d.player_visible_to)
    union all
    select 'item', i.id, i.name, i.image_url from seen_items i
    union all
    select 'quest', q.id, q.title, null from public.quests q
     where q.campaign_id = p_campaign_id and private.quest_shown_to(q.id, p_member)
    union all
    select 'canon', ce.id, ce.title, ce.image_url from public.canon_entries ce
     where ce.campaign_id = p_campaign_id and private.canon_entry_seen(ce.id, p_member)
  ),
  ties (source, row_id, type, from_kind, from_id, to_kind, to_id, told, role, status) as (
    select 'link', l.id, l.type, l.from_kind, l.from_id, l.to_kind, l.to_id, nullif(l.told, ''), null, null
      from public.world_links l where l.campaign_id = p_campaign_id and p_member = any (l.player_visible_to)
    union all
    select 'membership', m.id, 'member_of', 'npc', m.npc_id, 'faction', m.faction_id, null, m.role, m.status
      from public.faction_npcs m join seen_factions f on f.id = m.faction_id
     where (p_member = any (m.player_visible_to) or private.in_faction(m.faction_id, p_member))
       -- A disguised NPC is seen under the cover; the true one's allegiances stay the DM's until the cover falls.
       and not exists (select 1 from public.npcs n
                        where n.id = m.npc_id and not n.is_revealed
                          and (n.disguise_name is not null or n.disguise_portrait_url is not null))
    union all
    select 'membership', m.id, 'member_of', 'party_member', m.party_member_id, 'faction', m.faction_id, null, m.role,
           m.status
      from public.faction_party_members m join seen_factions f on f.id = m.faction_id
     where m.party_member_id = p_member or p_member = any (m.player_visible_to)
        or private.in_faction(m.faction_id, p_member)
    union all
    select 'npc_home', n.id, 'lives_in', 'npc', n.id, 'location', n.location_id, null, null, null
      from seen_npcs n where n.location_id is not null
    union all
    select 'pc_place', pm.id, 'is_at', 'party_member', pm.id, 'location', pm.current_location_id, null, null, null
      from public.party_members pm where pm.campaign_id = p_campaign_id and pm.current_location_id is not null
    union all
    select 'keeper', lo.id, 'keeps', 'npc', lo.npc_owner_id, 'location', lo.id, null, null, null
      from public.locations lo where lo.campaign_id = p_campaign_id and lo.npc_owner_id is not null
    union all
    select 'seat', f.id, 'seat', 'faction', f.id, 'location', f.seat_location_id, null, null, null
      from seen_factions f where f.seat_location_id is not null
    union all
    select 'patron_deity', pm.id, 'patron_deity', 'party_member', pm.id, 'deity', pm.deity_id, null, null, null
      from public.party_members pm where pm.campaign_id = p_campaign_id and pm.deity_id is not null
    union all
    select 'inventory', i.id, 'carries', 'party_member', i.carried_by, 'item', i.item_id, null, null, null
      from public.party_inventory i
     where i.campaign_id = p_campaign_id and i.item_id is not null and i.carried_by is not null
    union all
    select 'store', s.id, 'sold_at', 'item', s.item_id, 'location', s.location_id, null, null, null
      from public.store_items s join seen_locations sl on sl.id = s.location_id
     where s.item_id is not null and s.visible and sl.is_inventory_shared
    union all
    select 'quest', q.id, 'quest_giver', 'quest', q.id, 'npc', q.giver_npc_id, null, null, q.status::text
      from public.quests q where q.campaign_id = p_campaign_id and q.giver_npc_id is not null
    union all
    select 'quest', q.id, 'quest_place', 'quest', q.id, 'location', q.location_id, null, null, q.status::text
      from public.quests q where q.campaign_id = p_campaign_id and q.location_id is not null
    union all
    select 'quest', r.id, 'quest_ref', 'quest', q.id, r.ref_type, case when r.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then r.ref_id::uuid end, null, null, q.status::text
      from public.quest_refs r join public.quests q on q.id = r.quest_id
     where q.campaign_id = p_campaign_id and r.is_player_visible and r.ref_type in ('npc', 'location', 'faction', 'item')
       and r.ref_id is distinct from q.giver_npc_id::text and r.ref_id is distinct from q.location_id::text
       -- A shared-library ref holds a text slug, not a row of this campaign: it names nothing a tie can reach.
       and r.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  -- Both ends must be seen; the joins are the rule.
  select t.source, t.row_id, t.type, t.from_kind, t.from_id, a.name, a.image, t.to_kind, t.to_id, b.name, b.image,
         t.told, t.role, t.status
    from ties t
    join seen a on a.kind = t.from_kind and a.id = t.from_id
    join seen b on b.kind = t.to_kind and b.id = t.to_id
$function$;

-- ── 6. Canon changes hands with its campaign ──────────────────────────────────
-- Restated whole from 20261119121114 with the one line added, so it must stay the later of the two.
CREATE OR REPLACE FUNCTION private.move_campaign_content(p_campaign_id uuid, p_from uuid, p_to uuid, p_scoped_homebrew boolean, p_player_rows boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_prev_move  text := current_setting('grimoire.content_move', true);
  v_prev_quota text := current_setting('grimoire.bypass_quota', true);
begin
  -- The author guard (private.guard_content_author) lets this through, and
  -- re-stamped rows are not new rows to count against anyone's quota.
  perform set_config('grimoire.content_move', 'on', true);
  perform set_config('grimoire.bypass_quota', 'on', true);

  update public.calendar_events       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.class_features        set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.crafting_recipes      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.custom_classes        set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.custom_subclasses     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.deities               set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.encounter_state       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.encounters            set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.factions              set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.items                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.kin_links             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.world_links           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.location_roads        set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.story_facts           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_entries         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notice_board_pins     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notice_boards         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.locations             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.loot_tables           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notes                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npc_inventory         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npc_sets              set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npcs                  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.pantheons             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.puzzle_rooms          set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.quests                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.roll_tables           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.rules                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.scriptorium_documents set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.session_proposals     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_broadcast  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_pages      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_playlists  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_pads       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.sounds                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.species               set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.spells                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_sessions     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;

  -- What a member writes as a player (their own character, its inventory and
  -- companions, journal entries on items, class option texts). A seat that
  -- rotates has written these before it took the chair, so handing the chair
  -- back leaves them where they are; a transfer and a deleted account move
  -- them, the first because the outgoing owner wrote them as DM, the second
  -- because otherwise they cascade away.
  if p_player_rows then
    update public.class_option_texts set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.companions         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.party_inventory    set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.party_members      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.item_entries       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  end if;

  -- Rows that carry an author but no campaign_id, scoped by their parent.
  update public.faction_npcs f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.faction_party_members f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.store_items si set user_id = p_to
   where si.user_id = p_from
     and exists (select 1 from public.locations l where l.id = si.location_id and l.campaign_id = p_campaign_id);
  update public.location_doors d set user_id = p_to
   where d.user_id = p_from
     and exists (select 1 from public.locations l where l.id = d.from_location_id and l.campaign_id = p_campaign_id);
  update public.location_map_regions r set user_id = p_to
   where r.user_id = p_from
     and exists (select 1 from public.locations l where l.id = r.site_location_id and l.campaign_id = p_campaign_id);
  update public.location_placements lp set user_id = p_to
   where lp.user_id = p_from
     and exists (select 1 from public.locations l where l.id = lp.location_id and l.campaign_id = p_campaign_id);
  update public.location_state_events e set user_id = p_to
   where e.user_id = p_from
     and exists (select 1 from public.locations l where l.id = e.location_id and l.campaign_id = p_campaign_id);

  if p_scoped_homebrew then
    update public.monsters         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.traps            set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.dungeon_maps     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.dungeon_features set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  end if;

  perform set_config('grimoire.content_move', coalesce(v_prev_move, ''), true);
  perform set_config('grimoire.bypass_quota', coalesce(v_prev_quota, ''), true);
end;
$function$;
