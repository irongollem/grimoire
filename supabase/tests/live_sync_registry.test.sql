begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

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
--               read NPCs only through get_player_visible_npcs.
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
  ('ruleset_reviews'), ('campaign_rules'), ('downtime_grants'), ('downtime_draws'),
  ('downtime_outcomes'), ('downtime_deck_backs'), ('minis'), ('class_option_texts'),
  ('item_entries'), ('party_inventory');

create temporary table live_sync_doorbell (name text primary key) on commit drop;
insert into live_sync_doorbell (name) values
  ('store_items'), ('quest_runtime_state'), ('quest_threads'),
  ('quest_beat_transitions'), ('campaign_session_state');

create temporary table live_sync_named_signal (name text primary key, source text not null) on commit drop;
insert into live_sync_named_signal (name, source) values
  ('npcs_player', 'npcs');

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
                        'public.signal_store_item_change()'::regprocedure)
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
       and g.tgfoid = 'public.signal_campaign_change()'::regprocedure
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

-- The reason `npcs_player` exists: a player reads NPCs through the projection
-- only, so no policy may hand them the row (20260928233302).
select is(
  (select coalesce(string_agg(policyname::text, ', ' order by policyname), '')
     from pg_policies
    where schemaname = 'public' and tablename = 'npcs' and cmd in ('SELECT', 'ALL')
      and policyname not in ('Users see own npcs')),
  '',
  'no policy but the owner''s lets anyone select npcs rows');

-- The DM-only runtime reaches clients by name only. If one of these is ever
-- published, player_quest_beats_security.test.sql catches the history table;
-- this catches the other two.
select is(
  (select coalesce(string_agg(p.tablename::text, ', ' order by p.tablename), '')
     from pg_publication_tables p
    where p.pubname = 'supabase_realtime' and p.schemaname = 'public'
      and p.tablename in ('quest_runtime_state', 'quest_threads', 'quest_beat_transitions')),
  '',
  'the quest runtime rings the doorbell and is never published as rows');

select * from finish();
rollback;
