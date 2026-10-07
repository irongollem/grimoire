begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

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
--               parent quest (signal_quest_child_change).
--
-- Both lists mirror the client registry, and campaignSyncTables.test.ts reads
-- this file and fails when they differ: SYNC_TABLES plus party_inventory for
-- the first, and SIGNAL_KEYS covering both. So a table cannot be added to the
-- client without being checked here.

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
  ('scriptorium_documents'), ('entity_mentions'), ('entity_notes');

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
                        'public.signal_store_item_change()'::regprocedure,
                        'public.signal_ruleset_review_change()'::regprocedure,
                        'public.signal_handout_change()'::regprocedure,
                        'public.signal_quest_child_change()'::regprocedure)
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

-- A named signal rings from its source table on insert and update, carrying
-- its name as the trigger argument (signal_campaign_change reads tg_argv[0]).
create function pg_temp.rings_named(p_table text, p_signal text, p_event_bit int) returns boolean
language sql stable as $$
  select exists (
    select 1 from pg_trigger g
     where g.tgrelid = format('public.%I', p_table)::regclass
       and not g.tgisinternal
       and g.tgfoid in ('public.signal_campaign_change()'::regprocedure,
                        'public.signal_quest_child_change()'::regprocedure)
       and g.tgnargs = 1
       and split_part(encode(g.tgargs, 'escape'), '\000', 1) = p_signal
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

select * from finish();
rollback;
