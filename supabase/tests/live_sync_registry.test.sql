begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

-- The database half of live sync, checked against the schema as it stands
-- rather than read out of migration text.
--
-- Two ways a change reaches a client (src/composables/campaign/useCampaignLiveSync.ts):
--
--   subscribed  the channel listens to the table itself, filtered on
--               campaign_id. It must be published, or the subscription joins
--               and receives nothing, forever, with nothing about the client
--               code wrong (the failure 20260728000003 and 20260904230420 each
--               had to call out by hand). And it must ring the campaign_sync
--               doorbell on delete, because a filtered DELETE never arrives.
--   doorbell    the table's rows may not travel at all (no campaign_id, a
--               subscriber RLS will not show the row to, or DM-only quest
--               history that 20260810000012 keeps out of realtime on purpose),
--               so every write rings the doorbell instead.
--   named       a signal that is not a table name. A subscribed table whose
--               rows some members may not read rings a name of its own on
--               insert and update, so only those members' projections refresh:
--               `npcs` rings `npcs_player` (20260928233302), because players
--               read NPCs only through get_player_visible_npcs. Places,
--               quests, quest beats and quest objectives ring the same way
--               (player_live_sync_for_places_and_quests): players read them
--               through projections or owner-only policies, so no row event
--               reaches them. quest_beats and quest_objectives are not
--               published and also ring `<table>_player` on delete;
--               quest_objectives has no campaign_id and rings through its
--               parent quest (signal_parent_change).
--   own channel a table subscribed outside the campaign channel with exact-row
--               handlers (party_members, usePartyLive) rings only on delete.
--
-- A table with no campaign_id rings through its parent: a character, a place,
-- a quest, a faction, a recipe or a playlist (signal_parent_change, #1033).
--
-- These lists mirror the client registry, and campaignSyncTables.test.ts reads
-- this file and fails when they differ: SYNC_TABLES plus party_inventory for
-- the first, and SIGNAL_KEYS covering all of them. So a table cannot be added
-- to the client without being checked here.

create temporary table live_sync_subscribed (name text primary key) on commit drop;
insert into live_sync_subscribed (name) values
  ('notes'), ('quests'), ('locations'), ('factions'), ('npcs'), ('companions'),
  ('discovered_monsters'), ('pantheons'), ('deities'), ('puzzle_rooms'),
  ('calendar_events'), ('player_journal_entries'), ('session_proposals'),
  ('session_availability'), ('items'), ('loot_placements'), ('party_milestones'),
  ('campaign_messages'), ('npc_inventory'), ('campaign_members'),
  ('campaign_rules'), ('downtime_grants'), ('downtime_draws'),
  ('downtime_outcomes'), ('downtime_deck_backs'), ('minis'), ('class_option_texts'),
  ('item_entries'), ('party_inventory'), ('character_content_reviews'),
  ('dm_note_touches'), ('character_memorials'), ('memorial_mourners');

create temporary table live_sync_doorbell (name text primary key) on commit drop;
insert into live_sync_doorbell (name) values
  ('store_items'), ('quest_runtime_state'), ('quest_threads'),
  ('quest_beat_transitions'), ('campaign_sessions'), ('ruleset_reviews'),
  ('scriptorium_documents'), ('entity_mentions'), ('entity_notes'),
  ('quest_clocks'), ('character_classes'), ('character_spells'),
  -- Play state (#1033 wave 1).
  ('handout_reveals'), ('location_reveals'), ('npc_reveals'), ('npc_pc_notes'),
  ('player_npc_ratings'), ('npc_favors'), ('faction_party_members'),
  ('party_member_tracker_state'), ('pinned_forms'), ('location_state_events'),
  ('location_placements'), ('quest_consequence_events'), ('campaign_join_requests'),
  ('encounters'), ('loot_tables'), ('roll_tables'), ('dungeon_maps'),
  ('dungeon_features'),
  -- Campaign content (#1033 wave 2).
  ('monsters'), ('spells'), ('species'), ('custom_classes'), ('custom_subclasses'),
  ('class_features'), ('rules'), ('traps'), ('crafting_recipes'),
  ('crafting_recipe_ingredients'), ('crafting_recipe_outputs'),
  ('crafting_recipe_modifiers'), ('campaign_enabled_sources'), ('campaign_tile_packs'),
  ('sounds'), ('soundboard_pages'), ('soundboard_playlists'),
  ('soundboard_playlist_tracks'), ('npc_sets'), ('faction_deities'),
  ('faction_locations'), ('faction_items'), ('faction_npcs'), ('faction_relations'),
  ('location_doors'), ('location_map_regions'), ('quest_beat_edges'),
  ('quest_beat_edge_gates'), ('quest_beat_attachments'), ('quest_consequences'),
  ('quest_refs'),
  -- The rest (#1033 wave 3).
  ('spell_change_windows'), ('npc_relationships'), ('campaign_invites'),
  ('player_favourites');

-- Campaign tables deliberately on no route, each with the reason. Grimoire
-- runs live games, so a table a member's screen reads is live by default; the
-- assertion at the end fails on any campaign-anchored table that is neither
-- routed nor listed here, so leaving one off has to be argued (#1033).
create temporary table live_sync_exempt (name text primary key, reason text not null) on commit drop;
insert into live_sync_exempt (name, reason) values
  ('document_imports',          'server job progress: the sanctioned poll in useDocumentImport stops when extraction settles'),
  ('tile_pack_generation_runs', 'server job progress: the sanctioned poll in useTilePacks stops when no run is in flight'),
  ('tile_pack_generation_jobs', 'server job progress, read through its run'),
  ('dashboard_layouts',         'Customize mode saves on every drag and writes the server''s answer back instead of refetching (useDashboardLayout); an echoed ring would refetch under the drag and could restore an older layout'),
  ('player_read_items',         'one user''s read marks, written on every view: a ring would make every member re-read their own marks whenever anyone opens anything'),
  ('session_proposal_invites',  'deny-all; read by token through the RSVP RPCs, and no screen holds it'),
  ('spell_cast_records',        'a log no screen reads; a cast''s visible effects land on party_members and character_spells, which are live'),
  ('faction_embeddings',        'derived search index, deny-all, read only by definer search'),
  ('item_embeddings',           'derived search index, deny-all, read only by definer search'),
  ('location_embeddings',       'derived search index, deny-all, read only by definer search'),
  ('monster_embeddings',        'derived search index, deny-all, read only by definer search'),
  ('note_embeddings',           'derived search index, deny-all, read only by definer search'),
  ('npc_embeddings',            'derived search index, deny-all, read only by definer search'),
  ('quest_embeddings',          'derived search index, deny-all, read only by definer search');

-- Subscribed on a channel of its own with exact-row handlers, so it rings only
-- for what that channel cannot carry: a delete (#1026).
create temporary table live_sync_own_channel (name text primary key) on commit drop;
insert into live_sync_own_channel (name) values
  ('party_members');

create temporary table live_sync_named_signal (name text primary key, source text not null) on commit drop;
insert into live_sync_named_signal (name, source) values
  ('npcs_player', 'npcs'),
  ('notes_player', 'notes'),
  ('factions_player', 'factions'),
  ('locations_player', 'locations'),
  ('quests_player', 'quests'),
  ('quest_beats_player', 'quest_beats'),
  ('quest_objectives_player', 'quest_objectives');

-- The tables whose statement-level triggers ring the doorbell for an event.
-- By function and event rather than trigger name: a renamed table keeps the
-- trigger it was born with (quest_beat_loot_signal_delete on loot_placements).
-- tgtype bits: 4 insert, 8 delete, 16 update.
create function pg_temp.rings_on(p_table text, p_event_bit int) returns boolean
language sql stable as $$
  select exists (
    select 1 from pg_trigger g
     where g.tgrelid = format('public.%I', p_table)::regclass
       and not g.tgisinternal
       and g.tgfoid in ('public.signal_campaign_change()'::regprocedure,
                        'public.signal_parent_change()'::regprocedure,
                        'public.signal_handout_change()'::regprocedure)
       and (g.tgtype & p_event_bit) <> 0)
$$;

select is(
  (select coalesce(string_agg(t.name, ', ' order by t.name), '')
     from live_sync_subscribed t
    where not exists (
      select 1 from pg_publication_tables p
       where p.pubname = 'supabase_realtime' and p.schemaname = 'public' and p.tablename = t.name)),
  '',
  'every subscribed table is in the supabase_realtime publication');

select is(
  (select coalesce(string_agg(t.name, ', ' order by t.name), '')
     from live_sync_subscribed t
    where not exists (
      select 1 from pg_attribute a
       where a.attrelid = format('public.%I', t.name)::regclass
         and a.attname = 'campaign_id' and not a.attisdropped)),
  '',
  'every subscribed table carries campaign_id for the channel filter');

select is(
  (select coalesce(string_agg(t.name, ', ' order by t.name), '')
     from live_sync_subscribed t
    where not pg_temp.rings_on(t.name, 8)),
  '',
  'every subscribed table rings the doorbell on delete');

select is(
  (select coalesce(string_agg(t.name, ', ' order by t.name), '')
     from live_sync_doorbell t
    where not (pg_temp.rings_on(t.name, 4) and pg_temp.rings_on(t.name, 16) and pg_temp.rings_on(t.name, 8))),
  '',
  'every doorbell table rings on insert, update and delete');

select is(
  (select coalesce(string_agg(t.name, ', ' order by t.name), '')
     from live_sync_own_channel t
    where not pg_temp.rings_on(t.name, 8)),
  '',
  'every table on its own channel rings the doorbell on delete');

-- The UPDATE that moves a character matches the channel filter on its new
-- campaign only, so the campaign it left is rung by a trigger of its own.
select ok(
  exists (
    select 1 from pg_trigger g
     where g.tgrelid = 'public.party_members'::regclass
       and not g.tgisinternal
       and g.tgfoid = 'public.signal_party_member_left_campaign()'::regprocedure
       and (g.tgtype & 16) <> 0),
  'a character leaving a campaign rings the campaign it left');

-- A named signal rings from its source table on insert and update, carrying
-- its name as a trigger argument: the only one for signal_campaign_change
-- (tg_argv[0]), the third for signal_parent_change (after the parent table and
-- its foreign-key column).
create function pg_temp.rings_named(p_table text, p_signal text, p_event_bit int) returns boolean
language sql stable as $$
  select exists (
    select 1 from pg_trigger g
     where g.tgrelid = format('public.%I', p_table)::regclass
       and not g.tgisinternal
       and ((g.tgfoid = 'public.signal_campaign_change()'::regprocedure
             and g.tgnargs = 1
             and split_part(encode(g.tgargs, 'escape'), '\000', 1) = p_signal)
         or (g.tgfoid = 'public.signal_parent_change()'::regprocedure
             and g.tgnargs = 3
             and split_part(encode(g.tgargs, 'escape'), '\000', 3) = p_signal))
       and (g.tgtype & p_event_bit) <> 0)
$$;

select is(
  (select coalesce(string_agg(t.name, ', ' order by t.name), '')
     from live_sync_named_signal t
    where not (pg_temp.rings_named(t.source, t.name, 4) and pg_temp.rings_named(t.source, t.name, 16))),
  '',
  'every named signal rings from its source table on insert and update');

-- The two named signals whose table is not subscribed have no table-name
-- delete signal, so they ring their own name on delete as well.
select is(
  (select coalesce(string_agg(t.name, ', ' order by t.name), '')
     from live_sync_named_signal t
    where t.source in ('quest_beats', 'quest_objectives')
      and not pg_temp.rings_named(t.source, t.name, 8)),
  '',
  'unsubscribed named signals also ring from their source on delete');

-- The reason `npcs_player` exists: a player reads NPCs through the projection
-- only, so no policy may hand them the row (20260928233302).
select is(
  (select coalesce(string_agg(policyname::text, ', ' order by policyname), '')
     from pg_policies
    where schemaname = 'public' and tablename = 'npcs' and cmd in ('SELECT', 'ALL')
      and policyname not in ('Users see own npcs')),
  '',
  'no policy but the owner''s lets anyone select npcs rows');

-- The same reason for `notes_player` and `factions_player`: a player reads a
-- shared note or faction through its projection, which withholds "DM only"
-- blocks, so no policy may hand them the row with the block still in it
-- (20261007092700). Notes are read by their owner; factions by the campaign's DM.
select is(
  (select coalesce(string_agg(tablename || '.' || policyname, ', ' order by tablename, policyname), '')
     from pg_policies
    where schemaname = 'public' and cmd in ('SELECT', 'ALL')
      and ((tablename = 'notes' and not (policyname = 'notes_select'
                                         and qual = '(( SELECT auth.uid() AS uid) = user_id)'))
        or (tablename = 'factions' and not (policyname = 'factions_select'
                                            and qual = 'private.is_campaign_dm(campaign_id)')))),
  '',
  'no policy but the owner''s or the DM''s lets anyone select notes or factions rows');

-- The DM-only runtime reaches clients by name only. If one of these is ever
-- published, player_quest_beats_security.test.sql catches the history table;
-- this catches the other two.
select is(
  (select coalesce(string_agg(p.tablename::text, ', ' order by p.tablename), '')
     from pg_publication_tables p
    where p.pubname = 'supabase_realtime' and p.schemaname = 'public'
      and p.tablename in ('quest_runtime_state', 'quest_threads', 'quest_beat_transitions',
                          'quest_beats', 'quest_objectives')),
  '',
  'the quest runtime, beats and objectives ring the doorbell and are never published as rows');

-- Subscribed on channels of their own (usePartyLive, useEncounterLive), not
-- through SYNC_TABLES, so the checks above do not cover them. Production had
-- both only by hand until 20261005015826.
select is(
  (select count(*)::integer from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('party_members', 'encounter_state')),
  2,
  'party_members and encounter_state are published for their own live channels');

-- One function writes the doorbell (20261008231316), so moving it to another
-- transport (#999 row 4.2, broadcast from the database) is a change in one
-- place. Every route finds its campaigns and calls private.ring_campaigns().
select is(
  (select coalesce(string_agg(n.nspname || '.' || p.proname, ', ' order by p.proname), '')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prosrc ~* 'insert\s+into\s+(public\.)?campaign_sync'),
  'private.ring_campaigns',
  'only private.ring_campaigns writes the doorbell');

-- A campaign being copied (the demo) has nobody listening, and the copy
-- inserts one row per statement, so a ring that does not return early fires
-- once per copied row: 2.2 of the seconds that pushed the copy past its
-- timeout (20261005104317).
select ok(
  (select p.prosrc ~ 'grimoire\.copying_campaign' from pg_proc p
    where p.oid = 'private.ring_campaigns(uuid[], text)'::regprocedure),
  'the ring stays quiet while a campaign is being copied');

-- Live by default (#1033). A table is campaign data when it carries one of the
-- anchors below or reaches one through foreign keys at any depth; such a table
-- rings the doorbell, is published for a channel, or is exempt with a reason.
-- Routed means a trigger on one of the doorbell route functions (a function
-- merely named signal_* is not a route), or publication for a channel.
select is(
  (with recursive anchored(oid) as (
     select c.oid from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and exists (select 1 from pg_attribute a
                     where a.attrelid = c.oid and not a.attisdropped
                       and a.attname in ('campaign_id', 'party_member_id', 'location_id', 'quest_id'))
     union
     select k.conrelid from pg_constraint k join anchored p on p.oid = k.confrelid
      where k.contype = 'f'
   )
   select coalesce(string_agg(c.relname::text, ', ' order by c.relname), '')
     from anchored a
     join pg_class c on c.oid = a.oid
    where c.relname not in (select name from live_sync_exempt)
      and c.relname <> 'campaign_sync'
      and not exists (select 1 from pg_trigger g
                       where g.tgrelid = c.oid and not g.tgisinternal
                         and g.tgfoid in ('public.signal_campaign_change()'::regprocedure,
                                          'public.signal_parent_change()'::regprocedure,
                                          'public.signal_handout_change()'::regprocedure))
      and not exists (select 1 from pg_publication_tables t
                       where t.pubname = 'supabase_realtime' and t.schemaname = 'public'
                         and t.tablename = c.relname)),
  '',
  'every campaign table is on a live route or exempt with a reason');

-- An exemption for a table that is in fact routed, or no longer exists, is stale.
select is(
  (select coalesce(string_agg(e.name, ', ' order by e.name), '')
     from live_sync_exempt e
    where to_regclass('public.' || e.name) is null
       or exists (select 1 from pg_trigger g
                   where g.tgrelid = to_regclass('public.' || e.name) and not g.tgisinternal
                     and g.tgfoid in ('public.signal_campaign_change()'::regprocedure,
                                      'public.signal_parent_change()'::regprocedure,
                                      'public.signal_handout_change()'::regprocedure))),
  '',
  'no exemption names a table that is gone or already rings');

select * from finish();
rollback;
