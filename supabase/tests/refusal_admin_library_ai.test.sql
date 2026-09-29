-- #936: refusal + positive-control coverage for admin, library and AI RPCs.
--
--   1 Dana (DM of c1, admin: no)    2 Eve (DM of c2, someone else's table)
--   3 Pat (player in c1, no share)  4 Sam (stranger)  5 Root (app admin)
-- Every refusal is paired with the rightful caller succeeding in the same
-- fixture, so a pass proves authorization rather than a broken setup.

begin;

create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('93660000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'refusal-ala-' || n || '@example.invalid', '',
       case when n = 5 then '{"role":"admin"}'::jsonb else '{}'::jsonb end, '{}'::jsonb
from generate_series(1, 5) as n;

insert into public.campaigns (id, user_id, name) values
  ('93660000-0000-4000-8000-0000000000c1', '93660000-0000-4000-8000-000000000001', 'Dana''s table'),
  ('93660000-0000-4000-8000-0000000000c2', '93660000-0000-4000-8000-000000000002', 'Eve''s table');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('93660000-0000-4000-8000-0000000000c1', '93660000-0000-4000-8000-000000000001', 'dm', 'Dana'),
  ('93660000-0000-4000-8000-0000000000c2', '93660000-0000-4000-8000-000000000002', 'dm', 'Eve'),
  ('93660000-0000-4000-8000-0000000000c1', '93660000-0000-4000-8000-000000000003', 'player', 'Pat')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- Dana's ready AI job, plus her item and monster and a craftable recipe.
insert into public.ai_generation_jobs (id, user_id, campaign_id, generator_type, status, result_json)
values ('93660000-0000-4000-8000-0000000000a1', '93660000-0000-4000-8000-000000000001',
        '93660000-0000-4000-8000-0000000000c1', 'npc', 'ready', '{}'::jsonb);

insert into public.items (id, user_id, campaign_id, name) values
  ('93660000-0000-4000-8000-0000000000b1', '93660000-0000-4000-8000-000000000001',
   '93660000-0000-4000-8000-0000000000c1', 'Zorblax Lantern');
insert into public.monsters (id, user_id, campaign_id, name) values
  ('93660000-0000-4000-8000-0000000000b2', '93660000-0000-4000-8000-000000000001',
   '93660000-0000-4000-8000-0000000000c1', 'Zorblax Wisp');

insert into public.crafting_recipes (id, user_id, campaign_id)
values ('93660000-0000-4000-8000-0000000000d1', '93660000-0000-4000-8000-000000000001',
        '93660000-0000-4000-8000-0000000000c1');
insert into public.crafting_recipe_outputs (recipe_id, item_id)
values ('93660000-0000-4000-8000-0000000000d1', '93660000-0000-4000-8000-0000000000b1');

create function pg_temp.as_user(p_n int, p_admin boolean default false) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p_admin
      then format('{"sub":"93660000-0000-4000-8000-00000000000%s","role":"authenticated","app_metadata":{"role":"admin"}}', p_n)
      else format('{"sub":"93660000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n) end, true);
$$;

set local role authenticated;

-- ── acknowledge_ai_generation_job ────────────────────────────────────────────
-- Eve is a legitimate user, but names Dana's job.
select pg_temp.as_user(2);
select throws_ok(
  $$ select public.acknowledge_ai_generation_job('93660000-0000-4000-8000-0000000000a1') $$,
  'P0001', 'AI generation job not found or is not ready',
  'another user cannot acknowledge my AI generation job');
select pg_temp.as_user(4);
select throws_ok(
  $$ select public.acknowledge_ai_generation_job('93660000-0000-4000-8000-0000000000a1') $$,
  'P0001', 'AI generation job not found or is not ready',
  'a stranger cannot acknowledge my AI generation job');
select pg_temp.as_user(1);
select lives_ok(
  $$ select public.acknowledge_ai_generation_job('93660000-0000-4000-8000-0000000000a1') $$,
  'the job owner can acknowledge it');

-- ── get_prompt_screening_hints (admin only) ──────────────────────────────────
select pg_temp.as_user(1);
select throws_ok($$ select public.get_prompt_screening_hints(30, 0.05, null) $$,
  'P0001', 'Admin only', 'a DM cannot read the prompt screening hints');
select pg_temp.as_user(4);
select throws_ok($$ select public.get_prompt_screening_hints(30, 0.05, null) $$,
  'P0001', 'Admin only', 'a stranger cannot read the prompt screening hints');
select pg_temp.as_user(5, true);
select isnt_empty($$ select public.get_prompt_screening_hints(30, 0.05, null) $$,
  'the admin can read the prompt screening hints');

-- ── sync_library_*_art (admin only) ──────────────────────────────────────────
select pg_temp.as_user(1);
select throws_ok($$ select public.sync_library_item_art() $$,
  'P0001', 'Unauthorized', 'a DM cannot sync library item art');
select throws_ok($$ select public.sync_library_monster_art() $$,
  'P0001', 'Unauthorized', 'a DM cannot sync library monster art');
select throws_ok($$ select public.sync_library_spell_art() $$,
  'P0001', 'Unauthorized', 'a DM cannot sync library spell art');
select pg_temp.as_user(4);
select throws_ok($$ select public.sync_library_item_art() $$,
  'P0001', 'Unauthorized', 'a stranger cannot sync library item art');
select throws_ok($$ select public.sync_library_monster_art() $$,
  'P0001', 'Unauthorized', 'a stranger cannot sync library monster art');
select throws_ok($$ select public.sync_library_spell_art() $$,
  'P0001', 'Unauthorized', 'a stranger cannot sync library spell art');
select pg_temp.as_user(5, true);
select lives_ok($$ select public.sync_library_item_art() $$, 'the admin can sync library item art');
select lives_ok($$ select public.sync_library_monster_art() $$, 'the admin can sync library monster art');
select lives_ok($$ select public.sync_library_spell_art() $$, 'the admin can sync library spell art');

-- ── resolve_item_references / resolve_monster_references (campaign DM) ───────
-- Eve is a DM, but of another table: naming Dana's campaign answers nothing,
-- even though the caller's own scope is all `auth.uid()` rows.
select pg_temp.as_user(2);
select is_empty(
  $$ select * from public.resolve_item_references('93660000-0000-4000-8000-0000000000c1', array['Zorblax Lantern']) $$,
  'a DM of another campaign resolves no items against my campaign');
select is_empty(
  $$ select * from public.resolve_monster_references('93660000-0000-4000-8000-0000000000c1', array['Zorblax Wisp']) $$,
  'a DM of another campaign resolves no monsters against my campaign');
select pg_temp.as_user(3);
select is_empty(
  $$ select * from public.resolve_item_references('93660000-0000-4000-8000-0000000000c1', array['Zorblax Lantern']) $$,
  'a player resolves no items');
select is_empty(
  $$ select * from public.resolve_monster_references('93660000-0000-4000-8000-0000000000c1', array['Zorblax Wisp']) $$,
  'a player resolves no monsters');
select pg_temp.as_user(4);
select is_empty(
  $$ select * from public.resolve_item_references('93660000-0000-4000-8000-0000000000c1', array['Zorblax Lantern']) $$,
  'a stranger resolves no items');
select is_empty(
  $$ select * from public.resolve_monster_references('93660000-0000-4000-8000-0000000000c1', array['Zorblax Wisp']) $$,
  'a stranger resolves no monsters');
select pg_temp.as_user(1);
select is(
  (select item_id from public.resolve_item_references('93660000-0000-4000-8000-0000000000c1', array['Zorblax Lantern'])),
  '93660000-0000-4000-8000-0000000000b1'::uuid,
  'the campaign DM resolves their own item');
select is(
  (select monster_id from public.resolve_monster_references('93660000-0000-4000-8000-0000000000c1', array['Zorblax Wisp'])),
  '93660000-0000-4000-8000-0000000000b2'::uuid,
  'the campaign DM resolves their own monster');

-- ── get_craftable_output_items ───────────────────────────────────────────────
select pg_temp.as_user(2);
select is_empty(
  $$ select * from public.get_craftable_output_items('93660000-0000-4000-8000-0000000000c1') $$,
  'a DM of another campaign sees no craftable outputs of mine');
select pg_temp.as_user(4);
select is_empty(
  $$ select * from public.get_craftable_output_items('93660000-0000-4000-8000-0000000000c1') $$,
  'a stranger sees no craftable outputs');
select pg_temp.as_user(3);
select is_empty(
  $$ select * from public.get_craftable_output_items('93660000-0000-4000-8000-0000000000c1') $$,
  'a member the recipe was not shared with sees no craftable outputs');
select pg_temp.as_user(1);
select is(
  (select count(*) from public.get_craftable_output_items('93660000-0000-4000-8000-0000000000c1')),
  1::bigint, 'the recipe owner sees the craftable output');

select * from finish();
rollback;
