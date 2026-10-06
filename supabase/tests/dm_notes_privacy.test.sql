begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

-- #983. A DM note is the DM writing to their future self and never reaches a
-- player (src/lib/dmNotes/registry.ts). It lives either in a notes column on a
-- table only its owner can read, or in the DM's own private entity_notes row.

-- ── Where a DM note may be a column ──────────────────────────────────────────

-- Players could select these two tables' rows, so their notes moved out.
select hasnt_column('public', 'deities', 'dm_notes', 'a deity''s DM note is not a column players can select');
select hasnt_column('public', 'species', 'notes', 'a species'' DM note is not a column players can select');
select hasnt_column('public', 'hall_of_heroes', 'notes', 'a hero''s DM note is not a column every account can read');

-- The registry's column stores. Any read policy beyond the owner's would hand
-- the note to whoever it admits; players reach these rows only through
-- projections that null the column (player_projections.test.sql).
select is(
  (select coalesce(string_agg(tablename || '.' || policyname, ', ' order by tablename, policyname), '')
     from pg_policies
    where schemaname = 'public'
      and tablename in ('npcs', 'monsters', 'items', 'traps', 'puzzle_rooms', 'dungeon_features',
                        'loot_tables', 'roll_tables', 'locations')
      and cmd in ('SELECT', 'ALL')
      and qual <> '(( SELECT auth.uid() AS uid) = user_id)'),
  '',
  'every table holding a DM-notes column is readable by its owner only');

-- A private note's rows must never travel as a payload; the table rings the
-- doorbell instead (live_sync_registry.test.sql).
select is_empty(
  $$ select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'entity_notes' $$,
  'entity_notes is never published');

-- ── Fixture ──────────────────────────────────────────────────────────────────
-- 1 runs campaign 10 with 4 as a second DM and 2 as a player. 3 is a stranger
-- to it who runs campaign 11.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('98300000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue983-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('98300000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue983-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('98300000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue983-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('98300000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue983-codm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('98300000-0000-4000-8000-000000000010', '98300000-0000-4000-8000-000000000001', 'Scratchpad campaign'),
  ('98300000-0000-4000-8000-000000000011', '98300000-0000-4000-8000-000000000003', 'Someone else''s table');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('98300000-0000-4000-8000-000000000010', '98300000-0000-4000-8000-000000000001', 'dm', 'DM'),
  ('98300000-0000-4000-8000-000000000010', '98300000-0000-4000-8000-000000000002', 'player', 'Player'),
  ('98300000-0000-4000-8000-000000000010', '98300000-0000-4000-8000-000000000004', 'dm', 'Co-DM'),
  ('98300000-0000-4000-8000-000000000011', '98300000-0000-4000-8000-000000000003', 'dm', 'Other DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- Written as the owners, before the role switch: the co-DM's own touch on the
-- same entity (the transfer below must not collide with it), the co-DM's own
-- private note on it (which the outgoing DM's must join, not sit beside), and
-- the player's own private note (which the transfer must leave alone).
insert into public.dm_note_touches (user_id, campaign_id, entity_type, entity_id, entity_label) values
  ('98300000-0000-4000-8000-000000000004', '98300000-0000-4000-8000-000000000010', 'faction', 'f-1', 'The Zhentarim');
insert into public.entity_notes (user_id, campaign_id, entity_type, entity_id, content, is_private, shared_with_dm) values
  ('98300000-0000-4000-8000-000000000004', '98300000-0000-4000-8000-000000000010', 'faction', 'f-1',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The co-DM saw it coming."}]}]}', true, false),
  ('98300000-0000-4000-8000-000000000002', '98300000-0000-4000-8000-000000000010', 'npc', 'n-1',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Durnan is lying."}]}]}', true, false);

-- ── The DM writes their note and their session log ──────────────────────────

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '98300000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$ insert into public.dm_note_touches (user_id, campaign_id, entity_type, entity_id, entity_label)
     values ('98300000-0000-4000-8000-000000000001', '98300000-0000-4000-8000-000000000010', 'faction', 'f-1', 'The Zhentarim') $$,
  'the DM records a touch in their campaign');

select lives_ok(
  $$ insert into public.entity_notes (user_id, campaign_id, entity_type, entity_id, content, is_private, shared_with_dm)
     values ('98300000-0000-4000-8000-000000000001', '98300000-0000-4000-8000-000000000010', 'faction', 'f-1',
             '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"They owe Durnan."}]}]}', true, false) $$,
  'the DM writes a private note in their campaign');

-- The positive control for every "cannot read" below: the rows are there.
select is(
  (select count(*)::int from public.entity_notes where entity_id = 'f-1')
    + (select count(*)::int from public.dm_note_touches where user_id = '98300000-0000-4000-8000-000000000001'),
  2,
  'the DM reads back their own note and touch');

select throws_ok(
  $$ insert into public.dm_note_touches (user_id, campaign_id, entity_type, entity_id, entity_label)
     values ('98300000-0000-4000-8000-000000000004', '98300000-0000-4000-8000-000000000010', 'npc', 'n-9', 'Forged') $$,
  '42501', null,
  'a DM cannot write a touch in another user''s name');

-- ── A player ─────────────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '98300000-0000-4000-8000-000000000002', true);

-- A member is inside every campaign-scoped read path already, which is what
-- makes them the case worth testing rather than a stranger.
select throws_ok(
  $$ insert into public.dm_note_touches (user_id, campaign_id, entity_type, entity_id, entity_label)
     values ('98300000-0000-4000-8000-000000000002', '98300000-0000-4000-8000-000000000010', 'npc', 'n-1', 'Durnan') $$,
  '42501', null,
  'a player cannot write the session log of a campaign they only play in');

select is_empty(
  $$ select 1 from public.dm_note_touches where campaign_id = '98300000-0000-4000-8000-000000000010' $$,
  'a player cannot read the DM''s session log');

select is_empty(
  $$ select 1 from public.entity_notes where entity_id = 'f-1' $$,
  'a player cannot read the DM''s private note');

-- ── A stranger ───────────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '98300000-0000-4000-8000-000000000003', true);

select is_empty(
  $$ select 1 from public.dm_note_touches where campaign_id = '98300000-0000-4000-8000-000000000010' $$,
  'a stranger reads no session log of the campaign');

select throws_ok(
  $$ insert into public.dm_note_touches (user_id, campaign_id, entity_type, entity_id, entity_label)
     values ('98300000-0000-4000-8000-000000000003', '98300000-0000-4000-8000-000000000010', 'npc', 'n-1', 'Durnan') $$,
  '42501', null,
  'a DM of another campaign cannot write this campaign''s session log');

-- With entity_notes ringing the campaign doorbell, a note filed under a
-- campaign its author is not in would ring that campaign's members.
select throws_ok(
  $$ insert into public.entity_notes (user_id, campaign_id, entity_type, entity_id, content, is_private, shared_with_dm)
     values ('98300000-0000-4000-8000-000000000003', '98300000-0000-4000-8000-000000000010', 'npc', 'n-1', 'x', true, false) $$,
  '42501', null,
  'a stranger cannot file a note under a campaign they are not in');

select lives_ok(
  $$ insert into public.entity_notes (user_id, campaign_id, entity_type, entity_id, content, is_private, shared_with_dm)
     values ('98300000-0000-4000-8000-000000000003', '98300000-0000-4000-8000-000000000011', 'npc', 'n-2', 'x', true, false) $$,
  'and still files one under their own');

select throws_ok(
  $$ update public.entity_notes set campaign_id = '98300000-0000-4000-8000-000000000010' where entity_id = 'n-2' $$,
  '42501', null,
  'nor moves one into a campaign they are not in');

-- ── A transferred campaign takes its DM notes along ─────────────────────────
-- To the co-DM, who already touched the same faction: the handover must not
-- trip over the session log's one-row-per-entity key.

select set_config('request.jwt.claim.sub', '98300000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ select public.transfer_campaign_ownership('98300000-0000-4000-8000-000000000010', '98300000-0000-4000-8000-000000000004', false, 'promote') $$,
  'the campaign transfers to a co-DM who touched the same entity');

reset role;

select is(
  (select array_agg(user_id) from public.entity_notes where entity_id = 'f-1'),
  array['98300000-0000-4000-8000-000000000004'::uuid],
  'the outgoing DM''s private note belongs to the new DM, as a notes column travels with its row');

-- The new DM already kept a note on the faction. The scratchpad shows one, so
-- a second would hide whichever it did not pick.
select is(
  (select content::jsonb -> 'content' from public.entity_notes where entity_id = 'f-1'),
  '[{"type":"paragraph","content":[{"type":"text","text":"The co-DM saw it coming."}]},
    {"type":"paragraph","content":[{"type":"text","text":"They owe Durnan."}]}]'::jsonb,
  'and joins the note the new DM already kept there, theirs first');

select is(
  (select array_agg(user_id) from public.dm_note_touches where entity_id = 'f-1'),
  array['98300000-0000-4000-8000-000000000004'::uuid],
  'and the session log keeps one row per entity, the new DM''s');

select is(
  (select user_id from public.entity_notes where entity_id = 'n-1'),
  '98300000-0000-4000-8000-000000000002'::uuid,
  'a player''s own private note stays the player''s');

-- ── Joining notes never fails on what the editors stored ────────────────────
-- An empty note was stored as '', and `''::jsonb` raises, which in the
-- migration's fold would have stranded every migration behind it.

select is(private.note_blocks(''), '[]'::jsonb, 'an empty note has no blocks');
select is(private.note_blocks('   '), '[]'::jsonb, 'nor does a blank one');
select is(
  private.note_blocks('Durnan knows.'),
  '[{"type":"paragraph","content":[{"type":"text","text":"Durnan knows."}]}]'::jsonb,
  'plain text from before Tiptap is one paragraph');
select is(
  private.note_blocks('{not json'),
  '[{"type":"paragraph","content":[{"type":"text","text":"{not json"}]}]'::jsonb,
  'and so is text that only looks like a document');

select * from finish();
rollback;
