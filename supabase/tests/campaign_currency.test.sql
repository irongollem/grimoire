-- #934 story 4: a campaign's currency is its own config, purses are coin maps,
-- paying makes change, and removing a coin converts what it held.
--
--   1 Dana (DM)   2 Pat (plays e2)   3 Quinn (plays e3, same table)   4 Sam (stranger)
-- Every refusal sits beside the same caller succeeding at the allowed thing.

begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('93400000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'currency-' || n || '@example.invalid', '',
       '{}'::jsonb, '{}'::jsonb
from generate_series(1, 4) as n;

insert into public.campaigns (id, user_id, name) values
  ('93400000-0000-4000-8000-0000000000c1', '93400000-0000-4000-8000-000000000001', 'Dana''s table');

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, is_dm_managed, ruleset, coins) values
  ('93400000-0000-4000-8000-0000000000e2', '93400000-0000-4000-8000-000000000002',
   '93400000-0000-4000-8000-000000000002', '93400000-0000-4000-8000-0000000000c1', 'Ilse', false, '2014', '{"gp": 41, "sp": 12}'),
  ('93400000-0000-4000-8000-0000000000e3', '93400000-0000-4000-8000-000000000003',
   '93400000-0000-4000-8000-000000000003', '93400000-0000-4000-8000-0000000000c1', 'Dorn', false, '2014', '{"gp": 7}');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('93400000-0000-4000-8000-0000000000c1', '93400000-0000-4000-8000-000000000001', 'dm', 'Dana', null),
  ('93400000-0000-4000-8000-0000000000c1', '93400000-0000-4000-8000-000000000002', 'player', 'Pat', '93400000-0000-4000-8000-0000000000e2'),
  ('93400000-0000-4000-8000-0000000000c1', '93400000-0000-4000-8000-000000000003', 'player', 'Quinn', '93400000-0000-4000-8000-0000000000e3')
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

insert into public.loot_tables (id, user_id, campaign_id, name, entries) values
  ('93400000-0000-4000-8000-0000000000b1', '93400000-0000-4000-8000-000000000001', '93400000-0000-4000-8000-0000000000c1', 'Purse',
   '[{"type": "currency", "drop_chance": 100, "coins": {"ep": 2}}]');

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"93400000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

-- ── Config ──────────────────────────────────────────────────────────────────
select is((select currency->>'default_key' from public.campaigns where id = '93400000-0000-4000-8000-0000000000c1'), 'gp',
  'a new campaign starts with the 5e coins, priced in gold by default');
select throws_ok($$
  update public.campaigns set currency = jsonb_set(currency, '{denominations,1,value}', '1')
   where id = '93400000-0000-4000-8000-0000000000c1'
$$, '23514', null, 'a currency with two coins worth 1 (no single smallest coin) is refused');
select throws_ok($$
  update public.campaigns set currency = jsonb_set(currency, '{default_key}', '"crowns"')
   where id = '93400000-0000-4000-8000-0000000000c1'
$$, '23514', null, 'a default coin the currency does not have is refused, so a bare price always has a coin');
select throws_ok($$
  update public.party_members set coins = '{"gp": -3}' where id = '93400000-0000-4000-8000-0000000000e2'
$$, '23514', null, 'a purse cannot hold a negative count, so a write cannot mint debt');

set local role authenticated;

-- ── Purse writes ────────────────────────────────────────────────────────────
-- adjust_purse / set_purse_coin / apply_downtime_effects run under the caller's
-- RLS, so a write it hides must raise rather than look like it worked.
select pg_temp.as_user(4);
select throws_ok($$ select public.adjust_purse('93400000-0000-4000-8000-0000000000e2', '{"gp": 1}') $$,
  '42501', 'Not authorized', 'a stranger cannot add to Pat''s purse, and is told so');
select pg_temp.as_user(3);
select throws_ok($$ select public.set_purse_coin('93400000-0000-4000-8000-0000000000e2', 'gp', 999) $$,
  '42501', 'Not authorized', 'Quinn cannot set Pat''s gold');
select pg_temp.as_user(2);
select throws_ok($$ select public.adjust_purse('93400000-0000-4000-8000-0000000000e2', '{"crowns": 5}') $$,
  '22023', 'Invalid coins', 'a coin the campaign does not have cannot enter a purse, where it would turn real if the DM added it later');
select throws_ok($$ select public.adjust_purse('93400000-0000-4000-8000-0000000000e2', '{"gp": -42}') $$,
  '22023', 'Not that many coins in the purse', 'taking more gold than Pat holds is refused');
select is(public.adjust_purse('93400000-0000-4000-8000-0000000000e2', '{"gp": 1}'),
  '{"gp": 42, "sp": 12}'::jsonb, 'Pat''s + on gold adds one gold and leaves the silver alone');
select is(public.adjust_purse('93400000-0000-4000-8000-0000000000e2', '{"sp": 1}'),
  '{"gp": 42, "sp": 13}'::jsonb, 'a second click before any refetch keeps the first (bug: whole-map writes undid it)');
select is(public.set_purse_coin('93400000-0000-4000-8000-0000000000e2', 'gp', 41),
  '{"gp": 41, "sp": 13}'::jsonb, 'setting one coin touches only that coin');

-- apply_downtime_effects: one write, all or nothing.
select throws_ok($$ select public.apply_downtime_effects('93400000-0000-4000-8000-0000000000e2', '{"sp": 1}', '{"gp": 500}', 3, '[]') $$,
  '22023', 'Insufficient funds', 'an outcome Pat cannot afford is refused whole');
select is((select coins::text || ' hp ' || current_hp from public.party_members where id = '93400000-0000-4000-8000-0000000000e2'),
  '{"gp": 41, "sp": 13} hp ' || (select current_hp from public.party_members where id = '93400000-0000-4000-8000-0000000000e2'),
  'a refused outcome leaves the gain and the HP unwritten, so applying again cannot charge twice');
select is(public.apply_downtime_effects('93400000-0000-4000-8000-0000000000e2', '{}', '{"gp": 1, "cp": 5}', 3, '[]'),
  '{"gp": 40, "sp": 12, "cp": 5}'::jsonb,
  'Pat pays 1 gp 5 cp with no copper: a silver is broken and 5 cp come back as change');
select is((select current_hp from public.party_members where id = '93400000-0000-4000-8000-0000000000e2'), 3,
  'the HP is written in the same write as the cost');

-- ── Removing a coin converts what it held ──────────────────────────────────
reset role;
update public.party_members set coins = private.coins_add(coins, '{"ep": 3}') where id = '93400000-0000-4000-8000-0000000000e2';
set local role authenticated;
select pg_temp.as_user(2);
update public.campaigns set currency = jsonb_set(currency, '{default_key}', '"pp"')
 where id = '93400000-0000-4000-8000-0000000000c1';
select is((select currency->>'default_key' from public.campaigns where id = '93400000-0000-4000-8000-0000000000c1'), 'gp',
  'a player cannot change the campaign''s currency (and so cannot convert anyone''s purse)');
select pg_temp.as_user(1);
select lives_ok($$
  update public.campaigns
     set currency = jsonb_set(currency, '{denominations}',
           (select jsonb_agg(d order by (d->>'value')::int desc) from jsonb_array_elements(currency->'denominations') d where d->>'key' <> 'ep'))
   where id = '93400000-0000-4000-8000-0000000000c1'
$$, 'the DM drops electrum from the campaign');
select pg_temp.as_user(2);
select is((select coins from public.party_members where id = '93400000-0000-4000-8000-0000000000e2'),
  '{"gp": 41, "sp": 17, "cp": 5}'::jsonb, 'Pat''s 3 ep become 1 gp 5 sp, so no value vanishes with the coin');
select pg_temp.as_user(1);
select is((select entries->0->'coins' from public.loot_tables where id = '93400000-0000-4000-8000-0000000000b1'),
  '{"gp": 1}'::jsonb, 'a loot table''s 2 ep become 1 gp, so it never rolls a coin the campaign no longer has');

-- Renaming a coin removes nothing, so nobody's counts move.
select pg_temp.as_user(1);
update public.campaigns set currency = jsonb_set(currency, '{denominations,0,name}', '"Crowns"')
 where id = '93400000-0000-4000-8000-0000000000c1';
select pg_temp.as_user(2);
select is((select coins from public.party_members where id = '93400000-0000-4000-8000-0000000000e2'),
  '{"gp": 41, "sp": 17, "cp": 5}'::jsonb, 'renaming a coin leaves every purse as it was');

-- Removing the coin worth 1: the rest are recounted in the new smallest coin,
-- and what the removed coin held converts at the rate between the two units.
select pg_temp.as_user(1);
select throws_ok($$
  update public.campaigns
     set currency = jsonb_build_object('default_key', 'gp', 'denominations', jsonb_build_array(
       jsonb_build_object('key', 'pp', 'name', 'Platinum', 'abbr', 'pp', 'value', 100, 'color', '#a855f7', 'makes_change', true),
       jsonb_build_object('key', 'gp', 'name', 'Gold', 'abbr', 'gp', 'value', 10, 'color', '#f59e0b', 'makes_change', true),
       jsonb_build_object('key', 'sp', 'name', 'Silver', 'abbr', 'sp', 'value', 1, 'color', '#9ca3af', 'makes_change', true)))
   where id = '93400000-0000-4000-8000-0000000000c1'
$$, '22023', null, 'dropping copper while a purse holds 5 cp (half a silver) is refused, not rounded into or out of existence');
reset role;
update public.party_members set coins = private.coins_add(coins, '{"cp": 5}') where id = '93400000-0000-4000-8000-0000000000e2';
insert into public.campaign_messages (campaign_id, user_id, message, type, metadata) values
  ('93400000-0000-4000-8000-0000000000c1', '93400000-0000-4000-8000-000000000001', 'chest', 'loot_chest',
   '{"claims_total": 1, "claims": [], "rolled_atoms": [{"atom_id": "a1", "type": "currency", "coins": {"cp": 30}}]}');
set local role authenticated;
select pg_temp.as_user(1);
select lives_ok($$
  update public.campaigns
     set currency = jsonb_build_object('default_key', 'gp', 'denominations', jsonb_build_array(
       jsonb_build_object('key', 'pp', 'name', 'Platinum', 'abbr', 'pp', 'value', 100, 'color', '#a855f7', 'makes_change', true),
       jsonb_build_object('key', 'gp', 'name', 'Gold', 'abbr', 'gp', 'value', 10, 'color', '#f59e0b', 'makes_change', true),
       jsonb_build_object('key', 'sp', 'name', 'Silver', 'abbr', 'sp', 'value', 1, 'color', '#9ca3af', 'makes_change', true)))
   where id = '93400000-0000-4000-8000-0000000000c1'
$$, 'the DM drops copper once every holding is a whole number of silver');
select pg_temp.as_user(2);
select is((select coins from public.party_members where id = '93400000-0000-4000-8000-0000000000e2'),
  '{"gp": 41, "sp": 18}'::jsonb, '10 cp become 1 sp, not 10 sp (bug: converted in the old unit, ten times the value)');
select pg_temp.as_user(1);
select is((select metadata->'rolled_atoms'->0->'coins' from public.campaign_messages where type = 'loot_chest' and campaign_id = '93400000-0000-4000-8000-0000000000c1'),
  '{"sp": 3}'::jsonb, 'an unclaimed chest''s coins convert too, so its claim never credits a removed coin');

select * from finish();
rollback;
