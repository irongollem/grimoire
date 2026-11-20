-- The campaign's canon (#1226), epic stories 2 to 10, as one migration.
--
-- Built as eleven migrations, one per story, and squashed before release (the maintainer, 20 Nov 2026): each story
-- restated the functions it extended whole, so the same function appeared up to five times. Here every function is
-- defined once, at the place its first story created it, with its final body; the sections keep their stories' order
-- and comments. Function bodies are not checked at creation inside this migration, because a final body may read a
-- column a later section adds (for example get_player_canon reading a backstory's character); every object exists by
-- the time anything runs. Verified by a full local reset and the whole pgTAP suite.
--
-- The design is the canvas *Campaign Canon* (claude.ai artifact MAukzQW1bDDG832DT4ZepT, frames 01 to 14, plus 04b),
-- approved 19 and 20 Nov 2026; the decisions are in the epic's body.

set local check_function_bodies = off;

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
      when 'secret' then e.revealed_at is not null and p_member = any (e.player_visible_to)
      -- A backstory is its own character's, and whoever else the DM or its player told.
      -- or a member told any of its passages (a player shares their own passages with the party; each passage still
      -- reaches only whom it was told to, get_player_lore_passages).
      when 'backstory' then p_member = e.party_member_id or p_member = any (e.player_visible_to)
        or exists (select 1 from public.canon_lore_passages bp
                    where bp.entry_id = e.id and p_member = any (bp.player_visible_to))
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
  updated_at timestamptz,
  lore_kind text,
  world_year integer,
  world_month integer,
  world_day integer,
  party_member_id uuid
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
         e.image_url, e.ai_provenance, e.created_at, e.updated_at, e.lore_kind, e.world_year, e.world_month, e.world_day,
         e.party_member_id
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
  update public.canon_clues           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_force_steps     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_force_ticks     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_force_quests    set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_lore_passages   set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  -- Who wrote a passage moves with it (#1226 story 10): the journal tells a DM's passage from the player's
  -- by its author, so a passage the outgoing owner wrote must stay the DM's words.
  update public.canon_lore_passages   set author_id = p_to where campaign_id = p_campaign_id and author_id = p_from;
  update public.note_sorting          set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
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

-- AI help on the canon's first two parts (#1226 story 2, frame 13). The decision: help on a part ships with that
-- part's story, as DM help at a real table, not with the AI table. `suggest-canon` proposes premise and tone entries
-- from a few lines of pitch, or truths for the world, and nothing is written until the DM accepts a proposal, which then
-- carries `ai_provenance`. Lines and veils are never proposed: they are agreed with the players.
--
-- The output shape and the campaign's grounding (the world block, the truths already written, the people and factions
-- a truth may be known to) are built in code; these rows carry the editorial rules, which admins edit in the Prompts
-- tab afterwards (a re-run keeps their edits).

insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
select v.generation_type, v.label, v.credit_cost, (select coalesce(max(sort_order), 0) from public.ai_generation_credit_costs) + v.n
  from (values ('canon_premise_suggestion', 'Premise and tone suggestions', 1, 1),
               ('canon_truth_suggestion', 'Truth suggestions', 1, 2)) as v(generation_type, label, credit_cost, n)
on conflict (generation_type) do nothing;

insert into public.ai_system_prompts (generator_type, label, content) values
  ('canon_premise', 'Premise and Tone Suggestions', $prompt$You help a Dungeon Master set down the premise and tone of their campaign, from a few lines they wrote. Propose short entries the DM can accept one by one:

- pitch: the campaign in two to four sentences, in the DM's own spirit. At most one.
- theme: what the campaign is about underneath, one line each ("kindness is a kind of courage"). Two to four.
- table: what it is like to play, one line each ("talk and wandering more than fights"). One to three.
- voice: how the campaign's text reads and how its names sound, for every AI suggestion written in it. One short paragraph, at most one.
- look: how its pictures are painted (medium, light, palette, mood), for every AI picture. One short paragraph, at most one.

Rules:
- Build on what the DM wrote and what the campaign already holds; never contradict it, and never repeat an entry it already has.
- Never propose lines or veils: those are agreed with the players at the table, not suggested.
- Plain, concrete words. No em-dashes. No marketing voice.
- If the DM gave a steer, let it shape the proposals.$prompt$),
  ('canon_truths', 'Truth Suggestions', $prompt$You help a Dungeon Master write the truths of their campaign's world: short statements that always hold, which the table may take for granted (or, for some, may not). Propose up to eight, each one line.

For each truth say who knows it:
- all: anyone in the world may say it.
- some: only certain people or factions know it. Name them, choosing ONLY from the people and factions given, copied exactly.
- secret: nobody in the world says it.

Rules:
- Fit the premise and tone given; never contradict a truth the campaign already has, and never repeat one.
- A truth is a fact about how the world is, not a plot event and not an instruction to the DM.
- Mix the three kinds; most truths are known to all.
- Plain, concrete words. No em-dashes.
- If the DM gave a steer, let it shape the proposals.$prompt$)
on conflict (generator_type) do nothing;

-- Secrets with clues, and open questions (#1226 story 3, frame 05).
--
-- A secret is an answer the DM holds (`canon_entries.part = 'secret'`, its statement the title). Its clues are placed
-- where the party can find them: at a place, on a person, or at a quest beat. The DM ticks a clue found at the table;
-- the secret then reads "partly known" to the DM, and only the DM reveals it (`revealed_at`), so players never learn a
-- secret by accident. Players never read a clue as an entry: what a clue says reaches them through play. An open
-- question is a plain entry (`part = 'question'`) that nobody may settle by invention; players never read one.

-- ── 1. A secret is revealed by the DM ─────────────────────────────────────────
alter table public.canon_entries
  add column revealed_at timestamptz,
  add constraint canon_entries_only_a_secret_is_revealed check (revealed_at is null or part = 'secret');

-- ── 2. canon_clues ────────────────────────────────────────────────────────────
create table public.canon_clues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  secret_id uuid not null references public.canon_entries (id) on delete cascade,
  -- What the party can find, in a line ("a locket in the dust, stamped with the guild's sheaf").
  title text not null default '',
  sort_order integer not null default 0,
  -- Where it lies: one place, one person or one beat, or nowhere yet (a clue the DM has not placed).
  location_id uuid references public.locations (id) on delete set null,
  npc_id uuid references public.npcs (id) on delete set null,
  quest_beat_id uuid references public.quest_beats (id) on delete set null,
  found_at timestamptz,
  found_session_id uuid references public.campaign_sessions (id) on delete set null,
  ai_provenance jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canon_clues_one_place check (num_nonnulls(location_id, npc_id, quest_beat_id) <= 1),
  constraint canon_clues_session_when_found check (found_session_id is null or found_at is not null)
);

create index canon_clues_secret_idx on public.canon_clues (secret_id, sort_order);
create index canon_clues_campaign_idx on public.canon_clues (campaign_id);
create index canon_clues_user_idx on public.canon_clues (user_id);
create index canon_clues_location_idx on public.canon_clues (location_id) where location_id is not null;
create index canon_clues_npc_idx on public.canon_clues (npc_id) where npc_id is not null;
create index canon_clues_beat_idx on public.canon_clues (quest_beat_id) where quest_beat_id is not null;
create index canon_clues_session_idx on public.canon_clues (found_session_id) where found_session_id is not null;

create trigger canon_clues_updated_at
  before update on public.canon_clues
  for each row execute procedure update_updated_at();

create trigger canon_clues_guard_content_author
  before update on public.canon_clues
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();

-- A clue belongs to a secret: never to a truth, a force or a piece of lore.
create function private.canon_clues_belong_to_a_secret()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.canon_entries e where e.id = new.secret_id and e.part = 'secret') then
    raise exception using errcode = '23514', message = 'A clue belongs to a secret';
  end if;
  return new;
end;
$$;
revoke execute on function private.canon_clues_belong_to_a_secret() from public, anon, authenticated;

create trigger canon_clues_belong_to_a_secret
  before insert or update of secret_id on public.canon_clues
  for each row execute procedure private.canon_clues_belong_to_a_secret();

create trigger zz_same_campaign_refs
  before insert or update of secret_id, location_id, npc_id, quest_beat_id, found_session_id, campaign_id
  on public.canon_clues
  for each row execute procedure private.enforce_same_campaign_refs(
    'secret_id', 'canon_entries', 'owned',
    'location_id', 'locations', 'owned',
    'npc_id', 'npcs', 'owned',
    'quest_beat_id', 'quest_beats', 'unowned',
    'found_session_id', 'campaign_sessions', 'owned');

alter table public.canon_clues enable row level security;
create policy "canon_clues_select" on public.canon_clues for select using (private.is_campaign_dm(campaign_id));
create policy "canon_clues_insert" on public.canon_clues for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "canon_clues_update" on public.canon_clues for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "canon_clues_delete" on public.canon_clues for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.canon_clues to authenticated, service_role;

create trigger canon_clues_signal_insert after insert on public.canon_clues
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger canon_clues_signal_update after update on public.canon_clues
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger canon_clues_signal_delete after delete on public.canon_clues
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

insert into private.demo_campaign_tables (table_name, tier, copy, reason) values ('canon_clues', 1, true, null);

-- An AI-placed clue is marked edited when its words change, as an entry is.
create function private.canon_clues_mark_edited()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.ai_provenance is not null
     and new.ai_provenance is not distinct from old.ai_provenance
     and coalesce((old.ai_provenance ->> 'edited')::boolean, false) = false
     and new.title is distinct from old.title then
    new.ai_provenance := jsonb_set(old.ai_provenance, '{edited}', 'true'::jsonb);
  end if;
  return new;
end;
$$;
revoke execute on function private.canon_clues_mark_edited() from public, anon, authenticated;

create trigger canon_clues_mark_edited
  before update on public.canon_clues
  for each row execute procedure private.canon_clues_mark_edited();

-- ── 3. Who among the party may read an entry, now with secrets ────────────────


-- ── 4. Clues change hands with their campaign ─────────────────────────────────


-- ── 5. AI help: place clues, keep questions open ──────────────────────────────
insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
select v.generation_type, v.label, v.credit_cost, (select coalesce(max(sort_order), 0) from public.ai_generation_credit_costs) + v.n
  from (values ('canon_clue_suggestion', 'Clue suggestions', 1, 1),
               ('canon_question_suggestion', 'Open question suggestions', 1, 2)) as v(generation_type, label, credit_cost, n)
on conflict (generation_type) do nothing;

insert into public.ai_system_prompts (generator_type, label, content) values
  ('canon_clues', 'Clue Suggestions', $prompt$You help a Dungeon Master place clues to one secret of their campaign, so the party can find the truth in play. A secret wants three clues, so the party can miss two and still find it. Propose up to three new clues, each one line, each placed at ONE place, ONE person or ONE quest beat chosen ONLY from those given, copied exactly.

Rules:
- A clue hints; it never states the secret outright.
- Each clue is something the party can see, hear, find or be told there: concrete, specific, playable at the table.
- Spread the clues: different kinds of place, person and beat; never two at the same spot, and never where a clue already lies.
- Fit the premise, tone and truths given; never contradict a truth.
- Plain, concrete words. No em-dashes.
- If the DM gave a steer, let it shape the clues.$prompt$),
  ('canon_questions', 'Open Question Suggestions', $prompt$You help a Dungeon Master name the questions their campaign keeps open on purpose: mysteries nobody at the table, and no AI, may settle by invention. Propose up to six, each one line, phrased as a question.

Rules:
- A good open question is one the campaign's truths, secrets and premise raise but do not answer.
- Never answer it, and never propose a question a truth or secret already answers.
- Never repeat a question the campaign already keeps.
- Plain, concrete words. No em-dashes.
- If the DM gave a steer, let it shape the questions.$prompt$)
on conflict (generator_type) do nothing;

-- What is moving (#1226 story 4, frame 06): forces beyond the party, for a DM at a real table.
--
-- A force is a canon entry (`part = 'force'`; its title names who, `wants` says what they want). It has steps in
-- order (the step it has reached is stamped), a clock the DM ticks when the world moves (each tick kept, so the log
-- reads what moved and why, and an undo removes a tick), and the quests where the party meets it. Players never read
-- any of it (`private.canon_entry_seen` already answers false for a force).
--
-- `canon_force_ticks` and `canon_force_quests` are written and removed, never edited, so they carry no updated_at.

-- ── 1. A force says what it wants, and how long its clock is ──────────────────
alter table public.canon_entries
  add column wants text,
  add column clock_size smallint,
  add constraint canon_entries_only_a_force_wants check ((wants is null and clock_size is null) or part = 'force'),
  add constraint canon_entries_clock_size check (clock_size is null or clock_size between 2 and 12);

-- ── 2. A child row hangs off the right part ───────────────────────────────────
-- One check for every child table of the canon: the row's parent entry is of the part it names.
create function private.canon_child_belongs_to()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(tg_argv[0], ',');
  v_parent uuid := (to_jsonb(new) ->> tg_argv[1])::uuid;
begin
  if not exists (select 1 from public.canon_entries e where e.id = v_parent and e.part = any (v_parts)) then
    raise exception using errcode = '23514', message = format('This belongs to a canon entry of the part %s', tg_argv[0]);
  end if;
  return new;
end;
$$;
revoke execute on function private.canon_child_belongs_to() from public, anon, authenticated;

-- ── 3. Steps, ticks, quests ───────────────────────────────────────────────────
create table public.canon_force_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  force_id uuid not null references public.canon_entries (id) on delete cascade,
  -- What the force does next, in order ("the Ferrymen buy the bridge").
  title text not null default '',
  sort_order integer not null default 0,
  -- The step the force has reached; nothing is stored about a step it has not.
  reached_at timestamptz,
  reached_session_id uuid references public.campaign_sessions (id) on delete set null,
  ai_provenance jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint canon_force_steps_session_when_reached check (reached_session_id is null or reached_at is not null)
);
create index canon_force_steps_force_idx on public.canon_force_steps (force_id, sort_order);
create index canon_force_steps_campaign_idx on public.canon_force_steps (campaign_id);
create index canon_force_steps_user_idx on public.canon_force_steps (user_id);
create index canon_force_steps_session_idx on public.canon_force_steps (reached_session_id) where reached_session_id is not null;

create trigger canon_force_steps_updated_at
  before update on public.canon_force_steps
  for each row execute procedure update_updated_at();

alter table public.canon_force_steps enable row level security;
create policy "canon_force_steps_select" on public.canon_force_steps for select using (private.is_campaign_dm(campaign_id));
create policy "canon_force_steps_insert" on public.canon_force_steps for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "canon_force_steps_update" on public.canon_force_steps for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "canon_force_steps_delete" on public.canon_force_steps for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.canon_force_steps to authenticated, service_role;

create trigger canon_force_steps_signal_insert after insert on public.canon_force_steps
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger canon_force_steps_signal_update after update on public.canon_force_steps
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger canon_force_steps_signal_delete after delete on public.canon_force_steps
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

create trigger canon_force_steps_guard_content_author
  before update on public.canon_force_steps
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();

create trigger canon_force_steps_belong_to_a_force
  before insert or update of force_id on public.canon_force_steps
  for each row execute procedure private.canon_child_belongs_to('force', 'force_id');

create trigger zz_same_campaign_refs
  before insert or update of force_id, reached_session_id, campaign_id
  on public.canon_force_steps
  for each row execute procedure private.enforce_same_campaign_refs(
    'force_id', 'canon_entries', 'owned', 'reached_session_id', 'campaign_sessions', 'owned');

insert into private.demo_campaign_tables (table_name, tier, copy, reason) values ('canon_force_steps', 1, true, null);

create table public.canon_force_ticks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  force_id uuid not null references public.canon_entries (id) on delete cascade,
  -- One tick of the force's clock, forward or back (an undo is a tick the other way, or the tick removed).
  delta smallint not null constraint canon_force_ticks_delta check (delta <> 0 and delta between -12 and 12),
  -- Why the world moved ("a week passed", "the party burned the toll-house").
  note text not null default '',
  session_id uuid references public.campaign_sessions (id) on delete set null,
  -- The day in the world it happened, in the campaign's own calendar, when the DM gave one.
  world_year integer,
  world_month integer,
  world_day integer,
  -- The step this tick reached, when reaching a step moved the clock: undoing the tick takes the step back too.
  step_id uuid references public.canon_force_steps (id) on delete set null,
  created_at timestamptz not null default now()
);
create index canon_force_ticks_force_idx on public.canon_force_ticks (force_id, created_at);
create index canon_force_ticks_campaign_idx on public.canon_force_ticks (campaign_id);
create index canon_force_ticks_user_idx on public.canon_force_ticks (user_id);
create index canon_force_ticks_session_idx on public.canon_force_ticks (session_id) where session_id is not null;
create index canon_force_ticks_step_idx on public.canon_force_ticks (step_id) where step_id is not null;

alter table public.canon_force_ticks enable row level security;
create policy "canon_force_ticks_select" on public.canon_force_ticks for select using (private.is_campaign_dm(campaign_id));
create policy "canon_force_ticks_insert" on public.canon_force_ticks for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "canon_force_ticks_update" on public.canon_force_ticks for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "canon_force_ticks_delete" on public.canon_force_ticks for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.canon_force_ticks to authenticated, service_role;

create trigger canon_force_ticks_signal_insert after insert on public.canon_force_ticks
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger canon_force_ticks_signal_update after update on public.canon_force_ticks
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger canon_force_ticks_signal_delete after delete on public.canon_force_ticks
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

create trigger canon_force_ticks_guard_content_author
  before update on public.canon_force_ticks
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();

create trigger canon_force_ticks_belong_to_a_force
  before insert or update of force_id on public.canon_force_ticks
  for each row execute procedure private.canon_child_belongs_to('force', 'force_id');

create trigger zz_same_campaign_refs
  before insert or update of force_id, session_id, step_id, campaign_id
  on public.canon_force_ticks
  for each row execute procedure private.enforce_same_campaign_refs(
    'force_id', 'canon_entries', 'owned', 'session_id', 'campaign_sessions', 'owned',
    'step_id', 'canon_force_steps', 'owned');

insert into private.demo_campaign_tables (table_name, tier, copy, reason) values ('canon_force_ticks', 1, true, null);

create table public.canon_force_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  force_id uuid not null references public.canon_entries (id) on delete cascade,
  -- A quest where the party meets the force.
  quest_id uuid not null references public.quests (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint canon_force_quests_once unique (force_id, quest_id)
);
create index canon_force_quests_campaign_idx on public.canon_force_quests (campaign_id);
create index canon_force_quests_user_idx on public.canon_force_quests (user_id);
create index canon_force_quests_quest_idx on public.canon_force_quests (quest_id);

alter table public.canon_force_quests enable row level security;
create policy "canon_force_quests_select" on public.canon_force_quests for select using (private.is_campaign_dm(campaign_id));
create policy "canon_force_quests_insert" on public.canon_force_quests for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "canon_force_quests_update" on public.canon_force_quests for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "canon_force_quests_delete" on public.canon_force_quests for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.canon_force_quests to authenticated, service_role;

create trigger canon_force_quests_signal_insert after insert on public.canon_force_quests
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger canon_force_quests_signal_update after update on public.canon_force_quests
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger canon_force_quests_signal_delete after delete on public.canon_force_quests
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

create trigger canon_force_quests_guard_content_author
  before update on public.canon_force_quests
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();

create trigger canon_force_quests_belong_to_a_force
  before insert or update of force_id on public.canon_force_quests
  for each row execute procedure private.canon_child_belongs_to('force', 'force_id');

create trigger zz_same_campaign_refs
  before insert or update of force_id, quest_id, campaign_id
  on public.canon_force_quests
  for each row execute procedure private.enforce_same_campaign_refs(
    'force_id', 'canon_entries', 'owned', 'quest_id', 'quests', 'owned');

insert into private.demo_campaign_tables (table_name, tier, copy, reason) values ('canon_force_quests', 1, true, null);

-- An AI-proposed step is marked edited when its words change, as an entry is.
create function private.canon_force_steps_mark_edited()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.ai_provenance is not null
     and new.ai_provenance is not distinct from old.ai_provenance
     and coalesce((old.ai_provenance ->> 'edited')::boolean, false) = false
     and new.title is distinct from old.title then
    new.ai_provenance := jsonb_set(old.ai_provenance, '{edited}', 'true'::jsonb);
  end if;
  return new;
end;
$$;
revoke execute on function private.canon_force_steps_mark_edited() from public, anon, authenticated;

create trigger canon_force_steps_mark_edited
  before update on public.canon_force_steps
  for each row execute procedure private.canon_force_steps_mark_edited();

-- ── 4. Forces change hands with their campaign ────────────────────────────────


-- ── 5. AI help: suggest a force ───────────────────────────────────────────────
insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
select 'canon_force_suggestion', 'Force suggestions', 1, (select coalesce(max(sort_order), 0) + 1 from public.ai_generation_credit_costs)
on conflict (generation_type) do nothing;

insert into public.ai_system_prompts (generator_type, label, content) values
  ('canon_forces', 'Force Suggestions', $prompt$You help a Dungeon Master name the forces moving in their campaign's world beyond the party: who wants what, and what they will do next if nobody stops them. Propose up to three forces. For each: who (a faction, person or power, preferring ones given, copied exactly), what they want in one line, three to five next steps in order, a clock size from 4 to 8 (how long until the last step), and the quests where the party meets it, chosen ONLY from the quests given, copied exactly.

Rules:
- A force moves on its own; its steps are things that happen in the world whether or not the party acts.
- Fit the premise, tone and truths given; never contradict a truth, and never answer an open question.
- Never repeat a force the campaign already has.
- Plain, concrete words. No em-dashes.
- If the DM gave a steer, let it shape the forces.$prompt$)
on conflict (generator_type) do nothing;

-- Lore told in passages (#1226 story 5, frames 04 and 04b).
--
-- A lore entry (`part = 'lore'`) has a kind (history, legend, culture, magic, place, faith, other) and, when it
-- happened, a date in the world for the almanac. Its text is told in passages, so a slow reveal over the campaign is
-- natural: sharing the entry tells its first passage; every later passage is told on its own (`player_visible_to`),
-- and may say where it comes out (a place, a person or a beat, where the Run screen offers "Tell the party"). A
-- passage can also be a secret's clue (`canon_clues.passage_id`), so a clue is written once: telling the passage
-- ticks the clue found.

-- ── 1. A lore entry's kind and its date in the world ─────────────────────────
alter table public.canon_entries
  add column lore_kind text
    constraint canon_entries_lore_kind_known check (lore_kind in ('history', 'legend', 'culture', 'magic', 'place', 'faith', 'other')),
  add column world_year integer,
  add column world_month integer,
  add column world_day integer,
  add constraint canon_entries_only_lore_has_a_kind check (lore_kind is null or part = 'lore'),
  add constraint canon_entries_world_date check (
    (world_month is null or world_year is not null) and (world_day is null or world_month is not null));

-- ── 2. canon_lore_passages ────────────────────────────────────────────────────
create table public.canon_lore_passages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  entry_id uuid not null references public.canon_entries (id) on delete cascade,
  -- The passage's heading ("What Bell-Note believes"), and its text (Tiptap JSON, secret blocks withheld from players).
  title text not null default '',
  body text,
  sort_order integer not null default 0,
  -- Told to these party members. The first passage is told with the entry itself and ignores this.
  player_visible_to uuid[] not null default '{}',
  told_at timestamptz,
  told_session_id uuid references public.campaign_sessions (id) on delete set null,
  -- Where it comes out: one place, one person or one beat, or nowhere in particular.
  location_id uuid references public.locations (id) on delete set null,
  npc_id uuid references public.npcs (id) on delete set null,
  quest_beat_id uuid references public.quest_beats (id) on delete set null,
  ai_provenance jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canon_lore_passages_one_place check (num_nonnulls(location_id, npc_id, quest_beat_id) <= 1),
  constraint canon_lore_passages_session_when_told check (told_session_id is null or told_at is not null)
);

create index canon_lore_passages_entry_idx on public.canon_lore_passages (entry_id, sort_order);
create index canon_lore_passages_campaign_idx on public.canon_lore_passages (campaign_id);
create index canon_lore_passages_user_idx on public.canon_lore_passages (user_id);
create index canon_lore_passages_location_idx on public.canon_lore_passages (location_id) where location_id is not null;
create index canon_lore_passages_npc_idx on public.canon_lore_passages (npc_id) where npc_id is not null;
create index canon_lore_passages_beat_idx on public.canon_lore_passages (quest_beat_id) where quest_beat_id is not null;
create index canon_lore_passages_session_idx on public.canon_lore_passages (told_session_id) where told_session_id is not null;

create trigger canon_lore_passages_updated_at
  before update on public.canon_lore_passages
  for each row execute procedure update_updated_at();

create trigger canon_lore_passages_guard_content_author
  before update on public.canon_lore_passages
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();

create trigger canon_lore_passages_belong_to_lore
  before insert or update of entry_id on public.canon_lore_passages
  for each row execute procedure private.canon_child_belongs_to('lore', 'entry_id');

create trigger zz_same_campaign_refs
  before insert or update of entry_id, location_id, npc_id, quest_beat_id, told_session_id, campaign_id
  on public.canon_lore_passages
  for each row execute procedure private.enforce_same_campaign_refs(
    'entry_id', 'canon_entries', 'owned',
    'location_id', 'locations', 'owned',
    'npc_id', 'npcs', 'owned',
    'quest_beat_id', 'quest_beats', 'unowned',
    'told_session_id', 'campaign_sessions', 'owned');

alter table public.canon_lore_passages enable row level security;
create policy "canon_lore_passages_select" on public.canon_lore_passages for select using (private.is_campaign_dm(campaign_id));
create policy "canon_lore_passages_insert" on public.canon_lore_passages for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "canon_lore_passages_update" on public.canon_lore_passages for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "canon_lore_passages_delete" on public.canon_lore_passages for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.canon_lore_passages to authenticated, service_role;

create trigger canon_lore_passages_signal_insert after insert on public.canon_lore_passages
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger canon_lore_passages_signal_update after update on public.canon_lore_passages
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger canon_lore_passages_signal_delete after delete on public.canon_lore_passages
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

insert into private.demo_campaign_tables (table_name, tier, copy, reason) values ('canon_lore_passages', 1, true, null);

create function private.canon_lore_passages_mark_edited()
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
revoke execute on function private.canon_lore_passages_mark_edited() from public, anon, authenticated;

create trigger canon_lore_passages_mark_edited
  before update on public.canon_lore_passages
  for each row execute procedure private.canon_lore_passages_mark_edited();

-- ── 3. A passage can be a clue ────────────────────────────────────────────────
alter table public.canon_clues
  add column passage_id uuid references public.canon_lore_passages (id) on delete set null;
create index canon_clues_passage_idx on public.canon_clues (passage_id) where passage_id is not null;

drop trigger zz_same_campaign_refs on public.canon_clues;
create trigger zz_same_campaign_refs
  before insert or update of secret_id, location_id, npc_id, quest_beat_id, found_session_id, passage_id, campaign_id
  on public.canon_clues
  for each row execute procedure private.enforce_same_campaign_refs(
    'secret_id', 'canon_entries', 'owned',
    'location_id', 'locations', 'owned',
    'npc_id', 'npcs', 'owned',
    'quest_beat_id', 'quest_beats', 'unowned',
    'found_session_id', 'campaign_sessions', 'owned',
    'passage_id', 'canon_lore_passages', 'owned');

-- Telling a passage ticks the clues it is: the first time it is told to anyone, each clue that points at it and is not
-- yet found is found, in the same session. Invoker: the DM who tells the passage may write the clue.
create function private.canon_told_passage_finds_its_clues()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.told_at is not null and old.told_at is null then
    update public.canon_clues c
       set found_at = new.told_at, found_session_id = new.told_session_id
     where c.passage_id = new.id and c.found_at is null;
  end if;
  return new;
end;
$$;
revoke execute on function private.canon_told_passage_finds_its_clues() from public, anon, authenticated;

create trigger canon_told_passage_finds_its_clues
  after update of told_at on public.canon_lore_passages
  for each row execute procedure private.canon_told_passage_finds_its_clues();

-- ── 4. Who may read an entry: unchanged rules, restated with every part ───────


-- ── 5. The players' read of lore passages ─────────────────────────────────────
-- A passage reaches a member when its entry does (shared with them) and it is the entry's first passage, or it has
-- been told to them. Its own columns only; secret blocks withheld; the reveal list never handed out.
create function public.get_player_lore_passages(p_campaign_id uuid, p_preview_member_id uuid default null)
returns table (
  id uuid,
  entry_id uuid,
  sort_order integer,
  title text,
  body text,
  told_at timestamptz,
  by_dm boolean,
  written_at timestamptz
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
  ),
  firsts as (
    select distinct on (p.entry_id) p.id from public.canon_lore_passages p
      join public.canon_entries e on e.id = p.entry_id and e.part = 'lore'
     where p.campaign_id = p_campaign_id
     order by p.entry_id, p.sort_order, p.created_at
  )
  select p.id, p.entry_id, p.sort_order, p.title, private.withhold_secret_blocks(p.body), p.told_at,
         coalesce(p.author_id is null
                  or exists (select 1 from public.campaigns c where c.id = p.campaign_id and c.user_id = p.author_id)
                  or exists (select 1 from public.campaign_members cm
                              where cm.campaign_id = p.campaign_id and cm.user_id = p.author_id and cm.role = 'dm'),
                  true),
         p.created_at
    from public.canon_lore_passages p
    join me on true
   where p.campaign_id = p_campaign_id
     and private.canon_entry_seen(p.entry_id, me.member)
     and (p.id in (select f.id from firsts f) or me.member = any (p.player_visible_to))
   order by p.entry_id, p.sort_order, p.created_at
$$;
revoke execute on function public.get_player_lore_passages(uuid, uuid) from public, anon;
grant execute on function public.get_player_lore_passages(uuid, uuid) to authenticated, service_role;

-- The players' read of entries gains the lore kind and the date in the world.

revoke execute on function public.get_player_canon(uuid, uuid) from public, anon;
grant execute on function public.get_player_canon(uuid, uuid) to authenticated, service_role;

-- ── 6. Passages change hands with their campaign ──────────────────────────────


-- ── 7. AI help: draft lore, split it into passages ────────────────────────────
insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
select 'canon_lore_suggestion', 'Lore drafts', 1, (select coalesce(max(sort_order), 0) + 1 from public.ai_generation_credit_costs)
on conflict (generation_type) do nothing;

insert into public.ai_system_prompts (generator_type, label, content) values
  ('canon_lore', 'Lore Drafts', $prompt$You help a Dungeon Master write a piece of their campaign's lore (a history, a legend, a culture, how magic works), told in passages so the party can learn it slowly over the campaign. Write two to five passages, each a heading and one or two short paragraphs. The first passage is what anyone could know; each later passage goes deeper, and the last may hold what almost nobody knows. For each passage after the first, say where it comes out: at ONE place, from ONE person or at ONE quest beat, chosen ONLY from those given, copied exactly, or nowhere in particular.

Rules:
- Fit the premise, tone and truths given; never contradict a truth, never answer an open question, and never state a secret (a passage may hint at one).
- Concrete and specific, in the campaign's voice. No em-dashes.
- If the DM gave a title, a kind or a steer, follow it; if the DM already wrote text, split and deepen it rather than replacing its meaning.$prompt$)
on conflict (generator_type) do nothing;

-- ── 8. What the canon placed here, in one read ────────────────────────────────
-- A place's, an NPC's or a beat's DM page shows the clues lying there and the passages that come out there and are not
-- yet told ("Canon here", frames 05 and 04b). One read instead of the campaign's whole canon on every such page.
-- Invoker: the canon tables' own RLS decides, so only the campaign's DMs read anything here.
create function public.get_canon_here(p_kind text, p_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'clues', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'title', c.title, 'secret_id', c.secret_id, 'secret_title', e.title,
               'found_at', c.found_at, 'found_session_id', c.found_session_id) order by e.title, c.sort_order)
        from public.canon_clues c
        join public.canon_entries e on e.id = c.secret_id
       where (p_kind = 'location' and c.location_id = p_id)
          or (p_kind = 'npc' and c.npc_id = p_id)
          or (p_kind = 'quest_beat' and c.quest_beat_id = p_id)), '[]'::jsonb),
    'passages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'title', p.title, 'entry_id', p.entry_id, 'entry_title', e.title) order by e.title, p.sort_order)
        from public.canon_lore_passages p
        join public.canon_entries e on e.id = p.entry_id
       where p.told_at is null
         -- Lore's first passage is told with the entry, so it is never offered here; another part (a backstory) has
         -- no free first passage. Written as part <> 'lore' so a later part is offered by default.
         and (e.part <> 'lore'
              or p.id <> (select f.id from public.canon_lore_passages f where f.entry_id = p.entry_id
                           order by f.sort_order, f.created_at limit 1))
         and ((p_kind = 'location' and p.location_id = p_id)
              or (p_kind = 'npc' and p.npc_id = p_id)
              or (p_kind = 'quest_beat' and p.quest_beat_id = p_id))), '[]'::jsonb))
$$;
revoke execute on function public.get_canon_here(text, uuid) from public, anon;
grant execute on function public.get_canon_here(text, uuid) to authenticated, service_role;

-- The Open Book reads the canon (#1226 story 5, frame 08).
--
-- Chapter V, Lore and Legend, used to print every note that was not a session report. It now prints the campaign's
-- canon: lore entries the whole party can read, each told as far as the whole party has been told it, in the order of
-- their dates in the world, and the truths known to all. A canon entry can be taken out of a book, or put in, like
-- any other entry (`open_book_entries.entity_type = 'canon'`), and its world-web ties print as cross-references.
-- The snapshot's version is 2: production held no release on 19 Nov 2026, so no stored book reads the old shape.

alter table public.open_book_entries drop constraint open_book_entries_entity_type_check;
alter table public.open_book_entries add constraint open_book_entries_entity_type_check
  check (entity_type = any (array['location', 'npc', 'faction', 'pantheon', 'deity', 'note', 'canon']));

CREATE OR REPLACE FUNCTION private.open_book_snapshot(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_book public.open_books;
  v_campaign public.campaigns;
  v_party uuid[];
  v_places jsonb := '[]'::jsonb;
  v_folk jsonb := '[]'::jsonb;
  v_factions jsonb := '[]'::jsonb;
  v_pantheons jsonb := '[]'::jsonb;
  v_deities jsonb := '[]'::jsonb;
  v_lore jsonb := '[]'::jsonb;
  v_truths jsonb := '[]'::jsonb;
  v_sessions jsonb := '[]'::jsonb;
  v_events jsonb := '[]'::jsonb;
  v_names jsonb := '{}'::jsonb;
  v_cited uuid[];
  v_entry_ids uuid[];
  v_ties jsonb := '[]'::jsonb;
  v_concealed uuid[];
begin
  select * into v_book from public.open_books where campaign_id = p_campaign_id;
  if not found then
    return null;
  end if;
  select * into v_campaign from public.campaigns where id = p_campaign_id;
  select coalesce(array_agg(pm.id), '{}'::uuid[]) into v_party
    from public.party_members pm where pm.campaign_id = p_campaign_id;

  if 'atlas' = any (v_book.chapters) then
    -- As get_player_visible_locations: description and map only when shared, DM notes and audio never, and
    -- only the pins players may see.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', l.id,
             'parent_id', l.parent_id,
             'name', l.name,
             'location_type', l.location_type,
             'player_summary', l.player_summary,
             'description', case when l.is_description_shared then private.withhold_secret_blocks(l.description) end,
             'image_url', l.image_url,
             'tags', to_jsonb(l.tags),
             'is_level', l.is_level,
             'is_battle_map', l.is_battle_map,
             'npcs_shared', l.is_npcs_shared,
             'map', case when l.is_map_shared then jsonb_build_object(
                      'url', l.map_url,
                      'layer_url', l.map_layer_url,
                      'layer_calibration', l.map_layer_calibration,
                      'plan_size', l.plan_size,
                      'scale', l.map_scale) end,
             'pins', coalesce((
                      select jsonb_agg(pin)
                        from jsonb_array_elements(coalesce(l.map_pins, '[]'::jsonb)) pin
                       where coalesce((pin->>'visible_to_players')::boolean, false)), '[]'::jsonb)
           ) order by l.sort_order nulls last, l.name), '[]'::jsonb)
      into v_places
      from public.locations l
     where l.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'location', l.id,
             private.open_book_whole_party(l.player_visible_to, v_party), v_book.include_shared);
  end if;

  if 'folk' = any (v_book.chapters) then
    -- As get_player_visible_npcs: only the fields the DM shares, the cover while a disguise holds, the cover the
    -- party knew once it falls, and no prose (players are never shown an NPC's appearance, personality or
    -- backstory). A person whose name is not shared has no page to be on.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', s.id,
             'name', case when s.concealed and s.disguise_name is not null then s.disguise_name else s.name end,
             'race', case when 'race' = any (s.player_visible_fields) then s.race end,
             'occupation', case when 'occupation' = any (s.player_visible_fields) then s.occupation end,
             'status', s.status,
             'relationship', s.relationship,
             'portrait_url', case
                when not ('portrait' = any (s.player_visible_fields)) then null
                when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_url
                else s.portrait_url end,
             'portrait_focal_point', case
                when not ('portrait' = any (s.player_visible_fields)) then null
                when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_focal_point
                else s.portrait_focal_point end,
             'cutout_url', case when 'portrait' = any (s.player_visible_fields) and not s.concealed then s.cutout_url end,
             'location_id', case when 'location' = any (s.player_visible_fields) then s.location_id end,
             'former_name', case when s.unmasked then s.disguise_name end,
             'former_portrait_url', case when s.unmasked and 'portrait' = any (s.player_visible_fields) then s.disguise_portrait_url end
           ) order by s.name), '[]'::jsonb)
      into v_folk
      from (
        select n.*,
          ((n.disguise_name is not null or n.disguise_portrait_url is not null) and not n.is_revealed) as concealed,
          (n.is_revealed and n.unmasked_at is not null
            and (n.disguise_name is not null or n.disguise_portrait_url is not null)) as unmasked
          from public.npcs n
         where n.campaign_id = p_campaign_id
           and 'name' = any (n.player_visible_fields)
      ) s
     where private.open_book_takes(p_campaign_id, 'npc', s.id,
             private.open_book_whole_party(s.player_visible_to, v_party)
             -- or shared with the party through the place they live, as the projection's arm (b)
             or exists (
               select 1 from public.locations l
                where l.id = s.location_id
                  and l.is_npcs_shared
                  and private.open_book_whole_party(l.player_visible_to, v_party)),
             v_book.include_shared);
  end if;

  if 'factions' = any (v_book.chapters) then
    -- As get_player_visible_factions: descent is the party's to know, the succession custom is not.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', f.id,
             'name', f.name,
             'faction_type', f.faction_type,
             'description', private.withhold_secret_blocks(f.description),
             'emblem_url', f.emblem_url,
             'alignment', f.alignment,
             'tags', to_jsonb(f.tags),
             'party_standing', f.party_standing,
             'descent', f.descent
           ) order by f.name), '[]'::jsonb)
      into v_factions
      from public.factions f
     where f.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'faction', f.id,
             private.open_book_whole_party(f.player_visible_to, v_party), v_book.include_shared);
  end if;

  if 'pantheon' = any (v_book.chapters) then
    -- Players read pantheons and deities as raw rows (DM notes on them live in entity_notes, which the book never
    -- reads); the book also strips the secret blocks the raw read would show.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id,
             'name', p.name,
             'description', private.withhold_secret_blocks(p.description),
             'emblem_url', p.emblem_url,
             'tags', to_jsonb(p.tags)
           ) order by p.name), '[]'::jsonb)
      into v_pantheons
      from public.pantheons p
     where p.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'pantheon', p.id,
             private.open_book_whole_party(p.player_visible_to, v_party), v_book.include_shared);

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id,
             'pantheon_id', d.pantheon_id,
             'name', d.name,
             'titles', d.titles,
             'alternate_names', to_jsonb(d.alternate_names),
             'alignment', d.alignment,
             'symbol', d.symbol,
             'symbol_image_url', d.symbol_image_url,
             'portrait_url', d.portrait_url,
             'portrait_focal_point', d.portrait_focal_point,
             'domains', to_jsonb(d.domains),
             'portfolio', d.portfolio,
             'description', private.withhold_secret_blocks(d.description),
             'tags', to_jsonb(d.tags)
           ) order by d.name), '[]'::jsonb)
      into v_deities
      from public.deities d
     where d.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'deity', d.id,
             private.open_book_whole_party(d.player_visible_to, v_party), v_book.include_shared);
  end if;

  if 'lore' = any (v_book.chapters) then
    -- The canon (#1226): lore the whole party can read, told as far as the whole party has been told it (the first
    -- passage with the entry, a later one once every member has heard it), and the truths known to all. Never a
    -- secret, a force, an open question or a truth known only to some.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', e.id,
             'title', e.title,
             'lore_kind', e.lore_kind,
             'world_date', case when e.world_year is not null then jsonb_build_object(
                             'year', e.world_year, 'month', e.world_month, 'day', e.world_day) end,
             'image_url', e.image_url,
             'body', private.withhold_secret_blocks(e.body),
             'passages', (
               select coalesce(jsonb_agg(jsonb_build_object(
                        'id', p.id,
                        'title', p.title,
                        'body', private.withhold_secret_blocks(p.body)
                      ) order by p.sort_order, p.created_at), '[]'::jsonb)
                 from public.canon_lore_passages p
                where p.entry_id = e.id
                  and (p.id = (select f.id from public.canon_lore_passages f where f.entry_id = e.id
                                order by f.sort_order, f.created_at limit 1)
                       or private.open_book_whole_party(p.player_visible_to, v_party))),
             'created_at', e.created_at
           ) order by e.world_year nulls last, e.world_month nulls last, e.world_day nulls last, e.sort_order, e.title),
           '[]'::jsonb)
      into v_lore
      from public.canon_entries e
     where e.campaign_id = p_campaign_id
       and e.part = 'lore'
       and private.open_book_takes(p_campaign_id, 'canon', e.id,
             private.open_book_whole_party(e.player_visible_to, v_party), v_book.include_shared);

    select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title) order by e.sort_order, e.created_at),
           '[]'::jsonb)
      into v_truths
      from public.canon_entries e
     where e.campaign_id = p_campaign_id
       and e.part = 'truth' and e.knowledge = 'all'
       and private.open_book_takes(p_campaign_id, 'canon', e.id, true, v_book.include_shared);
  end if;

  if 'chronicle' = any (v_book.chapters) then
    -- The Chronicle: a note linked to a session is that session's chronicle entry (#1226 story 6), with the session.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', n.id,
             'title', n.title,
             'content', private.withhold_secret_blocks(n.content),
             'tags', to_jsonb(n.tags),
             'session', case when cs.id is not null then jsonb_build_object(
                          'number', cs.number, 'title', cs.title, 'played_on', cs.played_on) end,
             'date', case when n.session_start_year is not null then jsonb_build_object(
                       'year', n.session_start_year, 'month', n.session_start_month, 'day', n.session_start_day,
                       'end_year', n.session_end_year, 'end_month', n.session_end_month, 'end_day', n.session_end_day) end,
             'real_date', n.session_real_date,
             'created_at', n.created_at
           ) order by cs.number nulls last, n.session_real_date nulls last, n.created_at), '[]'::jsonb)
      into v_sessions
      from public.notes n
      left join public.campaign_sessions cs on cs.id = n.session_id
     where n.campaign_id = p_campaign_id
       and n.session_id is not null
       and private.open_book_takes(p_campaign_id, 'note', n.id,
             private.open_book_whole_party(n.player_visible_to, v_party), v_book.include_shared);

    -- The calendar players already read (calendar_events_select): shown events and every session. Never the
    -- DM's links to quests, encounters or places.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', e.id,
             'title', e.title,
             'description', private.withhold_secret_blocks(e.description),
             'event_type', e.event_type,
             'year', e.year, 'month', e.month, 'day', e.day,
             'festival_day', e.festival_day,
             'is_multi_day', e.is_multi_day,
             'end_year', e.end_year, 'end_month', e.end_month, 'end_day', e.end_day,
             'color', e.color
           ) order by e.year nulls last, e.month nulls last, e.day nulls last), '[]'::jsonb)
      into v_events
      from public.calendar_events e
     where e.campaign_id = p_campaign_id
       and (e.player_visible or e.event_type = 'session');
  end if;

  -- Rich text mentions people and places by id only (entityMention stores no label), so the book carries a
  -- name for every id its own pages cite, when the whole table can already read that name: the party's
  -- characters, people under their cover, places and factions. Only cited ids: an entry the DM took out keeps
  -- its name out of the book unless released text names it. A mention of anything else stays unnamed.
  -- Cited means an entityMention in the released text, nothing else: a place's parent_id, a pin or a file name
  -- also hold ids, and reading those would name a place the DM took out (#1085 audit).
  select coalesce(array_agg(distinct c.id), '{}'::uuid[])
    into v_cited
    from (
      select jsonb_path_query(v_places, '$[*].description') #>> '{}' as doc
      union all select jsonb_path_query(v_factions, '$[*].description') #>> '{}'
      union all select jsonb_path_query(v_pantheons, '$[*].description') #>> '{}'
      union all select jsonb_path_query(v_deities, '$[*].description') #>> '{}'
      union all select jsonb_path_query(v_lore, '$[*].body') #>> '{}'
      union all select jsonb_path_query(v_lore, '$[*].passages[*].body') #>> '{}'
      union all select jsonb_path_query(v_sessions, '$[*].content') #>> '{}'
      union all select jsonb_path_query(v_events, '$[*].description') #>> '{}'
    ) t
    cross join lateral unnest(private.open_book_mentions(t.doc)) as c(id);

  select coalesce(jsonb_object_agg(x.id::text, x.name), '{}'::jsonb)
    into v_names
    from (
      select pm.id, pm.name from public.party_members pm where pm.campaign_id = p_campaign_id
      union all
      select n.id,
             case when (n.disguise_name is not null or n.disguise_portrait_url is not null) and not n.is_revealed
                       and n.disguise_name is not null
                  then n.disguise_name else n.name end
        from public.npcs n
       where n.campaign_id = p_campaign_id
         and 'name' = any (n.player_visible_fields)
         and (private.open_book_whole_party(n.player_visible_to, v_party)
              or exists (
                select 1 from public.locations l
                 where l.id = n.location_id
                   and l.is_npcs_shared
                   and private.open_book_whole_party(l.player_visible_to, v_party)))
      union all
      select l.id, l.name from public.locations l
       where l.campaign_id = p_campaign_id and private.open_book_whole_party(l.player_visible_to, v_party)
      union all
      select f.id, f.name from public.factions f
       where f.campaign_id = p_campaign_id and private.open_book_whole_party(f.player_visible_to, v_party)
    ) x
   where x.name is not null
     and x.id = any (v_cited);

  -- World Web (#1084): the ties between two entries that are both in the book, as cross-references. The book
  -- never runs ahead of the table: a link only once the whole party knows it, a record by the rule the player
  -- projection already applies (a membership once the whole party knows it, never a disguised NPC's; a home only where
  -- the NPC's location is shared).
  -- A tie to anything not in this release is left out, so a reader can follow every one to its page.
  select coalesce(array_agg(distinct x.id), '{}'::uuid[]) into v_entry_ids
    from (
      select (e->>'id')::uuid as id from jsonb_array_elements(v_places) e
      union all select (e->>'id')::uuid from jsonb_array_elements(v_folk) e
      union all select (e->>'id')::uuid from jsonb_array_elements(v_factions) e
      union all select (e->>'id')::uuid from jsonb_array_elements(v_deities) e
      union all select (e->>'id')::uuid from jsonb_array_elements(v_lore) e
    ) x;

  -- A disguised NPC is in the book under the cover; the true one's allegiances and family stay out until it falls.
  select coalesce(array_agg(n.id), '{}'::uuid[]) into v_concealed
    from public.npcs n
   where n.campaign_id = p_campaign_id and not n.is_revealed
     and (n.disguise_name is not null or n.disguise_portrait_url is not null);

  select coalesce(jsonb_agg(jsonb_build_object(
           'source', t.source, 'type', t.type,
           'from_kind', t.from_kind, 'from_id', t.from_id, 'to_kind', t.to_kind, 'to_id', t.to_id,
           'told', t.told)
           order by t.source, t.type, t.from_id, t.to_id), '[]'::jsonb)
    into v_ties
    from (
      select 'link' as source, l.type, l.from_kind, l.from_id, l.to_kind, l.to_id, nullif(l.told, '') as told
        from public.world_links l
       where l.campaign_id = p_campaign_id and private.open_book_whole_party(l.player_visible_to, v_party)
      union all
      select 'membership', 'member_of', 'npc', m.npc_id, 'faction', m.faction_id, null
        from public.faction_npcs m join public.factions f on f.id = m.faction_id
       where f.campaign_id = p_campaign_id
         and private.open_book_whole_party(m.player_visible_to, v_party)
         and m.npc_id <> all (v_concealed)
      union all
      select 'npc_home', 'lives_in', 'npc', n.id, 'location', n.location_id, null
        from public.npcs n
       where n.campaign_id = p_campaign_id and n.location_id is not null and 'location' = any (n.player_visible_fields)
      union all
      select 'seat', 'seat', 'faction', f.id, 'location', f.seat_location_id, null
        from public.factions f where f.campaign_id = p_campaign_id and f.seat_location_id is not null
      union all
      select 'kin', k.kind || '_of', 'npc', k.from_npc_id, 'npc', k.to_npc_id, null
        from public.kin_links k
       where k.campaign_id = p_campaign_id and k.from_npc_id is not null and k.to_npc_id is not null
         and k.from_npc_id <> all (v_concealed) and k.to_npc_id <> all (v_concealed)
    ) t
   where t.from_id = any (v_entry_ids) and t.to_id = any (v_entry_ids);

  return jsonb_build_object(
    'v', 2,
    'book', jsonb_build_object(
      'title', v_book.title,
      'subtitle', v_book.subtitle,
      'cover_art', v_book.cover_art,
      'cover_image_url', v_book.cover_image_url,
      'leather', v_book.leather,
      'chapters', to_jsonb(v_book.chapters),
      'campaign_name', v_campaign.name),
    'calendar', jsonb_build_object(
      'calendar_id', v_campaign.calendar_id,
      'custom_calendar', v_campaign.custom_calendar,
      'current', jsonb_build_object('year', v_campaign.current_year, 'month', v_campaign.current_month, 'day', v_campaign.current_day)),
    'places', v_places,
    'folk', v_folk,
    'factions', v_factions,
    'pantheons', v_pantheons,
    'deities', v_deities,
    'lore', v_lore,
    'truths', v_truths,
    'sessions', v_sessions,
    'events', v_events,
    'names', v_names,
    'ties', v_ties,
    'stats', jsonb_build_object(
      'places', jsonb_array_length(v_places),
      'folk', jsonb_array_length(v_folk),
      'factions', jsonb_array_length(v_factions),
      'pantheons', jsonb_array_length(v_pantheons),
      'deities', jsonb_array_length(v_deities),
      'lore', jsonb_array_length(v_lore),
      'truths', jsonb_array_length(v_truths),
      'sessions', jsonb_array_length(v_sessions),
      'events', jsonb_array_length(v_events))
  );
end;
$function$;

-- The Chronicle, and notes without categories (#1226 story 6, frame 12; maintainer, 19 Nov 2026).
--
-- Session notes are canon: they are what happened. A note linked to a session (`notes.session_id`) IS that
-- session's chronicle entry, read on the Canon page's Chronicle and in the Open Book's Chronicle chapter, and no longer
-- listed among the DM's notes. Its rows stay where they are, so the Chronicler, the read-aloud, the pictures that land
-- in a note and the players' reads keep working on the same row; moving them into canon_entries would have rebuilt
-- every one of those for no gain. So canon_entries has no chronicle part after all.
--
-- `notes.category` goes. Production on 19 Nov 2026 held 50 notes: session 21, general 13, lore 12, `dm` 3, `ideas` 1;
-- location, quest and faction were never used. The maintainer used session and lore notes for player characters'
-- backgrounds, so nothing is moved automatically: every lore note, and every session note not linked to a session, is
-- put on a one-time list (`note_sorting`) the DM works through, sending each to a lore entry, a session, a character's
-- backstory, their own note on a character, or keeping it as a note.

-- ── 1. The notes still to sort ────────────────────────────────────────────────
create table public.note_sorting (
  note_id uuid primary key references public.notes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- What the note was, which decides what the list suggests for it.
  was text not null constraint note_sorting_was check (was in ('lore', 'session')),
  created_at timestamptz not null default now()
);
create index note_sorting_campaign_idx on public.note_sorting (campaign_id);
create index note_sorting_user_idx on public.note_sorting (user_id);

create trigger zz_same_campaign_refs
  before insert or update of note_id, campaign_id
  on public.note_sorting
  for each row execute procedure private.enforce_same_campaign_refs('note_id', 'notes', 'owned');

create trigger note_sorting_guard_content_author
  before update on public.note_sorting
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();

-- Rows are taken off the list (deleted) when sorted, never edited, so no updated_at.
alter table public.note_sorting enable row level security;
create policy "note_sorting_select" on public.note_sorting for select using (private.is_campaign_dm(campaign_id));
create policy "note_sorting_insert" on public.note_sorting for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "note_sorting_update" on public.note_sorting for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "note_sorting_delete" on public.note_sorting for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.note_sorting to authenticated, service_role;

create trigger note_sorting_signal_insert after insert on public.note_sorting
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger note_sorting_signal_update after update on public.note_sorting
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger note_sorting_signal_delete after delete on public.note_sorting
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

insert into private.demo_campaign_tables (table_name, tier, copy, reason)
values ('note_sorting', 1, false, 'A one-time list of the DM''s own notes still to sort; a copied campaign starts with nothing to sort.');

-- A session report not linked to a session, and any other note that IS linked to one (a 'general' or 'dm' note tied
-- to a session would otherwise become its chronicle entry, and reach the Chronicler's recall, without the DM saying
-- so; production held none on 20 Nov 2026), go on the list as session notes for the DM to place.
insert into public.note_sorting (note_id, user_id, campaign_id, was)
select n.id, n.user_id, n.campaign_id,
       case when n.category = 'lore' then 'lore' else 'session' end
  from public.notes n
 where n.campaign_id is not null
   and (n.category = 'lore'
        or (n.category = 'session' and n.session_id is null)
        or (n.category not in ('session', 'lore') and n.session_id is not null));

-- ── 2. A canon entry has no chronicle part ────────────────────────────────────
alter table public.canon_entries drop constraint canon_entries_part;
alter table public.canon_entries add constraint canon_entries_part
  check (part in ('premise', 'truth', 'force', 'secret', 'question', 'lore'));



-- ── 3. notes.category goes; its readers are restated without it ───────────────
-- The players' read lists its columns one by one; with the category gone from the row, it is gone from here too.
drop function public.get_player_visible_notes(uuid, uuid);
-- notes_updated_at names the columns whose change stamps the row; it is restated without the category.
drop trigger notes_updated_at on public.notes;
alter table public.notes drop column category;
create trigger notes_updated_at
  before update on public.notes
  for each row when (
    old.title is distinct from new.title or old.content is distinct from new.content
    or old.tags is distinct from new.tags or old.session_id is distinct from new.session_id
    or old.is_pinned is distinct from new.is_pinned
    or old.session_start_year is distinct from new.session_start_year
    or old.session_start_month is distinct from new.session_start_month
    or old.session_start_day is distinct from new.session_start_day
    or old.session_end_year is distinct from new.session_end_year
    or old.session_end_month is distinct from new.session_end_month
    or old.session_end_day is distinct from new.session_end_day
    or old.session_real_date is distinct from new.session_real_date
    or old.linked_calendar_event_id is distinct from new.linked_calendar_event_id)
  execute procedure update_updated_at();

CREATE OR REPLACE FUNCTION public.get_player_visible_notes(p_campaign_id uuid, p_preview_member_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF notes
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
  select
    n.id,
    n.user_id,
    n.title,
    private.withhold_secret_blocks(n.content),
    n.tags,
    n.is_pinned,
    n.created_at,
    n.updated_at,
    n.campaign_id,
    n.is_player_visible,
    n.player_visible_to,
    n.session_start_year,
    n.session_start_month,
    n.session_start_day,
    n.session_end_year,
    n.session_end_month,
    n.session_end_day,
    n.session_real_date,
    n.linked_calendar_event_id,
    n.sort_order,
    n.ai_provenance,
    null::text,                          -- demo_source (#912): a quota marker, nothing for players
    n.session_id,
    -- The reading (below): a player hears a note they may read, so they are told it has one.
    n.reading_hash,
    n.reading_voice,
    n.reading_chars,
    n.reading_at
  from notes n
  where n.campaign_id = p_campaign_id
    and (
      exists (
        select 1 from campaign_members cm
         where cm.campaign_id = n.campaign_id
           and cm.user_id = (select auth.uid())
           and cm.party_member_id = any (n.player_visible_to)
      )
      or (
        private.is_campaign_dm(n.campaign_id)
        and case
          when p_preview_member_id is not null then p_preview_member_id = any (n.player_visible_to)
          else array_length(n.player_visible_to, 1) is not null
        end
      )
    )
$function$;
revoke execute on function public.get_player_visible_notes(uuid, uuid) from public, anon;
grant execute on function public.get_player_visible_notes(uuid, uuid) to authenticated, service_role;

-- The notes search took a list of categories, and its one narrowing caller (the Chronicler's spoiler gate: earlier
-- session reports only) now asks for session notes, which are the notes linked to a session.
drop function public.match_campaign_notes(extensions.vector, uuid, uuid, text, uuid, text[], integer);
-- hnsw.iterative_scan is registered when pgvector's library loads; touching the type loads it, or the function's SET
-- below fails with "permission denied to set parameter" in a session that has not used it (20261010133319).
select '[1]'::extensions.vector;
create function public.match_campaign_notes(
  query_embedding extensions.vector,
  p_campaign_id uuid,
  p_owner_id uuid,
  p_embedding_model text,
  p_exclude_id uuid,
  p_session_notes_only boolean,
  match_count integer)
returns table (id uuid, title text, session_num integer, distance double precision)
language sql
stable
set search_path to 'public', 'extensions'
set "hnsw.iterative_scan" to 'strict_order'
as $function$
  select
    n.id,
    n.title,
    s.number,
    e.embedding <=> query_embedding as distance
  from public.note_embeddings e
  join public.notes n on n.id = e.note_id
  left join public.campaign_sessions s on s.id = n.session_id
  where (
      (
        n.campaign_id = p_campaign_id
        and (
          n.user_id = p_owner_id
          or exists (
            select 1
            from public.campaign_members cm
            where cm.campaign_id = p_campaign_id
              and cm.user_id = n.user_id
              and cm.role = 'dm'
          )
        )
      )
      or (n.campaign_id is null and n.user_id = p_owner_id)
    )
    and e.embedding_model = p_embedding_model
    and (p_exclude_id is null or n.id <> p_exclude_id)
    and (not p_session_notes_only or n.session_id is not null)
  order by e.embedding <=> query_embedding
  limit match_count;
$function$;
revoke execute on function public.match_campaign_notes(extensions.vector, uuid, uuid, text, uuid, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.match_campaign_notes(extensions.vector, uuid, uuid, text, uuid, boolean, integer)
  to service_role;

-- The Open Book's Chronicle reads the notes linked to a session.


-- ── 4. The list changes hands with its campaign ───────────────────────────────


-- ── 5. Merging two sessions moves the canon's links to them too ───────────────
-- Restated whole from 20261119121121 with the canon's four session links added; the merge lists every link into the
-- session log by hand, and merge_campaign_sessions.test.sql fails on any it misses.
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
  -- The canon (#1226): when a clue was found, a force's step reached or its clock ticked, a lore passage told.
  update public.canon_clues            set found_session_id = p_keep where found_session_id = p_absorb;
  update public.canon_force_steps      set reached_session_id = p_keep where reached_session_id = p_absorb;
  update public.canon_force_ticks      set session_id = p_keep where session_id = p_absorb;
  update public.canon_lore_passages    set told_session_id = p_keep where told_session_id = p_absorb;

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

-- The import reads the canon and the pantheon (#1226 story 7, frame 10: "A book taken apart").
--
-- Any campaign book comes apart into the campaign's sections, so the extraction prompt now asks for two more kinds:
-- `deities` (the Pantheon) and `canon` (premise and tone, truths and who knows them, forces with their steps, secrets
-- with their clues, open questions, lore told in passages). The prompt is restated whole with the two bullets and a
-- section saying what the canon is; src/lib/documentImport/extractionPromptCoverage.test.ts reads this, the newest
-- migration that writes the row, and fails on a kind the prompt does not name. Lines and veils are never extracted:
-- they are agreed with the players.

update public.ai_system_prompts
   set content = $prompt$You extract structured tabletop RPG game data from source material a user has supplied — a PDF, photographs of printed pages, or text pasted from a digital edition.

Return every entity you can find, sorted into these ten kinds:

- monsters — kinds of creature the source uses, with their stat block when one is printed
- npcs — named individuals
- locations — places: regions, settlements, buildings, rooms
- items — equipment, treasure, magic items
- spells — spells and comparable formal abilities
- quests — adventures, plot hooks, missions
- factions — organisations, guilds, cults, orders
- deities — gods, saints, patrons and other powers the setting worships or fears
- canon — the world's larger shape, which is not a place, a person or a thing: see "The canon" below
- encounters — a room's occupants, when together they add up to a fight

## The canon

A setting book or the front of an adventure says what the world is like and what is going on in it, beyond any one
place or person. Sort that into `canon` entries, each with a `part`:

- **premise** — the campaign's pitch, its themes, what it is like to play, the voice its text is written in and the
  look of its pictures (`premise_kind`: pitch, theme, table, voice, look). Never lines or veils: those are agreed with
  the players, not read from a book.
- **truth** — a short statement that always holds in this world, one line each, with who knows it (`knowledge`):
  all (anyone may say it), some (name who knows it in `known_to`: people or factions the source names), or secret.
- **force** — something moving beyond the party: who, what they want (`wants`), their next steps in order (`steps`),
  and the quests where the party meets them (`quests`, by name).
- **secret** — an answer the source keeps from the players, with its clues (`clues`): each a line saying what the
  party can find, and where (one place, person or quest beat, by name) when the source says.
- **question** — a mystery the source leaves open on purpose.
- **lore** — history, legend, culture, how magic works: a title, a `lore_kind` (history, legend, culture, magic,
  place, faith, other), a date in the world when the source gives one, and its text told in `passages` (each a heading
  and its text, in your own words, the first what anyone could know and later ones deeper), with where a later passage
  comes out when the source says.

A place, person, faction, item, spell, quest, deity or creature is never a canon entry: it is its own kind, and a
canon entry names it instead.

## Mechanics: copy them exactly

Numbers and rules text are what this import exists to capture. Transcribe them
faithfully and completely: armour class, hit points and hit dice, speeds,
ability scores, saving throws, skills, resistances, immunities, senses,
languages, challenge rating, attack and action text, damage expressions, spell
level, school, casting time, range, components, duration, item rarity, weight,
cost, and attunement.

Never round, simplify, restate or abbreviate a mechanical value. "Hit: 7 (1d8 +
3) piercing damage" is copied exactly, not shortened. If a number is unreadable,
omit the field — do not estimate it.

## Prose: put it in your own words, never transcribe it

Descriptive and narrative text is different. Never reproduce the document's
sentences and never quote it: rewrite it in your own words. The mechanics are
facts and the prose is the author's expression, and this tool restates the
latter rather than copying it.

How much to keep depends on the field:

- **Short fields** — a creature's or location's description, an NPC's
  appearance, personality or backstory, a quest's `summary`, a faction's
  description: a concise summary of what a DM needs to know, at most about 400
  characters.
- **Scenes** — a beat's `dm_content` and a quest's `dm_content` are what the DM
  runs the game from, so **paraphrase them in full**. Paraphrasing is not
  summarising: keep every detail the DM needs at the table — who is there and
  what they want, what they know and will say, the clues, the checks and DCs,
  the options and what each costs, the timing, what happens if the party fails.
  A big scene gets a long field; there is no length limit. Only the wording
  changes.

Three kinds of text are deliberately exempt and must be copied exactly:
- an item's description (its rules and properties)
- a spell's description and higher-level text
- **boxed read-aloud text** — see below

## Boxed read-aloud text: copy it exactly, and only into `read_aloud`

Adventures set apart the passage a DM reads out when the party arrives
somewhere or triggers a scene. In a printed book it is a tinted or ruled box; in
pasted text it arrives as an indented or quoted block.

Copy that text **verbatim**, and put it in the `read_aloud` field — of the beat
it belongs to, or of the keyed area it describes. A summary is useless here: the
field exists to be read out loud, and paraphrasing it defeats the purpose.

Two hard rules:

1. `read_aloud` is the **only** place transcribed narrative text may go. Never
   copy it into a description, a summary, or any other field. The prose rule
   above still governs everything else on the page.
2. Only text the source actually sets apart is read-aloud. Do not promote
   ordinary description into it because it reads nicely, and do not invent a
   read-aloud passage for a scene that has none — leave the field out.

## A creature the adventure uses is a monster, stat block or not

An adventure chapter is not a bestiary. It names the creatures the party will
meet and then refers you elsewhere for their numbers — "two giant rats attack",
"a grell floats near the ceiling", "three kobolds (see appendix C)". Return each
of those as a **monster** anyway, with whatever the page does say (name, and any
description of how it behaves in this adventure), marked `confidence: "partial"`.
That is exactly what partial means: real information, knowingly incomplete.

Returning nothing because the stat block is elsewhere is the worst outcome — it
silently drops the antagonist of the adventure, which is the single entity the
DM most needs. Do not invent numbers to fill the gap; omit the fields the page
does not state.

**A creature kind and a named individual are different entities.** A named
character is an `npc` even when they are a monster by species; the species is
still its own `monster` entry. A kobold leader with a name is an NPC, *and*
"kobold" is a monster the party fights. Return both.

## Quests are graphs, not summaries

A quest is a story with scenes and branches, and adventures are already written
that way. Return each quest as:

- `title` and `summary`. The summary is **one sentence**, and it is shown to the
  players verbatim — so it must contain **no DM-only information**. Write the job
  as the party understands it when they accept it, not as the DM understands it
  after reading the whole chapter.

  Adventures almost always open by telling the DM what is *really* going on: who
  is behind it, who is not what they seem, what the twist is. None of that
  belongs in the summary. "Clear the mine of the creatures that drove the miners
  out" is right; adding that a ghost is behind it is a spoiler printed on the
  players' own quest log. Put the twist in the `dm_content` of the beat where it
  is discovered.

  Anything longer than a sentence belongs in the quest's `dm_content` or in a
  beat.
- `dm_content` — the quest's own notes for the DM: what belongs to no single
  scene. The premise and what is really going on, the background the party
  brings with them, the DM's goals for the session, its themes, how to run a
  recurring character, a preparation checklist. Paraphrase it in full, like a
  beat's. Leave it out when the source has nothing above the scenes.
- `beats` — the scenes, in the order the source presents them. Each beat has a
  `key` you invent (`b1`, `b2`, …) used only to join the arrays below, a
  `title`, a `kind` (`neutral`, `combat`, `social`, `explore`, `discovery`),
  `dm_content` for the guidance around the scene, and `read_aloud` for its
  boxed text if it has any. Every beat also carries `rumor_text` and
  `reveal_text`, the two lines its players are shown — see "What the players
  are shown of a beat" below. A beat also records **what is in it** — see
  "Wiring a beat to the rest of the page" below.
- `routes` — directed edges between beats, referencing your own keys:
  `{ "from": "b1", "to": "b2", "kind": "choice", "label": "…", "note": "…" }`.
  - `label` is what the party does to take the route, in a few words: "Take
    Naerth's deal", "Sneak in through the sewers". The DM reads it at the table
    as the party's option.
  - `note` is one short line on what it leads to or what it costs: "His son
    goes free; the family loses its boats." Leave it out if the source says
    nothing about it.
  - `kind` is `choice` when taking this route means not taking the routes
    beside it, and `parallel` when the party can do it **as well as** the
    others. The test: if they can do both, it is `parallel`. Rescuing the
    prisoners and looting the palace are both possible, so they are parallel
    routes, not a choice; a hub, a heist or a town with several jobs usually
    has several. A private offer to one character while the party deals with
    something else is parallel too.
  - Include a branch wherever the text offers the party a real choice, even
    when it never draws one: "the characters can either parley or drive them
    out" is two `choice` routes out of that beat. A table or list of approaches
    is one route per approach, each to a beat for its outcome. The choice is
    the routes: never make a beat whose content is the list of options.
- `objectives` — what the party is actually trying to do. Each has a
  `description` and `raised_by`, the `key` of the beat where the party learns of
  it. `raised_by` matters: an objective a later beat raises stays dormant until
  the party gets there, instead of showing up as live from the start.

## What the players are shown of a beat

A beat starts hidden. When the DM rumours it, and later reveals it, the players
are shown one line of text for it and nothing else on the beat. You write both
lines, for **every** beat:

- `rumor_text` — what the party can hear about the scene *before* it happens:
  talk at the bar, a warning from a traveller, a notice on a board. It points
  at the scene without giving away what is in it. "The fishermen say the
  lighthouse has been dark for three nights, and the keeper has not come down
  for his supplies."
- `reveal_text` — what the party knows *once the scene has happened to them*,
  written the way their own journal would record it. "The keeper was dead at
  the top of the stairs, and the lamp had been smashed from the inside."

One or two sentences each. Unlike the fields around them, these two are never
left out: a beat with no reveal line shows the players nothing at all, so the
DM would have to write every one by hand before the quest could be shared.

Both are shown to the players verbatim, so the rule for a quest's `summary`
applies with full force: **no DM-only information**. Nothing the party has not
seen or been told by that point in the story — not who is really behind it, not
what waits in the next scene, not a DC or a stat. A rumour may be vague, and it
may be wrong where the source says the locals have it wrong. The truth belongs
in `dm_content`.

Both obey the prose rule too. They are your own summary of what the source says
happens, never its sentences and never its boxed text: `read_aloud` stays the
only home for transcribed narrative, and it is the one field on a beat the
players never see. Summarising is not inventing — do not add an event, a name
or a detail the source does not have.

## Wiring a beat to the rest of the page

An adventure is one web: the NPC the party questions in the second scene, the
fight in the flooded shaft, the gem they recover at the end. The importer turns
that web into links, so a DM opening a beat finds its people, fights and loot
already attached — but only if you name them. For every beat, record:

- `location_name` — the place the scene happens, matching a `locations` entry.
  When the scene is exploring a keyed place (a mine, a keep, a tomb), name
  **the place itself**, never one of its rooms: the rooms are how the DM runs
  it, and one beat covers them all. Do not make a beat per room.
- `npc_names` — named individuals who appear or matter in the scene.
- `monster_names` — creature kinds the party meets there.
- `encounter_names` — fights that happen in the scene, matching `encounters`,
  but only fights that are not already in one of the keyed rooms (an ambush on
  the road, a brawl in the tavern). A fight in a keyed room belongs to that
  room through the encounter's `location_name`, not to the beat.
- `item_names` — items given or needed in the scene (a reward, a key the
  party must bring). An item found in a keyed room belongs to that room: list
  it in the room's own `item_names` instead.
- `faction_names` — organisations acting in the scene.

Use the **exact same names** you gave the matching entries elsewhere in this
response — these are joined by name, and a name that drifts fails to link. Name
only what the scene actually involves; an empty list is a correct answer, and a
beat stuffed with every NPC in the chapter is as useless as one with none.

If the source genuinely has no scenes — a one-line rumour on a table of hooks —
return the quest with no beats. An empty `beats` is a correct answer. Do not
manufacture a placeholder scene to fill it.

## Keyed areas are rooms of one place

Adventures key the locations of a dungeon, building or district with numbered
or lettered headings — "1. Guardroom", "M4. Processing Room", "Area 12" — often
under a single grouping heading.

Every such run of headings is **the rooms of one place**, not a list of
unrelated locations. Extract them as `locations` and set each one's
`parent_name` to the place that contains them.

That place is a **site**: the thing the adventure maps and the party explores
room by room. Give it the `location_type` that says what it is: `dungeon` for
a mine, cave, tomb, ruin or lair; `building` for a house, keep, temple or
tower; `tavern`, `inn` or `store` when it is one; `wilds` for an outdoor place
explored in parts (a wood, a marsh, a graveyard). Give each keyed area
`location_type` `room`, or `grounds` when it is open to the sky (a courtyard, a
glade). A room can only exist inside one of those six site types. A mine typed
as anything else leaves its rooms with nowhere to go.

The container often has **no heading of its own** — it is named in the prose
above the list, or in the quest that sends the party there. Name it from that
context and return it as its own location, so the rooms have a parent to point
at. A grouping heading that only introduces the list is not itself a place, and
is not a beat either.

## A room's occupants are an encounter

When a location's description names creatures that would fight the party there
— "two giant rats lair here", "three kobolds guard the passage" — return that
room as an **encounter** too, in addition to the `monsters`/`npcs` entries for
the creatures themselves.

An encounter has:

- `name` — reuse the room's own heading ("M3. River Cavern") unless the prose
  gives the fight a better name of its own.
- `description` — optional, one line, whatever makes this fight distinct from
  "the room's occupants attack" (an ambush, a hostage, a trap rigged into the
  room). Leave it out when there is nothing beyond the obvious.
- `location_name` — the exact name of the room this fight happens in, matching
  the `locations` entry you gave it.
- `combatants` — `{ "name": ..., "count": ... }` pairs, one per creature kind or
  named individual in the fight, not one per creature. "Three archers and two
  warriors" is two entries, `count: 3` and `count: 2`, never five. Use the
  **exact same name** you gave the matching `monsters` or `npcs` entry — the
  importer links a combatant to the creature it belongs to by that name, and a
  name that drifts even slightly — a plural the monster entry doesn't have, a
  dropped epithet — fails to link, one per creature kind or named individual in
  the fight, not one per creature.

Only propose an encounter where the room's occupants would actually fight the
party. A shopkeeper, a locked chest with no guard, an empty room the text calls
"quiet" — none of these is a fight, and none becomes an encounter. Do not
invent one just to give every room a matching entry.

## Location types come from a fixed list

`location_type` must be exactly one of: continent, region, country, city, town,
village, district, building, room, dungeon, wilderness, other, world, plane,
store, tavern, inn, grounds, wilds. Pick the closest one. A mountain or a
glacier is `wilderness`, and "underground region" is `region`. Do not invent a
type ("mine", "mine room"): the list is what the rest of the app understands.

## Reading structured text

Pasted text arrives as markdown and its structure is meaningful:

- **Heading depth is nesting.** A deeper heading belongs to the one above it.
- **A heading that only groups other headings is not a scene and not a place** —
  it is a section divider. The things under it are the content.
- **A quoted block (`>`) is set-apart text** — usually the boxed read-aloud
  passage for whatever it sits under.
- **Tables are mechanics.** A dice table is rules content: keep its rows.

When the text has no structure at all, judge from the prose itself. Structure is
a help when present, never a requirement.

## Do not invent

Return only what is actually on the page. If a field is not stated, omit it —
an omitted field is a correct answer and the reviewing user can fill it in. A
plausible-looking invented value is the worst possible output, because it is the
one thing they cannot spot in review.

A beat's `rumor_text` and `reveal_text` are the one exception to omitting: they
restate the scene the page does describe, so there is always something to write.

If you find only a name, return the entity with just its name.

## Marking your own confidence

Set `confidence` to "complete" when you captured the whole entry, and "partial"
when you did not — a stat block cut off by a page break, a creature mentioned in
prose without stats, a photograph too blurred to read in places. "partial" is a
useful, expected answer; it tells the user which entries to check. Do not mark
something "complete" because it looks tidy.

Set `page` to the 1-based page or photo the entity came from, or null if you
cannot tell. Pasted text has no pages: use null.

Give every entity a `ref` that is unique within this response — "m1", "m2",
"npc1", and so on. It is used to track the user's selections.

## Cross-references

Where an entity names another entity in the same document, record the **name**
in the matching field — never an identifier, and never a name for something the
page does not contain:

- an NPC's `faction_name`, and `location_name` — where they are usually found
- an NPC's `kin` — family the page names, each as `{ name, relation }` where
  `relation` is what the NAMED person is to this NPC (parent, child, spouse,
  former_spouse, sibling or relative). For "the Baron's son, Izek", Izek's
  entry is `{ "name": "<the Baron>", "relation": "parent" }`. Only ties the
  page states; use the name exactly as that NPC's own entry spells it
- a location's `parent_name`, and `owner_npc_name` — who runs or owns it (an
  innkeeper's inn, a baron's keep), and `item_names` — items found there (the
  treasure in a keyed room)
- a faction's `location_names` — the places it holds or operates from
- a quest's `giver_npc_name` and `location_name`
- an encounter's `location_name` and the creatures in its `combatants`
- a beat's names, as described under the quests section

Every such name must be spelled exactly as the entry it points at.

Return only the JSON. No commentary, no markdown fences.

## Layouts where one entity spans several pages

An entity is not always confined to one page. Card decks, spreads and reference
sheets routinely split a single creature across a front and a back: the front
carries the art, the name, the type line and the core numbers, and the back
carries saving throws, resistances, senses, challenge, traits and actions.

**Merge them.** That is one creature, and it should come back as one entity with
everything from both pages, marked "complete". Do not return the front and the
back as two entities, and do not mark it "partial" — nothing is missing, it is
just laid out across two sides. Use the name, the art and the running order to
decide which back belongs to which front; in a deck the back almost always
immediately follows its own front.

Reserve "partial" for what it means: information that is genuinely absent or
unreadable.

## Reading a card front

Card fronts print things differently from a prose statblock:

- **Ability scores are usually graphics**, not text — a number in a box, its
  modifier in a small circle beneath, and STR / DEX / CON / INT / WIS / CHA
  labelled underneath. Read the large number as the score. If the score and the
  modifier disagree, trust the score.
- **Not every box is labelled.** A row like "AC. 14 | 38 (6d8 + 12) | 30 ft."
  labels only the armour class; the dice expression is hit points and the
  distance is speed. Assign them by shape, not by hoping for a label.
- **The type line combines three fields.** "Medium fey, neutral" is size
  "Medium", creature type "fey", alignment "neutral". "Large construct,
  unaligned" is size "Large", type "construct", alignment "unaligned". Return
  each in its own field.$prompt$,
       updated_at = now()
 where generator_type = 'document_import';

-- The name matcher learns the two kinds, so the review offers an existing god or canon entry as a match.
CREATE OR REPLACE FUNCTION public.match_import_entity_names(p_user_id uuid, p_campaign_id uuid, p_kind text, p_names text[])
 RETURNS TABLE(query_name text, target_id text, source text, matched_name text, match_kind text, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
  with asked as (
    select distinct n as query_name, private.normalize_entity_name(n) as norm
    from unnest(coalesce(p_names, array[]::text[])) as n
    where private.normalize_entity_name(n) is not null
  ),
  -- `detail` is what tells five goblins apart in the review — CR and type,
  -- occupation, rarity, where an encounter happens — plus "all campaigns" for
  -- a DM's global row and the publisher for a library row, since the library
  -- holds the same creature from several books.
  -- The library side obeys the same gate every other library read does: only
  -- books this campaign has enabled, only its edition. Offering a disabled
  -- source's creature as "already yours" is the licensing mistake #567/#583
  -- fixed, and linking to it would put that content into the campaign. Items
  -- key on `source_document_key` with the always-visible bundled gear and an
  -- edition-neutral null ruleset, exactly as `match_library_items` and
  -- `fetchLibraryItems()` do; monsters and spells key on `source`.
  camp as (
    -- A system with no 5e edition (Generic) has no library to match against.
    select private.game_system_is_5e(c.game_system) as has_library,
           case when private.game_system_is_5e(c.game_system) then private.game_system_edition(c.game_system) end as ruleset,
           coalesce(array_agg(s.source_slug) filter (where s.source_slug is not null), array[]::text[]) as slugs
    from public.campaigns c
    left join public.campaign_enabled_sources s on s.campaign_id = c.id
    where c.id = p_campaign_id
    group by c.game_system
  ),
  pool as (
    select 'npcs'::text as kind, x.id::text as id, x.name, 'campaign'::text as source,
           nullif(concat_ws(' · ', x.race, x.occupation, case when x.campaign_id is null then 'all campaigns' end), '') as detail
      from public.npcs x
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'factions', x.id::text, x.name, 'campaign', nullif(concat_ws(' · ', x.faction_type, case when x.campaign_id is null then 'all campaigns' end), '')
      from public.factions x
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'locations', x.id::text, x.name, 'campaign', nullif(concat_ws(' · ', x.location_type::text, case when x.campaign_id is null then 'all campaigns' end), '')
      from public.locations x
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'encounters', x.id::text, x.name, 'campaign', nullif(concat_ws(' · ', 'at ' || l.name, case when x.campaign_id is null then 'all campaigns' end), '')
      from public.encounters x
      -- Scoped like every other row here: nothing in the schema stops an
      -- encounter's location_id pointing at another account's location, and
      -- this function bypasses RLS, so an unscoped join would hand that
      -- location's name back as `detail`. A mismatched id just drops the "at".
      left join public.locations l
        on l.id = x.location_id
       and (l.campaign_id = p_campaign_id or (l.campaign_id is null and l.user_id = p_user_id))
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'quests', x.id::text, x.title, 'campaign', null
      from public.quests x
      where x.campaign_id = p_campaign_id
    union all
    -- The pantheon and the canon (#1226 story 7): a book that names a god or a truth the campaign already has links to
    -- it rather than creating it twice. Both are campaign rows only; a deity carries its portfolio as the detail, a canon
    -- entry its part.
    select 'deities', x.id::text, x.name, 'campaign', nullif(x.portfolio, '')
      from public.deities x
      where x.campaign_id = p_campaign_id
    union all
    select 'canon', x.id::text, x.title, 'campaign', x.part
      from public.canon_entries x
      where x.campaign_id = p_campaign_id and x.title <> ''
    union all
    select 'monsters', x.id::text, x.name, 'campaign',
           nullif(concat_ws(' · ', 'CR ' || (x.stat_block ->> 'challenge_rating'), x.monster_type, case when x.campaign_id is null then 'all campaigns' end), '')
      from public.monsters x
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'monsters', x.id, x.name, 'library',
           nullif(concat_ws(' · ', 'CR ' || (x.stat_block ->> 'challenge_rating'), x.monster_type, coalesce(x.source_title, x.ruleset)), '')
      from public.library_monsters x, camp
      where camp.has_library and x.source = any(camp.slugs) and x.ruleset = camp.ruleset
    union all
    select 'items', x.id::text, x.name, 'campaign', nullif(concat_ws(' · ', x.rarity, x.item_type, case when x.campaign_id is null then 'all campaigns' end), '')
      from public.items x
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'items', x.id, x.name, 'library', nullif(concat_ws(' · ', x.rarity, x.item_type, coalesce(x.source_title, x.ruleset)), '')
      from public.library_items x, camp
      where x.source_document_key = any(array['grimoire-bundled'] || camp.slugs)
        and camp.has_library and (x.ruleset is null or x.ruleset = camp.ruleset)
    union all
    select 'spells', x.id::text, x.name, 'campaign', nullif(concat_ws(' · ', 'level ' || x.level, x.school, case when x.campaign_id is null then 'all campaigns' end), '')
      from public.spells x
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'spells', x.id, x.name, 'library', nullif(concat_ws(' · ', 'level ' || x.level, x.school, coalesce(x.source_title, x.ruleset)), '')
      from public.library_spells x, camp
      where camp.has_library and x.source = any(camp.slugs) and x.ruleset = camp.ruleset
  ),
  existing as (
    select p.id, p.name, p.source, p.detail, private.normalize_entity_name(p.name) as norm
    from pool p
    where p.kind = p_kind
  ),
  matched as (
    select a.query_name, e.id, e.source, e.name, e.detail, m.match_kind
    from asked a
    join existing e on e.norm is not null
    cross join lateral (
      select private.import_name_verdict(p_kind, a.norm, e.norm, e.source) as match_kind
    ) m
    where m.match_kind is not null
  ),
  candidates as (
    select k.query_name, k.id, k.source, k.name, k.detail, k.match_kind,
           -- Exact, near, contains; own rows before the library within each.
           case k.match_kind when 'exact' then 0 when 'near' then 2 else 4 end
             + case when k.source = 'campaign' then 0 else 1 end as rank
    from (
      select m.*, bool_or(m.match_kind = 'exact') over (partition by m.query_name) as has_exact
      from matched m
    ) k
    where k.match_kind <> 'near' or not k.has_exact
  ),
  -- The DM's own rows are never cut: five goblins of their own must all be on
  -- the list, or the one they meant can be the one hidden. 25 is only a guard
  -- against a pathological vault. The library, which can hold the same name
  -- from many books, is capped at five.
  ranked as (
    select c.*, row_number() over (partition by c.query_name, c.source order by c.rank, c.name, c.id) as n
    from candidates c
  )
  select r.query_name, r.id, r.source, r.name, r.match_kind, r.detail
  from ranked r
  where (r.source = 'campaign' and r.n <= 25) or (r.source = 'library' and r.n <= 5)
  order by r.query_name, r.rank, r.name, r.id;
$function$;

-- The canon at the AI table (#1226 story 9, frame 09 "The Narrator", frame 03 "What the table added").
--
-- The AI table comes last: every part of the canon works for a DM at a real table first. Here the Narrator reads it
-- and adds to it without breaking it. Two pieces of schema:
--
-- 1. What the table added (`story_facts`, #1021) gains the DM's review. Keep stamps `kept_at`; Strike stamps
--    `struck_at`: the fact never happened from now on, with nothing in its place (a correction already supersedes a
--    fact with a new one; a strike has no successor, which the schema could not say). A struck fact leaves the players'
--    view and the Narrator's record. `story_facts_keep_what_was_written` guards the listed columns only, so these two
--    may change; the DM-only update policy already covers them.
-- 2. The canon joins the campaign search by meaning (the #600 corpora): `canon_embeddings`, one vector per entry, the
--    entry's title and text with a lore entry's passages folded in. The Narrator looks the canon up through
--    `match_campaign_canon`, asking only for the parts it may read (never a secret: it gets a secret's clues where the
--    party stands, never its statement). Written by embed-content and read by edge functions through the service role.

-- ── 1. Keep and strike ────────────────────────────────────────────────────────
alter table public.story_facts
  add column kept_at timestamptz,
  add column struck_at timestamptz,
  add constraint story_facts_kept_or_struck check (kept_at is null or struck_at is null);

-- A struck fact never happened: players stop reading it, and the ties that hang off it with it.
alter policy "story_facts_select" on public.story_facts
  using (private.is_campaign_dm(campaign_id)
         or (known_to_player and struck_at is null and private.is_campaign_member(campaign_id)));

alter policy "story_fact_links_select" on public.story_fact_links
  using (private.is_campaign_dm(campaign_id)
         or (private.is_campaign_member(campaign_id)
             and exists (select 1 from public.story_facts f
                          where f.id = story_fact_links.fact_id and f.known_to_player and f.struck_at is null)));

-- ── 2. The canon by meaning ───────────────────────────────────────────────────
create table public.canon_embeddings (
  entry_id        uuid primary key references public.canon_entries (id) on delete cascade,
  embedding       extensions.vector(1536) not null,
  embedding_model text not null,
  source_hash     text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index canon_embeddings_vec_idx on public.canon_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

create trigger canon_embeddings_updated_at
  before update on public.canon_embeddings
  for each row execute procedure update_updated_at();

-- RLS enabled with zero policies: written by embed-content and read by edge functions, both through the service-role
-- client. Same deny-all as every other *_embeddings table; a policy would only widen access. Do not "fix" this by
-- adding one.
alter table public.canon_embeddings enable row level security;
grant select, insert, update, delete on public.canon_embeddings to service_role;

insert into private.demo_campaign_tables (table_name, tier, parent_column, parent_table, copy, reason) values
  ('canon_embeddings', 2, 'entry_id', 'canon_entries', true, null);

-- hnsw.iterative_scan is registered when pgvector's library loads; touching the type loads it (20261010133319).
select '[1]'::extensions.vector;

-- Nearest canon entries of one campaign, of the parts the caller asks for. Same shape as match_campaign_quests:
-- invoker, search_path pinned, service-role only, scope and same-model gates before ranking. The caller decides the
-- parts: the Narrator never asks for `secret`.
create function public.match_campaign_canon(
  query_embedding   extensions.vector(1536),
  p_campaign_id     uuid,
  p_embedding_model text,
  p_parts           text[],
  match_count       int
) returns table (
  id        uuid,
  part      text,
  knowledge text,
  title     text,
  distance  float
)
language sql
stable
set search_path = public, extensions
set "hnsw.iterative_scan" to 'strict_order'
as $$
  select c.id, c.part, c.knowledge, c.title, e.embedding <=> query_embedding as distance
    from public.canon_embeddings e
    join public.canon_entries c on c.id = e.entry_id
   where c.campaign_id = p_campaign_id
     and c.part = any (p_parts)
     and e.embedding_model = p_embedding_model
   order by e.embedding <=> query_embedding
   limit match_count;
$$;

revoke execute on function public.match_campaign_canon(extensions.vector, uuid, text, text[], int) from public, anon, authenticated;
grant execute on function public.match_campaign_canon(extensions.vector, uuid, text, text[], int) to service_role;

-- Who a Scriptorium book is for (#1226 story 8, frame 10: "A book drawn from the campaign").
--
-- A book drawn from the campaign is for the DM or for the players. A players' book holds only what the whole party can
-- read, and its preview and print resolve every linked entry from the Open Book's whole-party snapshot rather than the
-- DM's own rows, so nothing the table has not learned is printed. The audience is a property of the book, set when it
-- is drawn; every existing book is the DM's.
alter table public.scriptorium_documents
  add column audience text not null default 'dm'
    constraint scriptorium_documents_audience check (audience in ('dm', 'players'));

-- Backstories written together (#1226 story 10, frame 14; approved 20 Nov 2026).
--
-- A character's backstory is a piece of the canon told in passages. Its opening stays where it has always lived, the
-- character's own Backstory field (`party_members.player_description`): a character can exist outside any campaign and
-- carries that text between campaigns and into the Hall of Heroes, while the canon belongs to one campaign. So nothing
-- is copied: the field is the "Before play" passage, and the campaign's backstory entry (`part = 'backstory'`, one per
-- character) holds what grows from there. The player adds their own passages as the campaign goes and edits them; the
-- DM edits every passage and writes their own, untold until the DM tells them, like a lore passage (by hand, at a place,
-- person or beat, or the Narrator at the AI table).
--
-- The one permission this adds: a player may write, edit and remove the passages they wrote, in their own character's
-- backstory, and nothing else of the canon. They read every passage only through get_player_lore_passages, which
-- never shows one they were not told.

-- ── 1. A backstory is a part, one per character ───────────────────────────────
alter table public.canon_entries drop constraint canon_entries_part;
alter table public.canon_entries add constraint canon_entries_part
  check (part in ('premise', 'truth', 'force', 'secret', 'question', 'lore', 'backstory'));

alter table public.canon_entries
  add column party_member_id uuid references public.party_members (id) on delete cascade,
  add constraint canon_entries_backstory_has_a_character check ((part = 'backstory') = (party_member_id is not null));

-- Full, not partial: only a backstory has a character (the check above), and a full index also serves the foreign key.
create unique index canon_entries_one_backstory on public.canon_entries (party_member_id);

create trigger zz_same_campaign_refs
  before insert or update of party_member_id, campaign_id
  on public.canon_entries
  for each row execute procedure private.enforce_same_campaign_refs('party_member_id', 'party_members', 'owned');

-- ── 2. Passages hang off lore or a backstory, and remember who wrote them ─────
-- Definer: a player writing their own backstory's passage cannot read canon_entries (DM-only), and this only asks what
-- part the parent is.

revoke execute on function private.canon_child_belongs_to() from public, anon, authenticated;

drop trigger canon_lore_passages_belong_to_lore on public.canon_lore_passages;
create trigger canon_lore_passages_belong_to_lore
  before insert or update of entry_id on public.canon_lore_passages
  for each row execute procedure private.canon_child_belongs_to('lore,backstory', 'entry_id');

alter table public.canon_lore_passages
  add column author_id uuid default auth.uid() references auth.users (id) on delete set null;
create index canon_lore_passages_author_idx on public.canon_lore_passages (author_id) where author_id is not null;
update public.canon_lore_passages set author_id = user_id where author_id is null;

-- Is this the player of this backstory's character? Total: false for anything absent.
create function private.writes_own_backstory(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select e.part = 'backstory' and e.party_member_id = private.my_party_member_id(e.campaign_id)
      from public.canon_entries e where e.id = p_entry_id), false)
$$;
revoke execute on function private.writes_own_backstory(uuid) from public, anon;
grant execute on function private.writes_own_backstory(uuid) to authenticated, service_role;

-- The DM, or the player on the passages they wrote in their own character's backstory. One policy per command, the
-- conditions ORed in (CLAUDE.md: one permissive policy per table and command).
alter policy "canon_lore_passages_select" on public.canon_lore_passages
  using (private.is_campaign_dm(campaign_id)
         or (author_id = (select auth.uid()) and private.writes_own_backstory(entry_id)));
alter policy "canon_lore_passages_insert" on public.canon_lore_passages
  with check (user_id = (select auth.uid())
              and (private.is_campaign_dm(campaign_id)
                   or (author_id = (select auth.uid()) and private.writes_own_backstory(entry_id))));
alter policy "canon_lore_passages_update" on public.canon_lore_passages
  using (private.is_campaign_dm(campaign_id)
         or (author_id = (select auth.uid()) and private.writes_own_backstory(entry_id)))
  with check (private.is_campaign_dm(campaign_id)
              or (author_id = (select auth.uid()) and private.writes_own_backstory(entry_id)));
alter policy "canon_lore_passages_delete" on public.canon_lore_passages
  using (private.is_campaign_dm(campaign_id)
         or (author_id = (select auth.uid()) and private.writes_own_backstory(entry_id)));

-- A player's passage is theirs to tell: they may share it with their own character and the party, never place it at
-- the table, tie it to a clue, or re-stamp who wrote it. The DM may do all of that.
create function private.guard_player_passage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A server write (the AI table telling a passage, a demo copy, a content move) has no signed-in user and is not a
  -- player's; the DM may do anything here.
  if (select auth.uid()) is null or private.is_campaign_dm(new.campaign_id) then
    return new;
  end if;
  -- Where a passage comes out is the DM's to set: a player may not place one, nor move a place the DM set, but may
  -- still edit the words of a passage the DM placed.
  if new.author_id is distinct from (select auth.uid())
     or (tg_op = 'INSERT' and (new.location_id is not null or new.npc_id is not null or new.quest_beat_id is not null))
     or (tg_op = 'UPDATE' and (new.location_id is distinct from old.location_id
                               or new.npc_id is distinct from old.npc_id
                               or new.quest_beat_id is distinct from old.quest_beat_id))
     or (tg_op = 'UPDATE' and new.author_id is distinct from old.author_id)
     or exists (select 1 from unnest(new.player_visible_to) m
                 where not exists (select 1 from public.party_members pm
                                    where pm.id = m and pm.campaign_id = new.campaign_id)) then
    raise exception using errcode = '42501', message = 'A player writes only their own passages, told to their party';
  end if;
  -- Told when written: a player's passage is told to whoever it is shared with, at once.
  if new.told_at is null then
    new.told_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_player_passage() from public, anon, authenticated;

create trigger canon_lore_passages_guard_player
  before insert or update on public.canon_lore_passages
  for each row execute procedure private.guard_player_passage();

-- ── 3. Who among the party may read an entry, now with backstories ────────────


-- ── 4. The players' read of passages: lore's first passage is free; a backstory's is not ─────────────────────────
-- A backstory has no free first passage: its opening is the character's own field. Each passage reaches the members it
-- was told to; the player's own passages are told to whom they shared them with (their own character always).
-- `by_dm` says whose words they are, so the journal can mark what the DM told.

revoke execute on function public.get_player_lore_passages(uuid, uuid) from public, anon;
grant execute on function public.get_player_lore_passages(uuid, uuid) to authenticated, service_role;

-- ── 5. A player opens their own character's backstory ─────────────────────────
-- The entry is created on first use, by the DM or by the character's player (who may not write canon_entries): one
-- definer, refusing anyone but the campaign's DMs and that character's player.
create function public.open_backstory(p_party_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign uuid;
  v_id uuid;
  v_owner uuid;
begin
  select pm.campaign_id into v_campaign from public.party_members pm where pm.id = p_party_member_id;
  if v_campaign is null
     or not (coalesce(private.is_campaign_dm(v_campaign), false)
             or private.my_party_member_id(v_campaign) is not distinct from p_party_member_id
                and private.my_party_member_id(v_campaign) is not null) then
    raise exception using errcode = '42501', message = 'Not authorized';
  end if;
  select e.id into v_id from public.canon_entries e where e.part = 'backstory' and e.party_member_id = p_party_member_id;
  if v_id is not null then
    return v_id;
  end if;
  select c.user_id into v_owner from public.campaigns c where c.id = v_campaign;
  insert into public.canon_entries (user_id, campaign_id, part, party_member_id, title)
  values (v_owner, v_campaign, 'backstory', p_party_member_id, '')
  on conflict (party_member_id) do nothing
  returning id into v_id;
  if v_id is null then
    select e.id into v_id from public.canon_entries e where e.part = 'backstory' and e.party_member_id = p_party_member_id;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.open_backstory(uuid) from public, anon;
grant execute on function public.open_backstory(uuid) to authenticated, service_role;

-- ── 6. The players' read of entries says whose backstory an entry is ─────────────

revoke execute on function public.get_player_canon(uuid, uuid) from public, anon;
grant execute on function public.get_player_canon(uuid, uuid) to authenticated, service_role;
