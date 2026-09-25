-- Demo campaign for new users (epic #912).
--
-- A new DM can load a ready-made campaign into their own account and explore
-- every surface with real content in it. The shape, decided 25 Sep 2026:
--
--   * One TEMPLATE campaign lives in production, authored in Grimoire like any
--     campaign (`campaigns.demo_template`). Its prose never enters this public
--     repo -- the template is the master set, not a seed file.
--   * Loading the demo COPIES the template into the caller's account. They get
--     ordinary rows under ordinary RLS, so every feature works on them. A shared
--     read-only campaign was rejected: most of the app is editing, and even
--     running a session writes state.
--   * Copied rows carry `demo_source` (the template version they came from),
--     and the quota functions skip them -- the campaign row included, so a Free
--     DM's one campaign slot stays free. Rows the user adds inside the demo
--     carry nothing and count as normal.
--
-- ── Why the copy is catalogue-driven ─────────────────────────────────────────
--
-- Production has 82 tables with a campaign_id, ~20 more that belong to a
-- campaign only through a parent row, cyclic foreign keys (quests.entry_beat_id
-- -> quest_beats -> quests), and ids inside jsonb and uuid[] columns. A copy that
-- names its tables and columns by hand is out of date the day someone adds a
-- table. So:
--
--   1. `private.demo_campaign_tables` classifies every campaign-scoped table as
--      copied or excluded (with a reason). supabase/tests/demo_campaign.test.sql
--      fails when a table exists that the list does not mention, so a new table
--      is a CI failure rather than a silently incomplete demo.
--   2. The copy reads the template's rows as JSON, builds an old -> new uuid map
--      over every copied row (plus template -> new campaign and template owner ->
--      caller), and rewrites each row's JSON text through that map. Uuids are
--      globally unique, so a textual replace cannot hit anything that is not a
--      reference to a copied row -- and it reaches the references inside jsonb
--      and arrays that no foreign key describes.
--   3. None of the 346 foreign keys in `public` is DEFERRABLE, and `postgres`
--      cannot set session_replication_role in production (both measured 25 Sep
--      2026), so insertion order matters. Rows are inserted in passes, a table
--      at a time, until everything lands; a table that references itself falls
--      back to row-at-a-time within a pass. The three genuine cycles are broken
--      by `defer_columns`: those columns go in null and are restored once every
--      row exists. The test asserts the remaining foreign-key graph is acyclic,
--      so a new cycle fails CI instead of every demo load.

-- ── Columns ─────────────────────────────────────────────────────────────────

alter table public.campaigns
  add column demo_template boolean not null default false,
  add column demo_version  text,
  add column demo_source   text;

comment on column public.campaigns.demo_template is
  'True on the one campaign new users can load as a demo (#912). Set only by publish_demo_version().';
comment on column public.campaigns.demo_version is
  'On the template: the published version. A copy whose demo_source differs is out of date and can be reset.';
comment on column public.campaigns.demo_source is
  'Non-null on a user''s copy of the demo: the template version it was copied from. Exempts the row from quotas.';

-- Exactly one template, and at most one live demo per account. The second is
-- also what makes two concurrent "Load demo" clicks safe: the loser fails on
-- this index rather than leaving the user with two copies.
create unique index campaigns_single_demo_template
  on public.campaigns (demo_template) where demo_template;
create unique index campaigns_one_demo_per_user
  on public.campaigns (user_id) where demo_source is not null;

-- The other quota-tracked tables a demo populates. scriptorium_documents is the
-- one quota table without a campaign_id, so a demo never writes it.
alter table public.npcs                 add column demo_source text;
alter table public.monsters             add column demo_source text;
alter table public.encounters           add column demo_source text;
alter table public.notes                add column demo_source text;
alter table public.quests               add column demo_source text;
alter table public.factions             add column demo_source text;
alter table public.locations            add column demo_source text;
alter table public.deities              add column demo_source text;
alter table public.pantheons            add column demo_source text;
alter table public.puzzle_rooms         add column demo_source text;
alter table public.sounds               add column demo_source text;
alter table public.soundboard_pages     add column demo_source text;
alter table public.soundboard_playlists add column demo_source text;

-- ── Guard: only the copy may set these ──────────────────────────────────────
--
-- `setting_source` (20260818081308) is not write-guarded, and that migration
-- accepts the gap. This one does not, because the gap here is wider: a client
-- that could stamp demo_source on its own rows would have unlimited everything,
-- and one that could set demo_template would replace the demo every new user
-- receives.
--
-- Normalised rather than rejected. The app's duplicate and copy-to-campaign
-- paths spread a whole row into an insert; raising would break "Duplicate" on
-- every demo NPC, while nulling it gives the right answer -- a duplicate of a
-- demo row is the user's own row and counts. `current_user` is the client role
-- only for direct PostgREST writes; inside a SECURITY DEFINER function it is the
-- owner, which is how load_demo_campaign() and publish_demo_version() get past.
create or replace function public.guard_demo_source()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.demo_source := null;
    else
      new.demo_source := old.demo_source;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.guard_campaign_demo_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.demo_source   := null;
      new.demo_template := false;
      new.demo_version  := null;
    else
      new.demo_source   := old.demo_source;
      new.demo_template := old.demo_template;
      new.demo_version  := old.demo_version;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_demo_source() from public, anon, authenticated;
revoke execute on function public.guard_campaign_demo_columns() from public, anon, authenticated;

create trigger campaigns_guard_demo_columns
  before insert or update on public.campaigns
  for each row execute procedure public.guard_campaign_demo_columns();

do $$
declare
  t text;
begin
  foreach t in array array[
    'npcs', 'monsters', 'encounters', 'notes', 'quests', 'factions', 'locations',
    'deities', 'pantheons', 'puzzle_rooms', 'sounds', 'soundboard_pages', 'soundboard_playlists'
  ] loop
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute procedure public.guard_demo_source()',
      t || '_guard_demo_source', t
    );
  end loop;
end;
$$;

-- ── Quota exemption ─────────────────────────────────────────────────────────
--
-- Both bodies read from pg_get_functiondef on production, 25 Sep 2026; the only
-- change is the demo clause. Kept as two edits of one rule because the UI draws
-- its counters from check_all_quotas while the trigger enforces check_quota, and
-- the two must agree.

create or replace function public.check_quota(resource_type text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_quotas  jsonb;
  v_limit   int;
  v_current int;
  v_extra   text := '';
begin
  -- App admins are always unlimited — short-circuit before any DB work
  if private.is_app_admin() then
    return jsonb_build_object('allowed', true, 'current', 0, 'limit', -1, 'unlimited', true);
  end if;

  -- Validate resource_type to prevent arbitrary table scanning via dynamic SQL
  if resource_type not in (
    'campaigns', 'npcs', 'monsters', 'encounters', 'scriptorium_documents', 'notes',
    'sounds', 'soundboard_pages', 'soundboard_playlists',
    'quests', 'factions', 'locations', 'deities', 'pantheons', 'puzzle_rooms'
  ) then
    raise exception 'invalid resource_type: %', resource_type;
  end if;

  -- Curated content is free content and never counts against a cap. Each column
  -- differs because each table records provenance in its own way; the rule is
  -- the same one.
  if resource_type = 'sounds' then
    v_extra := ' and library_id is null';
  elsif resource_type = 'soundboard_playlists' then
    v_extra := ' and library_scene_slug is null';
  elsif resource_type in ('factions', 'deities', 'pantheons', 'locations') then
    v_extra := ' and setting_source is null';
  elsif resource_type = 'campaigns' then
    -- An archived campaign does not occupy a slot (#812). Every string the UI
    -- shows already promised this: the downgrade picker says "the rest will be
    -- archived and can be restored by upgrading", and DefaultLayout decides
    -- whether to show it by counting only NON-archived campaigns. This function
    -- counted all of them, so a free DM who went through the picker was left
    -- holding one active campaign while being told they were at their limit of
    -- one, with no remaining action that could change the number.
    v_extra := ' and is_archived = false';
  end if;

  -- The demo campaign and everything copied into it are free too (#912).
  if resource_type <> 'scriptorium_documents' then
    v_extra := v_extra || ' and demo_source is null';
  end if;

  -- Look up the user's plan quotas; default to free if no subscription row exists
  select p.quotas
    into v_quotas
    from user_subscriptions s
    join plans p on p.id = s.plan_id
   where s.user_id = auth.uid()
     and s.status in ('active', 'trialing');

  if not found then
    select quotas into v_quotas from plans where id = 'free';
  end if;

  -- Missing key in quotas JSONB = unlimited (pro plan has empty {})
  if not (v_quotas ? resource_type) then
    return jsonb_build_object('allowed', true, 'current', 0, 'limit', -1, 'unlimited', true);
  end if;

  v_limit := (v_quotas ->> resource_type)::int;

  execute format('select count(*) from %I where user_id = $1%s', resource_type, v_extra)
    into v_current using auth.uid();

  return jsonb_build_object(
    'allowed',   v_current < v_limit,
    'current',   v_current,
    'limit',     v_limit,
    'unlimited', false
  );
end;
$function$;

create or replace function public.check_all_quotas()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_quotas  jsonb;
  v_result  jsonb := '{}'::jsonb;
  v_res     text;
  v_limit   int;
  v_current int;
  v_extra   text;
  -- Keep this list in sync with check_quota's resource_type allowlist.
  v_resources text[] := array[
    'campaigns', 'npcs', 'monsters', 'encounters', 'scriptorium_documents', 'notes',
    'quests', 'factions', 'locations', 'deities', 'pantheons', 'puzzle_rooms',
    'sounds', 'soundboard_pages', 'soundboard_playlists'
  ];
begin
  -- App admins are always unlimited — short-circuit before any counting
  if private.is_app_admin() then
    foreach v_res in array v_resources loop
      v_result := v_result || jsonb_build_object(
        v_res, jsonb_build_object('allowed', true, 'current', 0, 'limit', -1, 'unlimited', true)
      );
    end loop;
    return v_result;
  end if;

  -- Look up the user's plan quotas; default to free if no subscription row exists
  select p.quotas
    into v_quotas
    from user_subscriptions s
    join plans p on p.id = s.plan_id
   where s.user_id = auth.uid()
     and s.status in ('active', 'trialing');

  if not found then
    select quotas into v_quotas from plans where id = 'free';
  end if;

  foreach v_res in array v_resources loop
    -- Missing key in quotas JSONB = unlimited (pro plan has empty {})
    if not (v_quotas ? v_res) then
      v_result := v_result || jsonb_build_object(
        v_res, jsonb_build_object('allowed', true, 'current', 0, 'limit', -1, 'unlimited', true)
      );
    else
      v_limit := (v_quotas ->> v_res)::int;
      -- Same exemptions as check_quota.
      v_extra := case
        when v_res = 'sounds' then ' and library_id is null'
        when v_res = 'soundboard_playlists' then ' and library_scene_slug is null'
        when v_res in ('factions', 'deities', 'pantheons', 'locations') then ' and setting_source is null'
        when v_res = 'campaigns' then ' and is_archived = false'
        else ''
      end;
      if v_res <> 'scriptorium_documents' then
        v_extra := v_extra || ' and demo_source is null';
      end if;
      execute format('select count(*) from %I where user_id = $1%s', v_res, v_extra)
        into v_current using auth.uid();
      v_result := v_result || jsonb_build_object(
        v_res, jsonb_build_object('allowed', v_current < v_limit, 'current', v_current, 'limit', v_limit, 'unlimited', false)
      );
    end if;
  end loop;

  return v_result;
end;
$function$;

-- ── Side-effect triggers stand down during a copy ───────────────────────────
--
-- Two insert triggers create rows the template already has: every quest gets a
-- 'Main' thread, and every entity attachment on a beat mirrors itself into
-- quest_refs. During a copy the template's own thread and refs are copied with
-- their ids, so the trigger's extras would be duplicates -- and the quest_refs
-- one would collide on (quest_id, ref_type, ref_id) and fail the copy outright.
--
-- `grimoire.copying_campaign` follows `grimoire.bypass_quota` (enforce_quota):
-- a transaction-local setting only a function can set, since PostgREST exposes
-- no SET and pg_catalog.set_config is not in an exposed schema. Bodies read
-- from production 25 Sep 2026; only the early return is new.

create or replace function private.create_quest_main_thread()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'private'
as $function$
begin
  if current_setting('grimoire.copying_campaign', true) = 'on' then
    return new;
  end if;
  if new.campaign_id is not null then
    insert into public.quest_threads (campaign_id, quest_id, label, status, created_by)
    values (new.campaign_id, new.id, 'Main', 'live', new.user_id);
  end if;
  return new;
end;
$function$;

create or replace function private.sync_quest_ref_from_beat_attachment()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ref_type text;
begin
  if current_setting('grimoire.copying_campaign', true) = 'on' then
    return new;
  end if;
  v_ref_type := case new.attachment_type
    when 'encounter' then 'encounter'
    when 'npc' then 'npc'
    when 'faction' then 'faction'
    when 'location_set' then 'location'
    when 'item' then 'item'
    when 'monster' then 'monster'
    else null
  end;
  if v_ref_type is not null then
    insert into quest_refs (quest_id, ref_type, ref_id, is_player_visible)
    values (new.quest_id, v_ref_type, new.ref_id, false)
    on conflict (quest_id, ref_type, ref_id) do nothing;
  end if;
  return new;
end;
$function$;

-- ── Which tables a demo is made of ──────────────────────────────────────────
--
-- tier 1: the table has a campaign_id; its template rows are `campaign_id =
--         template`.
-- tier 2: it has no campaign_id and belongs to a campaign through
--         `parent_column` -> `parent_table`.
-- copy = false needs a reason. Nearly every exclusion is play state (the demo
-- starts unplayed), player-authored (the demo has no players), job history, or
-- a link to something outside the campaign that the loading user cannot see.

create table private.demo_campaign_tables (
  table_name    text primary key,
  tier          smallint not null check (tier in (1, 2)),
  parent_column text,
  parent_table  text,
  copy          boolean not null,
  defer_columns text[] not null default '{}',
  reason        text,
  check ((tier = 2) = (parent_column is not null and parent_table is not null)),
  check (copy or reason is not null)
);

alter table private.demo_campaign_tables enable row level security;
revoke all on private.demo_campaign_tables from public, anon, authenticated;

insert into private.demo_campaign_tables (table_name, tier, copy, defer_columns, reason) values
  -- Copied: the campaign's content.
  ('calendar_events',            1, true,  '{}', null),
  ('campaign_enabled_sources',   1, true,  '{}', null),
  ('campaign_rules',             1, true,  '{}', null),
  ('class_feature_options',      1, true,  '{}', null),
  ('class_features',             1, true,  '{}', null),
  ('class_option_texts',         1, true,  '{}', null),
  ('companions',                 1, true,  '{}', null),
  ('crafting_recipes',           1, true,  '{}', null),
  ('custom_classes',             1, true,  '{}', null),
  ('custom_subclasses',          1, true,  '{}', null),
  ('dashboard_layouts',          1, true,  '{}', null),
  ('deities',                    1, true,  '{}', null),
  ('downtime_deck_backs',        1, true,  '{}', null),
  ('dungeon_features',           1, true,  '{}', null),
  ('dungeon_maps',               1, true,  '{}', null),
  ('encounters',                 1, true,  '{}', null),
  ('entity_notes',               1, true,  '{}', null),
  ('faction_deities',            1, true,  '{}', null),
  ('factions',                   1, true,  '{}', null),
  ('item_entries',               1, true,  '{}', null),
  ('items',                      1, true,  '{}', null),
  -- locations -> npcs (npc_owner_id) -> locations (location_id) is a cycle, as
  -- is locations -> npcs -> monsters (linked_monster_id) -> locations
  -- (lair_location_id). Deferring the owner breaks both.
  ('locations',                  1, true,  '{npc_owner_id}', null),
  ('loot_placements',            1, true,  '{}', null),
  ('loot_tables',                1, true,  '{}', null),
  ('monsters',                   1, true,  '{}', null),
  -- notes.linked_calendar_event_id <-> calendar_events.linked_note_id.
  ('notes',                      1, true,  '{linked_calendar_event_id}', null),
  ('npc_inventory',              1, true,  '{}', null),
  ('npc_relationships',          1, true,  '{}', null),
  ('npc_sets',                   1, true,  '{}', null),
  ('npcs',                       1, true,  '{}', null),
  ('pantheons',                  1, true,  '{}', null),
  ('party_inventory',            1, true,  '{}', null),
  ('party_members',              1, true,  '{}', null),
  ('puzzle_rooms',               1, true,  '{}', null),
  ('quest_beat_attachments',     1, true,  '{}', null),
  ('quest_beat_edge_gates',      1, true,  '{}', null),
  ('quest_beat_edges',           1, true,  '{}', null),
  ('quest_beats',                1, true,  '{}', null),
  ('quest_threads',              1, true,  '{}', null),
  -- quests.entry_beat_id -> quest_beats.quest_id -> quests.
  ('quests',                     1, true,  '{entry_beat_id}', null),
  ('roll_tables',                1, true,  '{}', null),
  ('rules',                      1, true,  '{}', null),
  ('soundboard_pages',           1, true,  '{}', null),
  ('soundboard_playlists',       1, true,  '{}', null),
  ('sounds',                     1, true,  '{}', null),
  ('species',                    1, true,  '{}', null),
  ('spells',                     1, true,  '{}', null),
  ('traps',                      1, true,  '{}', null),
  -- Excluded.
  ('ai_generation_jobs',             1, false, '{}', 'job history of the template''s author'),
  ('image_generation_jobs',          1, false, '{}', 'job history of the template''s author'),
  ('tile_pack_generation_runs',      1, false, '{}', 'job history of the template''s author'),
  ('minis',                          1, false, '{}', 'Simulacrum orders are paid, per-account purchases'),
  ('document_imports',               1, false, '{}', 'import history of the template''s author'),
  ('campaign_invites',               1, false, '{}', 'membership: the copy has no players'),
  ('campaign_members',               1, false, '{}', 'membership: the campaigns insert trigger makes the DM row'),
  ('campaign_messages',              1, false, '{}', 'player messages: the copy has no players'),
  ('campaign_sync',                  1, false, '{}', 'live-sync bookkeeping, rebuilt on use'),
  ('campaign_session_state',         1, false, '{}', 'play state: a demo starts unplayed'),
  ('campaign_tile_packs',            1, false, '{}', 'links to the author''s own tile packs, which the loader cannot read'),
  ('session_proposals',              1, false, '{}', 'scheduling with real players'),
  ('session_proposal_invites',       1, false, '{}', 'RSVP capability tokens'),
  ('session_availability',           1, false, '{}', 'scheduling with real players'),
  ('encounter_state',                1, false, '{}', 'play state: a demo starts unplayed'),
  ('encounter_state_player_updates', 1, false, '{}', 'play state: a demo starts unplayed'),
  ('soundboard_broadcast',           1, false, '{}', 'play state: a demo starts unplayed'),
  ('quest_runtime_state',            1, false, '{}', 'play state: a demo starts unplayed'),
  ('quest_beat_transitions',         1, false, '{}', 'play state: a demo starts unplayed'),
  ('quest_consequence_events',       1, false, '{}', 'play state: a demo starts unplayed'),
  ('npc_favors',                     1, false, '{}', 'consequence output of play'),
  ('party_milestones',               1, false, '{}', 'consequence output of play'),
  ('party_member_tracker_state',     1, false, '{}', 'play state: a demo starts unplayed'),
  ('pinned_forms',                   1, false, '{}', 'play state: a demo starts unplayed'),
  ('discovered_monsters',            1, false, '{}', 'play state: a demo starts unplayed'),
  ('downtime_draws',                 1, false, '{}', 'play state: a demo starts unplayed'),
  ('downtime_grants',                1, false, '{}', 'play state: a demo starts unplayed'),
  ('downtime_outcomes',              1, false, '{}', 'play state: a demo starts unplayed'),
  ('ruleset_reviews',                1, false, '{}', 'per-character review state of the author''s players'),
  ('player_favourites',              1, false, '{}', 'player-authored: the copy has no players'),
  ('player_journal_entries',         1, false, '{}', 'player-authored: the copy has no players'),
  ('player_npc_ratings',             1, false, '{}', 'player-authored: the copy has no players'),
  ('player_read_items',              1, false, '{}', 'player-authored: the copy has no players'),
  ('npc_pc_notes',                   1, false, '{}', 'player-authored: the copy has no players');

insert into private.demo_campaign_tables (table_name, tier, parent_column, parent_table, copy, reason) values
  ('character_classes',           2, 'party_member_id', 'party_members',        true,  null),
  ('character_spells',            2, 'party_member_id', 'party_members',        true,  null),
  ('crafting_recipe_ingredients', 2, 'recipe_id',       'crafting_recipes',     true,  null),
  ('crafting_recipe_modifiers',   2, 'recipe_id',       'crafting_recipes',     true,  null),
  ('crafting_recipe_outputs',     2, 'recipe_id',       'crafting_recipes',     true,  null),
  ('faction_items',               2, 'faction_id',      'factions',             true,  null),
  ('faction_locations',           2, 'faction_id',      'factions',             true,  null),
  ('faction_npcs',                2, 'faction_id',      'factions',             true,  null),
  ('faction_party_members',       2, 'faction_id',      'factions',             true,  null),
  ('faction_relations',           2, 'faction_id',      'factions',             true,  null),
  ('location_doors',              2, 'from_location_id', 'locations',           true,  null),
  ('location_map_regions',        2, 'site_location_id', 'locations',           true,  null),
  ('location_placements',         2, 'location_id',     'locations',            true,  null),
  ('quest_consequences',          2, 'quest_id',        'quests',               true,  null),
  ('quest_objectives',            2, 'quest_id',        'quests',               true,  null),
  ('quest_refs',                  2, 'quest_id',        'quests',               true,  null),
  ('soundboard_playlist_tracks',  2, 'playlist_id',     'soundboard_playlists', true,  null),
  ('store_items',                 2, 'location_id',     'locations',            true,  null),
  -- Embeddings are copied too. They are a pure function of text the copy
  -- repeats verbatim (source_hash matches), and without them a new user's first
  -- dashboard tells them their demo "isn't indexed for AI search yet".

  ('crafting_recipe_grants',      2, 'recipe_id',       'crafting_recipes',     false, 'grants to the author''s players'),
  ('location_state_events',       2, 'location_id',     'locations',            false, 'play state: a demo starts unplayed'),
  ('npc_player_notes',            2, 'npc_id',          'npcs',                 false, 'player-authored: the copy has no players'),
  ('spell_cast_records',          2, 'party_member_id', 'party_members',        false, 'play state: a demo starts unplayed'),
  ('spell_change_windows',        2, 'party_member_id', 'party_members',        false, 'play state: a demo starts unplayed'),
  ('faction_embeddings', 2, 'faction_id', 'factions', true, null),
  ('item_embeddings', 2, 'item_id', 'items', true, null),
  ('location_embeddings', 2, 'location_id', 'locations', true, null),
  ('monster_embeddings', 2, 'monster_id', 'monsters', true, null),
  ('note_embeddings', 2, 'note_id', 'notes', true, null),
  ('npc_embeddings', 2, 'npc_id', 'npcs', true, null);

-- ── The copy ────────────────────────────────────────────────────────────────
--
-- Rewrites every id in the map. A row id is replaced wherever it occurs, which
-- also carries the links rich text makes to an entity (`/npcs/<id>`) over to the
-- copy. The author's own id is the exception: it is replaced only where it
-- stands alone as a value (user_id, created_by, owner_user_id). Inside a string
-- it is a storage path -- `npc-portraits/<author>/<file>.webp` -- and the file
-- lives there, so the copy must keep pointing at it. Those files are public on
-- the CDN, and a user deleting a copied row cannot delete them: storage RLS only
-- lets a user remove objects under their own id. That is what lets the template
-- be illustrated with ordinary uploads, with no special folder.
create or replace function private.remap_demo_ids(p_txt text, p_author uuid)
returns text
language plpgsql
set search_path = public, private
as $$
declare
  v_txt text := p_txt;
  v_new text;
  m     record;
begin
  for m in
    select distinct x[1] as id
      from regexp_matches(p_txt, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'g') x
  loop
    v_new := null;
    select mm.new_id::text into v_new from pg_temp.demo_map mm where mm.old_id = m.id::uuid;
    if v_new is null then
      continue;
    end if;
    if m.id::uuid = p_author then
      v_txt := replace(v_txt, '"' || m.id || '"', '"' || v_new || '"');
    else
      v_txt := replace(v_txt, m.id, v_new);
    end if;
  end loop;
  return v_txt;
end;
$$;

revoke execute on function private.remap_demo_ids(text, uuid) from public, anon, authenticated;

-- p_version null is the publish dry run: nothing is stamped, so the copy does
-- not trip the one-demo-per-account index for an admin who also holds a demo.

create or replace function private.copy_demo_template(p_template uuid, p_owner uuid, p_version text)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  c_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  v_template_owner uuid;
  v_new_campaign   uuid := gen_random_uuid();
  v_campaign       jsonb;
  v_location       jsonb;
  v_bad            text;
  v_count          bigint;
  v_cols           text;
  v_progress       boolean;
  r                record;
  m                record;
begin
  select user_id into v_template_owner from public.campaigns where id = p_template;
  if v_template_owner is null then
    raise exception 'The demo template does not exist';
  end if;

  perform set_config('grimoire.bypass_quota', 'on', true);
  perform set_config('grimoire.copying_campaign', 'on', true);

  drop table if exists pg_temp.demo_rows;
  drop table if exists pg_temp.demo_map;
  create temp table demo_rows (
    seq      bigserial primary key,
    tbl      text not null,
    old_id   uuid,
    new_id   uuid,
    data     jsonb not null,
    deferred jsonb not null default '{}',
    done     boolean not null default false,
    err      text
  ) on commit drop;
  create temp table demo_map (old_id uuid primary key, new_id uuid not null) on commit drop;

  -- 1. Collect. Tier 1 by campaign, then tier 2 through its parent.
  for r in
    select d.table_name,
           exists (select 1 from information_schema.columns c
                    where c.table_schema = 'public' and c.table_name = d.table_name
                      and c.column_name = 'id' and c.data_type = 'uuid') as has_id
      from private.demo_campaign_tables d
     where d.tier = 1 and d.copy
     order by d.table_name
  loop
    execute format(
      'insert into pg_temp.demo_rows (tbl, old_id, data) select %L, %s, to_jsonb(x) from public.%I x where x.campaign_id = $1',
      r.table_name, case when r.has_id then 'x.id' else 'null::uuid' end, r.table_name
    ) using p_template;
  end loop;

  insert into pg_temp.demo_map (old_id, new_id)
  select old_id, gen_random_uuid() from pg_temp.demo_rows where old_id is not null;

  for r in
    select d.table_name, d.parent_column,
           exists (select 1 from information_schema.columns c
                    where c.table_schema = 'public' and c.table_name = d.table_name
                      and c.column_name = 'id' and c.data_type = 'uuid') as has_id
      from private.demo_campaign_tables d
     where d.tier = 2 and d.copy
     order by d.table_name
  loop
    execute format(
      'insert into pg_temp.demo_rows (tbl, old_id, data) select %L, %s, to_jsonb(x) from public.%I x where x.%I in (select old_id from pg_temp.demo_map)',
      r.table_name, case when r.has_id then 'x.id' else 'null::uuid' end, r.table_name, r.parent_column
    );
  end loop;

  insert into pg_temp.demo_map (old_id, new_id)
  select old_id, gen_random_uuid() from pg_temp.demo_rows where old_id is not null
  on conflict (old_id) do nothing;

  insert into pg_temp.demo_map (old_id, new_id) values (p_template, v_new_campaign), (v_template_owner, p_owner)
  on conflict (old_id) do nothing;

  select to_jsonb(c) into v_campaign from public.campaigns c where c.id = p_template;

  -- 2. Validate. The template becomes readable by every user who loads it, so
  --    it must not carry anyone else's identity or point into the author's
  --    other content. Both checks fail loudly, and publish_demo_version() runs
  --    this copy as a dry run, so a bad template is refused at publish time
  --    rather than discovered by the next new user.
  select count(*) into v_count
    from (select data from pg_temp.demo_rows union all select v_campaign) d
   cross join lateral regexp_matches(d.data::text, c_uuid, 'g') x
    join auth.users u on u.id = x[1]::uuid
   where not exists (select 1 from pg_temp.demo_map mm where mm.old_id = u.id);
  if v_count > 0 then
    raise exception 'The demo template references another account; remove its players and invites first';
  end if;

  -- A reference into a table the demo copies must be to a row the demo copies.
  select string_agg(distinct d.tbl || '.' || a.attname, ', ') into v_bad
    from pg_temp.demo_rows d
    join pg_class cl on cl.relname = d.tbl and cl.relnamespace = 'public'::regnamespace
    join pg_constraint con on con.conrelid = cl.oid and con.contype = 'f'
    join pg_class ref on ref.oid = con.confrelid and ref.relnamespace = 'public'::regnamespace
    join pg_attribute a on a.attrelid = cl.oid and a.attnum = any (con.conkey) and a.atttypid = 'uuid'::regtype
   where (ref.relname = 'campaigns'
          or ref.relname in (select table_name from private.demo_campaign_tables where copy))
     and d.data ->> a.attname is not null
     and not exists (select 1 from pg_temp.demo_map mm where mm.old_id = (d.data ->> a.attname)::uuid);
  if v_bad is not null then
    raise exception 'The demo template points at rows outside itself (%)', v_bad;
  end if;

  -- And a reference to a user-owned table the demo does not copy (a Scriptorium
  -- document, a tile pack) would hand the loader an id they cannot read.
  for r in
    select distinct cl.relname as tbl, a.attname as col, ref.relname as ref_tbl
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid and cl.relnamespace = 'public'::regnamespace
      join pg_class ref on ref.oid = con.confrelid and ref.relnamespace = 'public'::regnamespace
      join pg_attribute a on a.attrelid = cl.oid and a.attnum = any (con.conkey) and a.atttypid = 'uuid'::regtype
     where con.contype = 'f'
       and cl.relname in (select table_name from private.demo_campaign_tables where copy)
       and ref.relname <> 'campaigns'
       and ref.relname not in (select table_name from private.demo_campaign_tables where copy)
       and exists (select 1 from information_schema.columns c
                    where c.table_schema = 'public' and c.table_name = ref.relname and c.column_name = 'user_id')
  loop
    execute format(
      'select count(*) from pg_temp.demo_rows d join public.%I t on t.id = (d.data ->> %L)::uuid where d.tbl = %L and t.user_id is not null',
      r.ref_tbl, r.col, r.tbl
    ) into v_count;
    if v_count > 0 then
      raise exception 'The demo template points at its author''s own content outside the campaign (%.%)', r.tbl, r.col;
    end if;
  end loop;

  -- 3. Remap every copied row, and the campaign row, through the id map.
  update pg_temp.demo_rows d set new_id = mm.new_id
    from pg_temp.demo_map mm where mm.old_id = d.old_id;

  for r in select seq, data from pg_temp.demo_rows loop
    update pg_temp.demo_rows
       set data = private.remap_demo_ids(r.data::text, v_template_owner)::jsonb
     where seq = r.seq;
  end loop;

  v_campaign := private.remap_demo_ids(v_campaign::text, v_template_owner)::jsonb;
  v_location := v_campaign -> 'current_location_id';

  -- Stamp provenance, restart the clocks, and set the cycle-breaking columns
  -- aside to restore once every row exists.
  update pg_temp.demo_rows d
     set data = d.data
                || case when d.data ? 'demo_source' then jsonb_build_object('demo_source', p_version) else '{}'::jsonb end
                || case when d.data ? 'created_at' then jsonb_build_object('created_at', now()) else '{}'::jsonb end
                || case when d.data ? 'updated_at' then jsonb_build_object('updated_at', now()) else '{}'::jsonb end
   -- Every row, but a WHERE is still required: PostgREST sessions load
   -- pg_safeupdate, which rejects an UPDATE without one -- even on a temp table.
   where d.seq is not null;

  update pg_temp.demo_rows d
     set deferred = (select coalesce(jsonb_object_agg(col, d.data -> col), '{}'::jsonb)
                       from unnest(t.defer_columns) col
                      where d.data ->> col is not null),
         data = d.data || (select coalesce(jsonb_object_agg(col, null), '{}'::jsonb)
                             from unnest(t.defer_columns) col
                            where d.data ->> col is not null)
    from private.demo_campaign_tables t
   where t.table_name = d.tbl and cardinality(t.defer_columns) > 0;

  -- 4. The campaign row. Built from the template, minus everything that is the
  --    author's rather than the campaign's: BYOK keys, the Spotify client, the
  --    iCal feed token (a capability URL), the template flags, and the AI
  --    choice. `ai_enabled` is the owner's consent under the AI Act (see
  --    context/compliance/ai-act.md §4) -- only the owner may give it, so the
  --    copy starts unchosen and asks its new owner, whatever the author picked.
  --    The provider selection goes with it. AI provenance on the content itself
  --    is copied verbatim: that marks what the content is, not who consented.
  v_campaign := v_campaign || jsonb_build_object(
    'id', v_new_campaign,
    'user_id', p_owner,
    'demo_template', false,
    'demo_version', null,
    'demo_source', p_version,
    'is_archived', false,
    'ical_token', gen_random_uuid(),
    'openai_api_key', null,
    'anthropic_api_key', null,
    'gemini_api_key', null,
    'spotify_client_id', null,
    'ai_enabled', null,
    'text_provider', null,
    'image_provider', null,
    'current_location_id', null,
    'created_at', now(),
    'updated_at', now()
  );
  insert into public.campaigns
  select * from jsonb_populate_record(null::public.campaigns, v_campaign);

  -- The campaigns insert trigger enables the default sources; the template's
  -- own set is copied below instead.
  delete from public.campaign_enabled_sources where campaign_id = v_new_campaign;

  -- 5. Insert in passes until every row lands.
  loop
    v_progress := false;
    for r in
      select d.tbl,
             exists (select 1 from pg_constraint con
                      where con.contype = 'f'
                        and con.conrelid = format('public.%I', d.tbl)::regclass
                        and con.confrelid = con.conrelid) as self_ref
        from pg_temp.demo_rows d
       where not d.done
       group by d.tbl
       order by d.tbl
    loop
      begin
        execute format(
          'insert into public.%I select x.* from pg_temp.demo_rows d cross join lateral jsonb_populate_record(null::public.%I, d.data) x where d.tbl = %L and not d.done',
          r.tbl, r.tbl, r.tbl
        );
        update pg_temp.demo_rows set done = true, err = null where tbl = r.tbl and not done;
        v_progress := true;
      exception when others then
        update pg_temp.demo_rows set err = sqlerrm where tbl = r.tbl and not done;
        -- A table that references itself cannot go in one statement when a
        -- child precedes its parent; take it a row at a time.
        if r.self_ref then
          for m in select seq, data from pg_temp.demo_rows where tbl = r.tbl and not done order by seq loop
            begin
              execute format(
                'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
                r.tbl, r.tbl
              ) using m.data;
              update pg_temp.demo_rows set done = true, err = null where seq = m.seq;
              v_progress := true;
            exception when others then
              update pg_temp.demo_rows set err = sqlerrm where seq = m.seq;
            end;
          end loop;
        end if;
      end;
    end loop;

    exit when not exists (select 1 from pg_temp.demo_rows where not done);

    if not v_progress then
      raise exception 'The demo template could not be copied: %',
        (select string_agg(distinct tbl || ': ' || err, '; ') from pg_temp.demo_rows where not done);
    end if;
  end loop;

  -- 6. Restore the deferred references.
  for r in select tbl, new_id, deferred from pg_temp.demo_rows where deferred <> '{}'::jsonb loop
    select string_agg(format('%I = src.%I', k, k), ', ') into v_cols
      from jsonb_object_keys(r.deferred) k;
    execute format(
      'update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) src where t.id = $2',
      r.tbl, v_cols, r.tbl
    ) using r.deferred, r.new_id;
  end loop;

  if v_location is not null and v_location <> 'null'::jsonb then
    update public.campaigns set current_location_id = (v_location #>> '{}')::uuid where id = v_new_campaign;
  end if;

  perform set_config('grimoire.copying_campaign', 'off', true);
  perform set_config('grimoire.bypass_quota', 'off', true);

  return v_new_campaign;
end;
$$;

-- ── Removing a demo ─────────────────────────────────────────────────────────
--
-- Deleting a campaign does not delete its content: eleven foreign keys to
-- campaigns are SET NULL (notes and npcs return to the owner's general scope)
-- and seven are NO ACTION. For a demo that would leave its NPCs and notes
-- behind in the account, quota-free. So a demo is purged table by table, in
-- passes because the rows reference each other, and only then deleted.

create or replace function private.purge_demo_campaign(p_campaign uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  r          record;
  v_n        bigint;
  v_progress boolean;
  v_blocked  boolean;
  v_err      text;
begin
  loop
    v_progress := false;
    v_blocked  := false;
    for r in select * from private.demo_campaign_tables order by tier desc, table_name loop
      begin
        if r.tier = 1 then
          execute format('delete from public.%I where campaign_id = $1', r.table_name) using p_campaign;
        else
          execute format(
            'delete from public.%I where %I in (select id from public.%I where campaign_id = $1)',
            r.table_name, r.parent_column, r.parent_table
          ) using p_campaign;
        end if;
        get diagnostics v_n = row_count;
        if v_n > 0 then
          v_progress := true;
        end if;
      exception when foreign_key_violation then
        v_blocked := true;
        v_err := sqlerrm;
      end;
    end loop;
    exit when not v_blocked;
    if not v_progress then
      raise exception 'The demo campaign could not be removed: %', v_err;
    end if;
  end loop;

  delete from public.campaigns where id = p_campaign;
end;
$$;

revoke execute on function private.copy_demo_template(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function private.purge_demo_campaign(uuid) from public, anon, authenticated;

-- ── Client RPCs ─────────────────────────────────────────────────────────────

-- Loads the published demo into the caller's account. p_replace = true is
-- "Reset demo": the existing copy is purged and a fresh one made in the same
-- transaction, so a failed copy leaves the old demo where it was.
create or replace function public.load_demo_campaign(p_replace boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid      uuid := auth.uid();
  v_template uuid;
  v_version  text;
  v_existing uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_replace is null then
    raise exception 'p_replace must be true or false';
  end if;

  select id, demo_version into v_template, v_version
    from public.campaigns
   where demo_template;
  if v_template is null or v_version is null then
    raise exception 'No demo campaign has been published' using errcode = 'P0002';
  end if;

  select id into v_existing
    from public.campaigns
   where user_id = v_uid and demo_source is not null;

  if v_existing is not null then
    if not p_replace then
      raise exception 'You already have the demo campaign' using errcode = '23505';
    end if;
    perform private.purge_demo_campaign(v_existing);
  end if;

  return private.copy_demo_template(v_template, v_uid, v_version);
end;
$$;

-- What the app needs to decide which demo controls to show. Never exposes the
-- template's id: the template is the author's campaign, not the caller's.
create or replace function public.get_demo_status()
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid      uuid := auth.uid();
  v_version  text;
  v_demo_id  uuid;
  v_loaded   text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select demo_version into v_version from public.campaigns where demo_template;
  select id, demo_source into v_demo_id, v_loaded
    from public.campaigns
   where user_id = v_uid and demo_source is not null;

  return jsonb_build_object(
    'published',        v_version is not null,
    'version',          v_version,
    'demo_campaign_id', v_demo_id,
    'loaded_version',   v_loaded
  );
end;
$$;

-- Makes one of the admin's own campaigns the demo template and stamps a new
-- version. The copy runs first as a dry run inside a subtransaction that is
-- always rolled back, so a template that cannot be copied -- a stray player, a
-- reference outside the campaign, a cycle nobody deferred -- is refused here,
-- with the reason, instead of failing for the next new user.
create or replace function public.publish_demo_version(p_campaign_id uuid)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid     uuid := auth.uid();
  v_owner   uuid;
  v_source  text;
  v_version text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not coalesce(private.is_app_admin(), false) then
    raise exception 'Not authorized';
  end if;

  select user_id, demo_source into v_owner, v_source
    from public.campaigns where id = p_campaign_id;
  if v_owner is null then
    raise exception 'Campaign not found';
  end if;
  if v_owner <> v_uid then
    raise exception 'Only your own campaign can be published as the demo';
  end if;
  if v_source is not null then
    raise exception 'A copy of the demo cannot itself be published as the demo';
  end if;

  begin
    perform private.copy_demo_template(p_campaign_id, v_uid, null);
    raise exception using errcode = 'DMDRY', message = 'demo dry run complete';
  exception when sqlstate 'DMDRY' then
    null;
  end;

  v_version := to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

  update public.campaigns
     set demo_template = false, demo_version = null
   where demo_template and id <> p_campaign_id;
  update public.campaigns
     set demo_template = true, demo_version = v_version
   where id = p_campaign_id;

  return v_version;
end;
$$;

revoke execute on function public.load_demo_campaign(boolean) from public, anon;
grant  execute on function public.load_demo_campaign(boolean) to authenticated, service_role;
revoke execute on function public.get_demo_status() from public, anon;
grant  execute on function public.get_demo_status() to authenticated, service_role;
revoke execute on function public.publish_demo_version(uuid) from public, anon;
grant  execute on function public.publish_demo_version(uuid) to authenticated, service_role;

-- ── Deleting a demo from Danger Zone purges it ──────────────────────────────
--
-- Body read from pg_get_functiondef on production, 25 Sep 2026 (last replaced
-- by 20260904171236). The only change is the demo branch after the ownership
-- check: a demo has no homebrew of the DM's to promote, and the ordinary path
-- would leave its content behind (see purge_demo_campaign).

CREATE OR REPLACE FUNCTION public.delete_campaign_with_homebrew(p_campaign_id uuid, p_disposition text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- `is null or` is load-bearing, and is a fix rather than a copy. `null not in
  -- ('promote','delete')` evaluates to NULL, so this guard never fired for a
  -- null disposition; execution then fell past `if p_disposition = 'promote'`
  -- (also NULL, therefore false) into the else branch, and deleted. The one
  -- non-total predicate in this function, failing destructive-side. Inherited
  -- from 20260730000011, closed here because this change puts one more table
  -- behind it.
  if p_disposition is null or p_disposition not in ('promote', 'delete') then
    raise exception 'Invalid disposition: %, expected ''promote'' or ''delete''', p_disposition;
  end if;

  -- Mirrors "Users manage own campaigns", the only RLS policy that governs
  -- DELETE on public.campaigns: only the campaign's owner may delete it. This
  -- function is SECURITY DEFINER and bypasses RLS entirely, so that check is
  -- restated here explicitly, re-derived from auth.uid() -- never trusting a
  -- caller-supplied id.
  select user_id into v_owner
  from public.campaigns
  where id = p_campaign_id;

  if v_owner is null then
    raise exception 'Campaign not found';
  end if;

  if v_owner <> v_uid then
    raise exception 'Not authorized to delete this campaign';
  end if;

  -- A demo campaign (#912) is removed whole, whatever the disposition.
  if exists (select 1 from public.campaigns where id = p_campaign_id and demo_source is not null) then
    perform private.purge_demo_campaign(p_campaign_id);
    return;
  end if;

  -- `campaign_id = p_campaign_id` is false (not true) for NULL rows, so
  -- universal homebrew and every other campaign's rows are never touched.
  -- `user_id = v_uid` is the other half, and the point of 20260809000004: the
  -- disposition the DM chose is a decision about the DM's own authored work.
  -- It is not consent to delete a previous owner's.
  if p_disposition = 'promote' then
    update public.custom_classes    set campaign_id = null where campaign_id = p_campaign_id and user_id = v_uid;
    update public.custom_subclasses set campaign_id = null where campaign_id = p_campaign_id and user_id = v_uid;
    update public.class_features    set campaign_id = null where campaign_id = p_campaign_id and user_id = v_uid;
    update public.monsters          set campaign_id = null where campaign_id = p_campaign_id and user_id = v_uid;
    update public.traps             set campaign_id = null where campaign_id = p_campaign_id and user_id = v_uid;
    update public.puzzle_rooms      set campaign_id = null where campaign_id = p_campaign_id and user_id = v_uid;
    update public.dungeon_maps      set campaign_id = null where campaign_id = p_campaign_id and user_id = v_uid;
    update public.dungeon_features  set campaign_id = null where campaign_id = p_campaign_id and user_id = v_uid;
  else
    delete from public.custom_classes    where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.custom_subclasses where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.class_features    where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.monsters          where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.traps             where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.puzzle_rooms      where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.dungeon_maps      where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.dungeon_features  where campaign_id = p_campaign_id and user_id = v_uid;
  end if;

  -- Whatever still points at this campaign belongs to another user -- in
  -- practice a previous owner, after a transfer. Promote it, never delete it.
  -- In the 'promote' branch this is a no-op superset of the statements above.
  --
  -- Without dungeon_maps here, a map owned by another user and scoped to this
  -- campaign survives the disposition and then aborts the whole delete on the
  -- NO ACTION constraint, with a raw 23503 and no route forward from the UI.
  update public.custom_classes    set campaign_id = null where campaign_id = p_campaign_id;
  update public.custom_subclasses set campaign_id = null where campaign_id = p_campaign_id;
  update public.class_features    set campaign_id = null where campaign_id = p_campaign_id;
  update public.monsters          set campaign_id = null where campaign_id = p_campaign_id;
  update public.traps             set campaign_id = null where campaign_id = p_campaign_id;
  update public.puzzle_rooms      set campaign_id = null where campaign_id = p_campaign_id;
  update public.dungeon_maps      set campaign_id = null where campaign_id = p_campaign_id;
  update public.dungeon_features  set campaign_id = null where campaign_id = p_campaign_id;

  delete from public.campaigns where id = p_campaign_id;
end;
$function$;

revoke execute on function public.delete_campaign_with_homebrew(uuid, text) from public, anon;
grant  execute on function public.delete_campaign_with_homebrew(uuid, text) to authenticated, service_role;

-- ── Player projections gain the column ──────────────────────────────────────
--
-- Four player-facing projections are declared `returns setof <table>` and name
-- their columns one by one, so adding demo_source to the table breaks them at
-- the next call ("final statement returns too few columns") -- the player
-- portal's locations, NPCs, bestiary and puzzles, all at once. Each body below
-- is production's (pg_get_functiondef, 25 Sep 2026, md5-verified against the
-- local replay) with one trailing null column. get_player_visible_quests
-- selects q.* and follows the table on its own.

CREATE OR REPLACE FUNCTION public.get_player_visible_locations(p_campaign_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF locations
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    l.id,
    l.user_id,
    l.campaign_id,
    l.parent_id,
    l.name,
    l.location_type,
    case when l.is_description_shared then l.description else null::text end,
    null::text,                                                               -- notes (DM-only)
    l.tags,
    l.image_url,
    l.created_at,
    l.updated_at,
    case when l.is_map_shared then l.map_url else null::text end,
    coalesce((
      select jsonb_agg(pin)
      from jsonb_array_elements(coalesce(l.map_pins, '[]'::jsonb)) pin
      where coalesce((pin->>'visible_to_players')::boolean, false)
    ), '[]'::jsonb),
    l.is_map_shared,
    l.player_summary,
    l.is_description_shared,
    l.is_npcs_shared,
    l.player_visible_to,
    l.is_inventory_shared,
    l.npc_owner_id,
    l.related_location_ids,
    l.source_map_id,
    l.grid_calibration,
    l.is_battle_map,
    l.era_start,
    l.era_end,
    null::text,                                                               -- audio_theme (DM-only)
    l.ai_provenance,
    l.setting_source,
    l.sort_order,
    null::integer,                                                            -- map_published_rev (DM tooling)
    case when l.is_map_shared then l.map_layer_url else null::text end,
    case when l.is_map_shared then l.map_layer_calibration else null::jsonb end,
    case when l.is_map_shared then l.plan_size else null::jsonb end,
    null::text                                                                -- demo_source (#912): a quota marker, nothing for players
  from locations l
  where l.campaign_id is not null
    and (p_campaign_id is null or l.campaign_id = p_campaign_id)
    and (p_location_id is null or l.id = p_location_id)
    and exists (
      select 1 from campaign_members cm
      where cm.user_id = (select auth.uid())
        and cm.campaign_id = l.campaign_id
    )
    and (
      exists (
        select 1 from campaign_members cm
        where cm.user_id = (select auth.uid())
          and cm.campaign_id = l.campaign_id
          and cm.party_member_id = any (l.player_visible_to)
      )
      or (p_location_id is not null and l.is_map_shared = true)
    )
$function$
;

CREATE OR REPLACE FUNCTION public.get_player_visible_monsters(p_campaign_id uuid)
 RETURNS SETOF monsters
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (
    select cm.party_member_id
    from campaign_members cm
    where cm.user_id = (select auth.uid())
      and cm.campaign_id = p_campaign_id
  ),
  discovered as (
    select dm.monster_id,
           bool_or(dm.reveal_stats) as reveal_stats
    from discovered_monsters dm
    where dm.campaign_id = p_campaign_id
      and dm.monster_id is not null
      and (
        dm.visible_to is null
        or exists (select 1 from me where me.party_member_id = any (dm.visible_to))
      )
    group by dm.monster_id
  ),
  pinned as (
    select pf.monster_id
    from pinned_forms pf
    where pf.campaign_id = p_campaign_id
      and pf.monster_id is not null
      and pf.party_member_id in (select party_member_id from me)
  ),
  visible as (
    select monster_id, bool_or(reveal_stats) as reveal_stats
    from (
      select monster_id, reveal_stats from discovered
      union all
      select monster_id, true as reveal_stats from pinned
    ) u
    group by monster_id
  )
  select
    m.id,
    m.user_id,
    m.name,
    m.monster_type,
    m.size,
    m.alignment,
    m.habitat,
    m.source,
    m.tags,
    case when v.reveal_stats then m.stat_block else null::jsonb end,  -- stat_block gated by reveal_stats
    null::text,                                                       -- notes (DM-only)
    m.created_at,
    m.updated_at,
    m.image_url,
    null::text,                                                       -- description (DM-only)
    m.portrait_focal_point,
    m.open5e_import,
    m.source_title,
    m.source_url,
    null::uuid,                                                       -- lair_location_id (DM-only)
    m.ruleset,
    m.conceptual_key,
    m.source_document_key,
    m.source_record_key,
    m.source_revision,
    m.source_license,
    m.provenance,
    m.ai_provenance,
    null::uuid,                                                       -- campaign_id (DM-only scope)
    null::text                                                        -- demo_source (#912): a quota marker, nothing for players
  from monsters m
  join visible v on v.monster_id = m.id
  where private.is_campaign_member(p_campaign_id);
$function$
;

CREATE OR REPLACE FUNCTION public.get_player_visible_npcs(p_campaign_id uuid DEFAULT NULL::uuid, p_location_ids uuid[] DEFAULT NULL::uuid[], p_preview_member_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF npcs
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    s.id,
    s.user_id,
    case
      when not ('name' = any (s.player_visible_fields)) then null
      when s.concealed and s.disguise_name is not null then s.disguise_name
      else s.name
    end,
    case when 'race' = any (s.player_visible_fields) then s.race else null end,
    null::text,                                            -- alignment (DM-only)
    null::text,                                            -- age (DM-only)
    case when 'occupation' = any (s.player_visible_fields) then s.occupation else null end,
    null::text,                                            -- appearance (DM-only)
    null::text,                                            -- personality (DM-only)
    null::text,                                            -- backstory (DM-only)
    null::text,                                            -- notes (DM-only)
    s.status,
    s.relationship,
    case
      when not ('portrait' = any (s.player_visible_fields)) then null
      when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_url
      else s.portrait_url
    end,
    null::text[],                                          -- tags (DM-only; no player toggle)
    null::jsonb,                                           -- stat_block (DM-only)
    null::uuid,                                            -- scriptorium_doc_id (DM-only)
    s.created_at,
    s.updated_at,
    s.campaign_id,
    case when 'location' = any (s.player_visible_fields) then s.location_id else null::uuid end,
    s.player_visible_fields,
    case
      when not ('portrait' = any (s.player_visible_fields)) then null
      when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_focal_point
      else s.portrait_focal_point
    end,
    null::uuid,                                            -- linked_monster_id (DM-only)
    s.relevance,
    s.player_visible_to,
    null::text,                                            -- disguise_name (stripped)
    null::text,                                            -- disguise_portrait_url (stripped)
    null::jsonb,                                           -- disguise_portrait_focal_point (stripped)
    false,                                                 -- is_revealed (cover shown; never leak true state)
    s.ai_provenance,
    null::text                                             -- demo_source (#912): a quota marker, nothing for players
  from (
    select n.*,
      ((n.disguise_name is not null or n.disguise_portrait_url is not null)
        and not n.is_revealed) as concealed
    from npcs n
    where (p_campaign_id is null or n.campaign_id = p_campaign_id)
      and (p_location_ids is null or n.location_id = any (p_location_ids))
      and (
        -- (a) individually shared with the caller
        exists (
          select 1 from campaign_members cm
          where cm.user_id = (select auth.uid())
            and cm.campaign_id = n.campaign_id
            and cm.party_member_id = any (n.player_visible_to)
        )
        -- (b) shared via the NPC's OWN location ("Share linked NPCs" on that
        --     location, shared with the caller) — direct location only.
        or exists (
          select 1 from locations l
          join campaign_members cm
            on cm.user_id = (select auth.uid()) and cm.campaign_id = l.campaign_id
          where l.id = n.location_id
            and l.is_npcs_shared
            and cm.party_member_id = any (l.player_visible_to)
        )
        -- (c) DM preview: the campaign DM sees exactly what the previewed member
        --     would see (individually shared, or location-shared to that member);
        --     with no member chosen, anything shared with at least one member.
        or (
          private.is_campaign_dm(n.campaign_id)
          and (
            (p_preview_member_id is not null and (
              p_preview_member_id = any (n.player_visible_to)
              or exists (
                select 1 from locations l
                where l.id = n.location_id
                  and l.is_npcs_shared
                  and p_preview_member_id = any (l.player_visible_to)
              )
            ))
            or (p_preview_member_id is null and (
              array_length(n.player_visible_to, 1) is not null
              or exists (
                select 1 from locations l
                where l.id = n.location_id
                  and l.is_npcs_shared
                  and array_length(l.player_visible_to, 1) is not null
              )
            ))
          )
        )
      )
  ) s;
$function$
;

CREATE OR REPLACE FUNCTION public.get_player_visible_puzzles(p_campaign_id uuid DEFAULT NULL::uuid, p_puzzle_id uuid DEFAULT NULL::uuid, p_preview_party_member_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF puzzle_rooms
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_preview_party_member_id is not null and not exists (
    select 1
    from public.party_members pm
    where pm.id = p_preview_party_member_id
      and (p_campaign_id is null or pm.campaign_id = p_campaign_id)
      and coalesce(private.is_campaign_dm(pm.campaign_id), false)
  ) then
    raise exception 'Preview audience is not available to this DM';
  end if;

  return query select
    p.id,
    p.user_id,
    p.name,
    p.puzzle_type,
    p.difficulty,
    p.description,                       -- player-facing "The Room" setup
    null::text,                          -- solution (DM-only)
    -- hints: keep only the entries the DM has revealed via shared_hints
    coalesce((
      select jsonb_agg(h order by (h->>'order')::int)
      from jsonb_array_elements(coalesce(p.hints, '[]'::jsonb)) h
      where (h->>'order')::int = any (coalesce(p.shared_hints, array[]::int[]))
    ), '[]'::jsonb),
    p.skill_checks,                      -- skill + DC are shown to players
    null::text,                          -- success_outcome (DM-only)
    null::text,                          -- failure_consequence (DM-only)
    p.image_url,
    p.image_focal_point,
    p.tags,
    null::text,                          -- notes (DM-only)
    p.created_at,
    p.updated_at,
    p.campaign_id,
    p.is_shared,
    p.shared_hints,
    p.read_aloud,
    null::uuid,                          -- location_id (DM-only anchor)
    null::uuid,                          -- dungeon_feature_id (DM-only anchor)
    p.ai_provenance,
    p.player_visible_to,
    null::text                           -- demo_source (#912): a quota marker, nothing for players
  from puzzle_rooms p
  where p.campaign_id is not null
    and (p_campaign_id is null or p.campaign_id = p_campaign_id)
    and (p_puzzle_id   is null or p.id = p_puzzle_id)
    and case
      when p_preview_party_member_id is null then private.is_puzzle_player_visible(p.id)
      else p_preview_party_member_id = any (p.player_visible_to)
        and coalesce(private.is_campaign_dm(p.campaign_id), false)
    end;
end;
$function$
;
