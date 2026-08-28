begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

-- Campaign-scoped DM content may only be written by that campaign's DM.
--
-- Before 20260828201935, 51 policies across 27 tables tested nothing but
-- `(select auth.uid()) = user_id` in their `with check`. `campaign_id` was never
-- consulted, so any authenticated user could stamp a row with their own user_id
-- and someone else's campaign_id. The reachable exploit was the World Bundle
-- importer: `ImportBundleModal.vue` is mounted at `App.vue:12` with no role check
-- and opens from the OS `.grimoire` file handler anywhere in the app, including
-- `/play/*`, batch-inserting into locations/npcs/npc_relationships/monsters/items
-- at `campaign_id = activeCampaignId` — for a player, the DM's campaign.
--
-- The injected rows were not merely litter: `npcs_player_select` keys on
-- `player_visible_to`, a column the inserting user controls, and
-- `calendar_events_player_select` on `player_visible`/`event_type = 'session'`.
-- So a player could publish content to the rest of the party.

-- Fixtures: a DM owning one campaign, a player in it, and an outsider who is a
-- member of nothing.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('77710000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writeb-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('77710000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writeb-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('77710000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writeb-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name) values
  ('77710000-0000-4000-8000-000000000010', '77710000-0000-4000-8000-000000000001', 'Boundary campaign');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('77710000-0000-4000-8000-000000000010', '77710000-0000-4000-8000-000000000001', 'dm', 'DM'),
  ('77710000-0000-4000-8000-000000000010', '77710000-0000-4000-8000-000000000002', 'player', 'Player')
on conflict (campaign_id, user_id) do update set role = excluded.role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── The injection, from a player who is genuinely in the campaign ────────────
select set_config('request.jwt.claim.sub', '77710000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$ insert into public.npcs (user_id, campaign_id, name)
     values ('77710000-0000-4000-8000-000000000002', '77710000-0000-4000-8000-000000000010', 'Injected NPC') $$,
  '42501', null,
  'a player cannot insert an NPC into the DM''s campaign');

select throws_ok(
  $$ insert into public.calendar_events (user_id, campaign_id, title, harptos_year, event_type)
     values ('77710000-0000-4000-8000-000000000002', '77710000-0000-4000-8000-000000000010', 'Fake session', 1495, 'session') $$,
  '42501', null,
  'a player cannot inject a session event onto the party calendar');

select throws_ok(
  $$ insert into public.items (user_id, campaign_id, name)
     values ('77710000-0000-4000-8000-000000000002', '77710000-0000-4000-8000-000000000010', 'Injected item') $$,
  '42501', null,
  'a player cannot insert an item into the DM''s campaign');

select throws_ok(
  $$ insert into public.locations (user_id, campaign_id, name)
     values ('77710000-0000-4000-8000-000000000002', '77710000-0000-4000-8000-000000000010', 'Injected location') $$,
  '42501', null,
  'a player cannot insert a location into the DM''s campaign — the World Bundle path');

select throws_ok(
  $$ insert into public.monsters (user_id, campaign_id, name)
     values ('77710000-0000-4000-8000-000000000002', '77710000-0000-4000-8000-000000000010', 'Injected monster') $$,
  '42501', null,
  'a player cannot insert a monster into the DM''s campaign');

-- ── An outsider who is a member of nothing ──────────────────────────────────
select set_config('request.jwt.claim.sub', '77710000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$ insert into public.npcs (user_id, campaign_id, name)
     values ('77710000-0000-4000-8000-000000000003', '77710000-0000-4000-8000-000000000010', 'Stranger NPC') $$,
  '42501', null,
  'a non-member cannot insert into a campaign by knowing its uuid');

-- ── The personal library still works for everyone ────────────────────────────
-- Load-bearing: the player-reachable writes on /codex (ClassList "Duplicate",
-- ArchetypeList "Load example") all pass campaign_id: null. If the null arm of the
-- predicate ever goes away, those break.
select set_config('request.jwt.claim.sub', '77710000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$ insert into public.npcs (id, user_id, campaign_id, name)
     values ('77710000-0000-4000-8000-000000000100', '77710000-0000-4000-8000-000000000002', null, 'My own NPC') $$,
  'a player may still create an unscoped personal-library row');

select lives_ok(
  $$ insert into public.custom_classes (id, user_id, campaign_id, class_name)
     values ('77710000-0000-4000-8000-000000000101', '77710000-0000-4000-8000-000000000002', null, 'Forked Fighter') $$,
  'a player may still fork an SRD class into their own library (/codex Duplicate)');

-- ...but may not then staple it to a campaign they do not run.
select throws_ok(
  $$ update public.npcs set campaign_id = '77710000-0000-4000-8000-000000000010'
     where id = '77710000-0000-4000-8000-000000000100' $$,
  '42501', null,
  'a player cannot move a personal row into the DM''s campaign');

-- ── The DM is unaffected ─────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '77710000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ insert into public.npcs (id, user_id, campaign_id, name)
     values ('77710000-0000-4000-8000-000000000110', '77710000-0000-4000-8000-000000000001', '77710000-0000-4000-8000-000000000010', 'Legitimate NPC') $$,
  'the DM still writes into their own campaign');

select lives_ok(
  $$ update public.npcs set name = 'Renamed NPC'
     where id = '77710000-0000-4000-8000-000000000110' $$,
  'the DM still updates their own campaign content');

-- ── Structural guard ─────────────────────────────────────────────────────────
-- An outcome test only covers the tables someone remembered to write a case for.
-- This asserts the *shape* across all 27 swept tables, so a future migration that
-- recreates one of these policies without the campaign gate fails here rather
-- than shipping. Any `with check` on these tables must consult campaign_id —
-- directly, or through private.is_campaign_dm(campaign_id).
select is(
  (select coalesce(string_agg(format('%s.%s', tablename, policyname), ', ' order by tablename, policyname), '')
     from pg_policies
    where schemaname = 'public'
      and with_check is not null
      and with_check not like '%campaign_id%'
      and tablename in (
        'calendar_events','class_feature_options','class_features','crafting_recipes',
        'custom_classes','custom_subclasses','encounters','factions','items','locations',
        'loot_tables','monsters','npc_inventory','npc_relationships','npc_sets','npcs',
        'puzzle_rooms','quest_trigger_scheduled','quests','roll_tables','rules',
        'soundboard_pages','soundboard_playlists','sounds','species','spells','traps')),
  '',
  'every write policy on a campaign-scoped content table consults campaign_id');

select * from finish();
rollback;
