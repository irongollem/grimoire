-- #1102: item quality on party_inventory.
--
--   1 Dana (DM)   2 Pat (plays e2)
-- The column and its check, the pure step-down, craft_apply's fail / success / ruin outcomes, the
-- bench guard refusing a ruined row, and drops (grab and claim) carrying metadata.quality.

begin;

create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('11020000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'item-quality-' || n || '@example.invalid', '',
       '{}'::jsonb, '{}'::jsonb
from generate_series(1, 2) as n;

insert into public.campaigns (id, user_id, name) values
  ('11020000-0000-4000-8000-0000000000c1', '11020000-0000-4000-8000-000000000001', 'Dana''s table'),
  ('11020000-0000-4000-8000-0000000000c2', '11020000-0000-4000-8000-000000000001', 'Dana''s other table');

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, is_dm_managed, ruleset) values
  ('11020000-0000-4000-8000-0000000000e2', '11020000-0000-4000-8000-000000000002',
   '11020000-0000-4000-8000-000000000002', '11020000-0000-4000-8000-0000000000c1', 'Pat''s smith', false, '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('11020000-0000-4000-8000-0000000000c1', '11020000-0000-4000-8000-000000000001', 'dm', 'Dana', null),
  ('11020000-0000-4000-8000-0000000000c1', '11020000-0000-4000-8000-000000000002', 'player', 'Pat', '11020000-0000-4000-8000-0000000000e2')
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

insert into public.items (id, user_id, campaign_id, name, tags) values
  ('11020000-0000-4000-8000-0000000000b1', '11020000-0000-4000-8000-000000000001', '11020000-0000-4000-8000-0000000000c1', 'Iron Ingot', '{metal}'),
  ('11020000-0000-4000-8000-0000000000b2', '11020000-0000-4000-8000-000000000001', '11020000-0000-4000-8000-0000000000c1', 'Leather Strips', '{leather}'),
  ('11020000-0000-4000-8000-0000000000b3', '11020000-0000-4000-8000-000000000001', '11020000-0000-4000-8000-0000000000c1', 'Frost Crystal', '{crystal}'),
  ('11020000-0000-4000-8000-0000000000b4', '11020000-0000-4000-8000-000000000001', '11020000-0000-4000-8000-0000000000c1', 'Silver Coin Pouch', '{}'),
  ('11020000-0000-4000-8000-0000000000b5', '11020000-0000-4000-8000-000000000001', '11020000-0000-4000-8000-0000000000c1', 'Gem', '{}'),
  ('11020000-0000-4000-8000-0000000000b6', '11020000-0000-4000-8000-000000000002', '11020000-0000-4000-8000-0000000000c1', 'Dagger', '{}'),
  ('11020000-0000-4000-8000-0000000000b7', '11020000-0000-4000-8000-000000000001', '11020000-0000-4000-8000-0000000000c1', 'Wire', '{}');

-- Pat's rows. f1 whole-stack fail, f2 partial fail (5 units), f3 a poor row, s1/s2 ingredients,
-- r1 the ruin primary, g1 a ruined row, g2 a poor row for the bench guard. The default row d1 names no quality.
insert into public.party_inventory (id, campaign_id, user_id, item_id, name, quantity, carried_by, location, quality) values
  ('11020000-0000-4000-8000-0000000000f1', '11020000-0000-4000-8000-0000000000c1', '11020000-0000-4000-8000-000000000002', '11020000-0000-4000-8000-0000000000b1', 'Iron Ingot', 3, '11020000-0000-4000-8000-0000000000e2', 'belt', 'standard'),
  ('11020000-0000-4000-8000-0000000000f2', '11020000-0000-4000-8000-0000000000c1', '11020000-0000-4000-8000-000000000002', '11020000-0000-4000-8000-0000000000b2', 'Leather Strips', 5, '11020000-0000-4000-8000-0000000000e2', 'belt', 'standard'),
  ('11020000-0000-4000-8000-0000000000f3', '11020000-0000-4000-8000-0000000000c1', '11020000-0000-4000-8000-000000000002', '11020000-0000-4000-8000-0000000000b3', 'Frost Crystal', 1, '11020000-0000-4000-8000-0000000000e2', 'backpack', 'poor'),
  ('11020000-0000-4000-8000-0000000000a1', '11020000-0000-4000-8000-0000000000c1', '11020000-0000-4000-8000-000000000002', '11020000-0000-4000-8000-0000000000b1', 'Iron Ingot', 2, '11020000-0000-4000-8000-0000000000e2', 'backpack', 'standard'),
  ('11020000-0000-4000-8000-0000000000a2', '11020000-0000-4000-8000-0000000000c1', '11020000-0000-4000-8000-000000000002', '11020000-0000-4000-8000-0000000000b2', 'Leather Strips', 1, '11020000-0000-4000-8000-0000000000e2', 'backpack', 'standard'),
  ('11020000-0000-4000-8000-0000000000a3', '11020000-0000-4000-8000-0000000000c1', '11020000-0000-4000-8000-000000000002', '11020000-0000-4000-8000-0000000000b3', 'Frost Crystal', 1, '11020000-0000-4000-8000-0000000000e2', 'backpack', 'standard'),
  ('11020000-0000-4000-8000-0000000000a4', '11020000-0000-4000-8000-0000000000c1', '11020000-0000-4000-8000-000000000002', '11020000-0000-4000-8000-0000000000b7', 'Wire', 2, '11020000-0000-4000-8000-0000000000e2', 'backpack', 'poor'),
  ('11020000-0000-4000-8000-0000000000a5', '11020000-0000-4000-8000-0000000000c1', '11020000-0000-4000-8000-000000000002', '11020000-0000-4000-8000-0000000000b7', 'Wire', 2, '11020000-0000-4000-8000-0000000000e2', 'backpack', 'ruined');
insert into public.party_inventory (id, campaign_id, user_id, item_id, name, quantity, carried_by)
values ('11020000-0000-4000-8000-0000000000d1', '11020000-0000-4000-8000-0000000000c1', '11020000-0000-4000-8000-000000000002', '11020000-0000-4000-8000-0000000000b4', 'Pouch', 1, '11020000-0000-4000-8000-0000000000e2');
-- Another table's row, which Pat cannot see.
insert into public.party_inventory (id, campaign_id, user_id, item_id, name, quantity, carried_by)
values ('11020000-0000-4000-8000-0000000000f9', '11020000-0000-4000-8000-0000000000c2', '11020000-0000-4000-8000-000000000001', '11020000-0000-4000-8000-0000000000b1', 'Iron Ingot', 3, null);

-- Party-stash rows the DM owns (carried_by null): the player degrades them too.
insert into public.party_inventory (id, campaign_id, user_id, item_id, name, quantity, carried_by, location, quality) values
  ('11020000-0000-4000-8000-000000000051', '11020000-0000-4000-8000-0000000000c1', '11020000-0000-4000-8000-000000000001', '11020000-0000-4000-8000-0000000000b1', 'Stash Ingot', 4, null, 'backpack', 'fine'),
  ('11020000-0000-4000-8000-000000000052', '11020000-0000-4000-8000-0000000000c1', '11020000-0000-4000-8000-000000000001', '11020000-0000-4000-8000-0000000000b1', 'Stash Rope', 2, null, 'backpack', 'standard');

-- Drops: two fine, one standard, one carrying a word that is not a quality, one for claiming.
insert into public.campaign_messages (id, campaign_id, user_id, sender_name, message, type, metadata)
select ('11020000-0000-4000-8000-00000000004' || n)::uuid, '11020000-0000-4000-8000-0000000000c1',
       '11020000-0000-4000-8000-000000000001', 'DM', 'A find', 'item_drop',
       jsonb_build_object('item_id', '11020000-0000-4000-8000-0000000000b5', 'item_name', 'Gem', 'quantity', 1)
       || case when n in (1, 2, 5) then jsonb_build_object('quality', 'fine')
               when n = 4 then jsonb_build_object('quality', 'shiny') else '{}'::jsonb end
from generate_series(1, 5) as n;

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"11020000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

-- ── The column ────────────────────────────────────────────────────────────
-- quality replaced is_ruined (#1102); the one-release mirror is gone (#1113).
select hasnt_column('public', 'party_inventory', 'is_ruined', 'is_ruined is gone: quality is the only answer');
select is((select quality from public.party_inventory where id = '11020000-0000-4000-8000-0000000000d1'),
  'standard', 'a row that names no quality is standard');
select throws_ok(
  $$ insert into public.party_inventory (campaign_id, user_id, name, quality) values ('11020000-0000-4000-8000-0000000000c1', '11020000-0000-4000-8000-000000000002', 'Odd', 'shiny') $$,
  '23514', null, 'a quality that is not one of the five is refused');

-- ── quality_step_down ─────────────────────────────────────────────────────
select is(private.quality_step_down('masterwork'), 'fine', 'masterwork steps down to fine');
select is(private.quality_step_down('fine'), 'standard', 'fine steps down to standard');
select is(private.quality_step_down('standard'), 'poor', 'standard steps down to poor');
select is(private.quality_step_down('poor'), 'ruined', 'poor steps down to ruined');
select is(private.quality_step_down('ruined'), 'ruined', 'ruined stays ruined');

set local role authenticated;
select pg_temp.as_user(2);

-- ── craft_apply: fail ─────────────────────────────────────────────────────
select public.craft_apply('[]'::jsonb, 'fail', '[]'::jsonb, null,
  '{"id":"11020000-0000-4000-8000-0000000000f1","qty":3}'::jsonb);
select results_eq(
  $$ select quality, quantity from public.party_inventory where id = '11020000-0000-4000-8000-0000000000f1' $$,
  $$ values ('poor'::text, 3) $$,
  'a failed craft using the whole 3-unit stack drops that row one step');
select is((select count(*)::int from public.party_inventory where item_id = '11020000-0000-4000-8000-0000000000b1' and carried_by = '11020000-0000-4000-8000-0000000000e2' and location = 'belt'),
  1, 'and splits nothing off');

select public.craft_apply('[]'::jsonb, 'fail', '[]'::jsonb, null,
  '{"id":"11020000-0000-4000-8000-0000000000f2","qty":2}'::jsonb);
select results_eq(
  $$ select quality, quantity from public.party_inventory where id = '11020000-0000-4000-8000-0000000000f2' $$,
  $$ values ('standard'::text, 3) $$,
  'a failed craft using 2 of 5 leaves 3 standard in the original row');
select results_eq(
  $$ select quality, quantity, carried_by, location from public.party_inventory
      where item_id = '11020000-0000-4000-8000-0000000000b2' and id <> '11020000-0000-4000-8000-0000000000f2'
        and campaign_id = '11020000-0000-4000-8000-0000000000c1' and name = 'Leather Strips' and quality = 'poor' $$,
  $$ values ('poor'::text, 2, '11020000-0000-4000-8000-0000000000e2'::uuid, 'belt'::text) $$,
  'and the 2 units move to a new poor row with the same carrier and location');

select public.craft_apply('[]'::jsonb, 'fail', '[]'::jsonb, null,
  '{"id":"11020000-0000-4000-8000-0000000000f3","qty":1}'::jsonb);
select is((select quality from public.party_inventory where id = '11020000-0000-4000-8000-0000000000f3'),
  'ruined', 'a failed craft on a poor row ruins it');

select throws_ok(
  $$ select public.craft_apply('[]'::jsonb, 'fail') $$,
  '22023', 'A failed craft names the primary ingredient it degrades', 'a failure without p_degrade is refused');
select throws_ok(
  $$ select public.craft_apply('[]'::jsonb, 'fail', '[]'::jsonb, null, '{"id":"11020000-0000-4000-8000-0000000000f9","qty":1}'::jsonb) $$,
  'P0002', 'That ingredient is not in your inventory', 'a row of another campaign is not found');

-- ── craft_apply: fail on a DM-owned stash row ─────────────────────────────
select lives_ok(
  $$ select public.craft_apply(null, 'fail', '[]'::jsonb, null, '{"id":"11020000-0000-4000-8000-000000000051","qty":2}'::jsonb) $$,
  'a player can split units off a stash row the DM owns');
select results_eq(
  $$ select quality, quantity from public.party_inventory where id = '11020000-0000-4000-8000-000000000051' $$,
  $$ values ('fine'::text, 2) $$,
  'the original stash row keeps 2 fine');
select is((select user_id from public.party_inventory where name = 'Stash Ingot' and quality = 'standard' and quantity = 2 and carried_by is null),
  '11020000-0000-4000-8000-000000000002'::uuid, 'the split row is the player''s own, a standard row of 2');
select lives_ok(
  $$ select public.craft_apply(null, 'fail', '[]'::jsonb, null, '{"id":"11020000-0000-4000-8000-000000000052","qty":2}'::jsonb) $$,
  'a player can degrade a whole DM-owned stash row');

-- ── craft_apply: success ──────────────────────────────────────────────────
select public.craft_apply(
  '[{"id":"11020000-0000-4000-8000-0000000000a1","qty":2},{"id":"11020000-0000-4000-8000-0000000000a2","qty":1}]'::jsonb,
  'success',
  '[{"campaign_id":"11020000-0000-4000-8000-0000000000c1","item_id":"11020000-0000-4000-8000-0000000000b6","name":"Fine Dagger","quantity":1,"carried_by":"11020000-0000-4000-8000-0000000000e2","quality":"fine"},
    {"campaign_id":"11020000-0000-4000-8000-0000000000c1","item_id":"11020000-0000-4000-8000-0000000000b6","name":"Masterwork Dagger","quantity":1,"carried_by":"11020000-0000-4000-8000-0000000000e2","quality":"masterwork"},
    {"campaign_id":"11020000-0000-4000-8000-0000000000c1","item_id":"11020000-0000-4000-8000-0000000000b6","name":"Plain Dagger","quantity":1,"carried_by":"11020000-0000-4000-8000-0000000000e2"}]'::jsonb);
select is((select quality from public.party_inventory where name = 'Fine Dagger'), 'fine', 'a success with quality fine makes a fine row');
select is((select quality from public.party_inventory where name = 'Masterwork Dagger'), 'standard', 'a craft never makes masterwork');
select is((select quality from public.party_inventory where name = 'Plain Dagger'), 'standard', 'a success naming no quality makes a standard row');
select is((select count(*)::int from public.party_inventory where id in ('11020000-0000-4000-8000-0000000000a1', '11020000-0000-4000-8000-0000000000a2')),
  0, 'the ingredients were consumed');

-- ── craft_apply: ruin ─────────────────────────────────────────────────────
select public.craft_apply(
  '[{"id":"11020000-0000-4000-8000-0000000000a3","qty":1}]'::jsonb, 'ruin', '[]'::jsonb,
  '{"campaign_id":"11020000-0000-4000-8000-0000000000c1","item_id":"11020000-0000-4000-8000-0000000000b3","name":"Frost Crystal","carried_by":"11020000-0000-4000-8000-0000000000e2"}'::jsonb);
select is((select count(*)::int from public.party_inventory where campaign_id = '11020000-0000-4000-8000-0000000000c1' and notes = 'Ruined during a failed crafting attempt.' and quality = 'ruined'),
  1, 'a ruin leaves exactly one ruined row');
select is((select count(*)::int from public.party_inventory where id = '11020000-0000-4000-8000-0000000000a3'),
  0, 'and the primary was consumed');

-- ── The bench guard ───────────────────────────────────────────────────────
select throws_ok(
  $$ select public.craft_experiment('11020000-0000-4000-8000-0000000000e2', 'smithing', array['11020000-0000-4000-8000-0000000000a5'::uuid]) $$,
  'CX001', 'Those items cannot be laid out', 'a ruined row cannot be laid out on the bench');
select lives_ok(
  $$ select public.craft_experiment('11020000-0000-4000-8000-0000000000e2', 'smithing', array['11020000-0000-4000-8000-0000000000a4'::uuid]) $$,
  'a poor row can');

-- ── Drops ─────────────────────────────────────────────────────────────────
select public.grab_item_drop('11020000-0000-4000-8000-000000000041', -1, null, 'Pat', '11020000-0000-4000-8000-0000000000e2');
select results_eq(
  $$ select quality, quantity from public.party_inventory where item_id = '11020000-0000-4000-8000-0000000000b5' $$,
  $$ values ('fine'::text, 1) $$,
  'grabbing a fine drop inserts a fine row');
select public.grab_item_drop('11020000-0000-4000-8000-000000000042', -1, null, 'Pat', '11020000-0000-4000-8000-0000000000e2');
select results_eq(
  $$ select quality, quantity from public.party_inventory where item_id = '11020000-0000-4000-8000-0000000000b5' $$,
  $$ values ('fine'::text, 2) $$,
  'a second fine drop merges into the fine stack');
select public.grab_item_drop('11020000-0000-4000-8000-000000000043', -1, null, 'Pat', '11020000-0000-4000-8000-0000000000e2');
select results_eq(
  $$ select quality, quantity from public.party_inventory where item_id = '11020000-0000-4000-8000-0000000000b5' order by quality $$,
  $$ values ('fine'::text, 2), ('standard'::text, 1) $$,
  'a standard drop of the same item does not merge into the fine stack');
select public.grab_item_drop('11020000-0000-4000-8000-000000000044', -1, null, 'Pat', '11020000-0000-4000-8000-0000000000e2');
select results_eq(
  $$ select quality, quantity from public.party_inventory where item_id = '11020000-0000-4000-8000-0000000000b5' order by quality $$,
  $$ values ('fine'::text, 2), ('standard'::text, 2) $$,
  'a drop naming an unknown quality reads as standard and merges into the standard stack');

select public.claim_item_drop('11020000-0000-4000-8000-000000000045', 'Pat', '11020000-0000-4000-8000-0000000000e2', null);
select is((select count(*)::int from public.party_inventory where item_id = '11020000-0000-4000-8000-0000000000b5' and quality = 'fine' and quantity = 1),
  1, 'a claimed fine drop carries its quality onto the new row');

select * from finish();
rollback;
