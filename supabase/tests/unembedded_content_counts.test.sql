begin;

create extension if not exists pgtap with schema extensions;
select plan(19);

-- Regression + acceptance cover for get_unembedded_content_counts()
-- (20260907120124, #841). The RPC answers "what in this campaign has no
-- vector yet", per entity kind, so the transfer-ownership embedding offer
-- knows what to show a new DM. Three things must hold: the counts (and the
-- ids behind them) are right, a caller who is not this campaign's DM is
-- refused -- including a DM of some *other* campaign, which is the case a
-- lazy "is this user a DM anywhere" guard would wrongly let through -- and
-- the count is not vacuously always-zero: embedding a previously-missing row
-- must move it out of the set.

-- ── Fixture helpers ─────────────────────────────────────────────────────────
-- A stand-in 1536-dim vector. Nothing here does nearest-neighbour search, so
-- one constant vector is enough -- this only has to satisfy `vector(1536) not
-- null`, same helper shape as monster_retrieval.test.sql.
create function pg_temp.vec() returns vector
language sql immutable as $$
  select ('[1' || repeat(',0', 1535) || ']')::vector(1536);
$$;

select has_function(
  'public', 'get_unembedded_content_counts', array['uuid'],
  'the unembedded-content RPC exists with the documented signature'
);

-- ── Fixtures ──────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('84100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue841-dm-a@example.invalid',  '', '{}'::jsonb, '{}'::jsonb),
  ('84100000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue841-dm-b@example.invalid',  '', '{}'::jsonb, '{}'::jsonb),
  ('84100000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue841-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

-- Two campaigns, two separate DMs, so the "another DM sees nothing of this
-- campaign" case is a genuine second DM rather than a co-DM of the same one.
insert into public.campaigns (id, user_id, name) values
  ('84100000-0000-4000-8000-000000000010', '84100000-0000-4000-8000-000000000001', 'T841 Campaign A'),
  ('84100000-0000-4000-8000-000000000011', '84100000-0000-4000-8000-000000000002', 'T841 Campaign B');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('84100000-0000-4000-8000-000000000010', '84100000-0000-4000-8000-000000000001', 'dm', 'DM A'),
  ('84100000-0000-4000-8000-000000000011', '84100000-0000-4000-8000-000000000002', 'dm', 'DM B')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- Campaign A: one of each kind embedded, one of each kind not -- except
-- npcs, which get two missing rows so the "drop by one, not to zero" step
-- later actually proves something.
insert into public.items (id, user_id, campaign_id, name) values
  ('84100000-0000-4000-8000-000000000020', '84100000-0000-4000-8000-000000000001', '84100000-0000-4000-8000-000000000010', 'T841 embedded item'),
  ('84100000-0000-4000-8000-000000000021', '84100000-0000-4000-8000-000000000001', '84100000-0000-4000-8000-000000000010', 'T841 missing item');

insert into public.npcs (id, user_id, campaign_id, name) values
  ('84100000-0000-4000-8000-000000000030', '84100000-0000-4000-8000-000000000001', '84100000-0000-4000-8000-000000000010', 'T841 missing npc 1'),
  ('84100000-0000-4000-8000-000000000031', '84100000-0000-4000-8000-000000000001', '84100000-0000-4000-8000-000000000010', 'T841 missing npc 2');

insert into public.factions (id, user_id, campaign_id, name) values
  ('84100000-0000-4000-8000-000000000040', '84100000-0000-4000-8000-000000000001', '84100000-0000-4000-8000-000000000010', 'T841 missing faction');

insert into public.locations (id, user_id, campaign_id, name) values
  ('84100000-0000-4000-8000-000000000050', '84100000-0000-4000-8000-000000000001', '84100000-0000-4000-8000-000000000010', 'T841 embedded location');

insert into public.notes (id, user_id, campaign_id, title) values
  ('84100000-0000-4000-8000-000000000060', '84100000-0000-4000-8000-000000000001', '84100000-0000-4000-8000-000000000010', 'T841 missing note');

insert into public.monsters (id, user_id, campaign_id, name) values
  ('84100000-0000-4000-8000-000000000070', '84100000-0000-4000-8000-000000000001', '84100000-0000-4000-8000-000000000010', 'T841 missing monster');

-- Campaign B: everything embedded, so it is the control for the scoping
-- assertion below -- if the RPC ever leaked campaign A's missing rows into a
-- campaign B query, this is what would catch it.
insert into public.items (id, user_id, campaign_id, name) values
  ('84100000-0000-4000-8000-000000000022', '84100000-0000-4000-8000-000000000002', '84100000-0000-4000-8000-000000000011', 'T841 B item');
insert into public.npcs (id, user_id, campaign_id, name) values
  ('84100000-0000-4000-8000-000000000032', '84100000-0000-4000-8000-000000000002', '84100000-0000-4000-8000-000000000011', 'T841 B npc');
insert into public.factions (id, user_id, campaign_id, name) values
  ('84100000-0000-4000-8000-000000000041', '84100000-0000-4000-8000-000000000002', '84100000-0000-4000-8000-000000000011', 'T841 B faction');
insert into public.locations (id, user_id, campaign_id, name) values
  ('84100000-0000-4000-8000-000000000051', '84100000-0000-4000-8000-000000000002', '84100000-0000-4000-8000-000000000011', 'T841 B location');
insert into public.notes (id, user_id, campaign_id, title) values
  ('84100000-0000-4000-8000-000000000061', '84100000-0000-4000-8000-000000000002', '84100000-0000-4000-8000-000000000011', 'T841 B note');
insert into public.monsters (id, user_id, campaign_id, name) values
  ('84100000-0000-4000-8000-000000000071', '84100000-0000-4000-8000-000000000002', '84100000-0000-4000-8000-000000000011', 'T841 B monster');

insert into public.item_embeddings (item_id, embedding, embedding_model, source_hash) values
  ('84100000-0000-4000-8000-000000000020', pg_temp.vec(), 'test-model-841', 'h'),
  ('84100000-0000-4000-8000-000000000022', pg_temp.vec(), 'test-model-841', 'h');
insert into public.npc_embeddings (npc_id, embedding, embedding_model, source_hash) values
  ('84100000-0000-4000-8000-000000000032', pg_temp.vec(), 'test-model-841', 'h');
insert into public.faction_embeddings (faction_id, embedding, embedding_model, source_hash) values
  ('84100000-0000-4000-8000-000000000041', pg_temp.vec(), 'test-model-841', 'h');
insert into public.location_embeddings (location_id, embedding, embedding_model, source_hash) values
  ('84100000-0000-4000-8000-000000000050', pg_temp.vec(), 'test-model-841', 'h'),
  ('84100000-0000-4000-8000-000000000051', pg_temp.vec(), 'test-model-841', 'h');
insert into public.note_embeddings (note_id, embedding, embedding_model, source_hash) values
  ('84100000-0000-4000-8000-000000000061', pg_temp.vec(), 'test-model-841', 'h');
insert into public.monster_embeddings (monster_id, embedding, embedding_model, source_hash) values
  ('84100000-0000-4000-8000-000000000071', pg_temp.vec(), 'test-model-841', 'h');

-- ── Authorization ─────────────────────────────────────────────────────────

set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"84100000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.get_unembedded_content_counts('84100000-0000-4000-8000-000000000010') $$,
  'Not authorized',
  'a user with no membership in campaign A is refused');

select set_config('request.jwt.claims',
  '{"sub":"84100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.get_unembedded_content_counts('84100000-0000-4000-8000-000000000010') $$,
  'Not authorized',
  'the DM of campaign B is refused for campaign A -- DM status does not transfer across campaigns');

-- ── Counts + ids, campaign A ────────────────────────────────────────────────

select set_config('request.jwt.claims',
  '{"sub":"84100000-0000-4000-8000-000000000001","role":"authenticated"}', true);

create temporary table _counts_a as
  select * from public.get_unembedded_content_counts('84100000-0000-4000-8000-000000000010');

select is((select count(*)::integer from _counts_a), 6, 'one row per entity kind, campaign A');

select is((select missing from _counts_a where kind = 'item'), 1, 'campaign A: one item missing an embedding');
select ok(
  (select ids from _counts_a where kind = 'item') @> array['84100000-0000-4000-8000-000000000021']::uuid[]
  and (select ids from _counts_a where kind = 'item') <@ array['84100000-0000-4000-8000-000000000021']::uuid[],
  'campaign A: the missing item id is exactly the un-embedded one, not the embedded one');

select is((select missing from _counts_a where kind = 'npc'), 2, 'campaign A: both npcs are missing an embedding');
select ok(
  (select ids from _counts_a where kind = 'npc') @> array['84100000-0000-4000-8000-000000000030','84100000-0000-4000-8000-000000000031']::uuid[]
  and (select ids from _counts_a where kind = 'npc') <@ array['84100000-0000-4000-8000-000000000030','84100000-0000-4000-8000-000000000031']::uuid[],
  'campaign A: the missing npc ids are exactly the two created');

select is((select missing from _counts_a where kind = 'faction'), 1, 'campaign A: one faction missing an embedding');
select ok(
  (select ids from _counts_a where kind = 'faction') @> array['84100000-0000-4000-8000-000000000040']::uuid[]
  and (select ids from _counts_a where kind = 'faction') <@ array['84100000-0000-4000-8000-000000000040']::uuid[],
  'campaign A: the missing faction id is correct');

select is((select missing from _counts_a where kind = 'location'), 0, 'campaign A: the one location is already embedded');
select is((select ids from _counts_a where kind = 'location'), '{}'::uuid[], 'campaign A: no missing location ids');

select is((select missing from _counts_a where kind = 'note'), 1, 'campaign A: one note missing an embedding');
select ok(
  (select ids from _counts_a where kind = 'note') @> array['84100000-0000-4000-8000-000000000060']::uuid[]
  and (select ids from _counts_a where kind = 'note') <@ array['84100000-0000-4000-8000-000000000060']::uuid[],
  'campaign A: the missing note id is correct');

select is((select missing from _counts_a where kind = 'monster'), 1, 'campaign A: one monster missing an embedding');
select ok(
  (select ids from _counts_a where kind = 'monster') @> array['84100000-0000-4000-8000-000000000070']::uuid[]
  and (select ids from _counts_a where kind = 'monster') <@ array['84100000-0000-4000-8000-000000000070']::uuid[],
  'campaign A: the missing monster id is correct');

-- ── Scoping, campaign B ──────────────────────────────────────────────────
-- Every row in campaign B is embedded. If the join were not scoped by
-- campaign_id -- or scoped to the wrong campaign -- campaign A's six missing
-- rows would show up here.

select set_config('request.jwt.claims',
  '{"sub":"84100000-0000-4000-8000-000000000002","role":"authenticated"}', true);

create temporary table _counts_b as
  select * from public.get_unembedded_content_counts('84100000-0000-4000-8000-000000000011');

select is(
  (select sum(missing)::integer from _counts_b), 0,
  'campaign B has nothing missing -- campaign A''s unembedded rows do not leak across the campaign boundary');

-- ── Not vacuous: embedding a row moves it out of the set ────────────────────
-- npc_embeddings carries RLS enabled with zero policies (intentional -- see
-- 20260803000004), so this insert has to run as the unrestricted role, same
-- as the fixture inserts above did before `set local role authenticated`.

reset role;
insert into public.npc_embeddings (npc_id, embedding, embedding_model, source_hash)
values ('84100000-0000-4000-8000-000000000030', pg_temp.vec(), 'test-model-841', 'h');
set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"84100000-0000-4000-8000-000000000001","role":"authenticated"}', true);

create temporary table _counts_a2 as
  select * from public.get_unembedded_content_counts('84100000-0000-4000-8000-000000000010');

select is(
  (select missing from _counts_a2 where kind = 'npc'), 1,
  'embedding one of the two missing npcs drops the count from 2 to 1, not to 0 -- the query is not vacuously counting all npcs');
select ok(
  (select ids from _counts_a2 where kind = 'npc') @> array['84100000-0000-4000-8000-000000000031']::uuid[]
  and (select ids from _counts_a2 where kind = 'npc') <@ array['84100000-0000-4000-8000-000000000031']::uuid[],
  'the remaining missing npc id is the one that was never embedded, not the one just embedded');

reset role;

select * from finish();
rollback;
