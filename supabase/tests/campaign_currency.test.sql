-- #934 story 4: a campaign's currency is its own config, purses are coin maps,
-- paying makes change, and removing a coin converts what it held.
--
--   1 Dana (DM)   2 Pat (plays e2)   3 Quinn (plays e3, same table)   4 Sam (stranger)
-- Every refusal sits beside the same caller succeeding at the allowed thing.

begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

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

-- ── spend_coins ─────────────────────────────────────────────────────────────
select pg_temp.as_user(4);
select throws_ok($$ select public.spend_coins('93400000-0000-4000-8000-0000000000e2', '{"gp": 1}') $$,
  '42501', 'Not authorized', 'a stranger cannot spend Pat''s coins');
select pg_temp.as_user(3);
select throws_ok($$ select public.spend_coins('93400000-0000-4000-8000-0000000000e2', '{"gp": 1}') $$,
  '42501', 'Not authorized', 'Quinn cannot spend Pat''s coins');
select pg_temp.as_user(2);
select throws_ok($$ select public.spend_coins('93400000-0000-4000-8000-0000000000e2', '{"gp": 500}') $$,
  '22023', 'Insufficient funds', 'Pat cannot spend more than the purse is worth');
select throws_ok($$ select public.spend_coins('93400000-0000-4000-8000-0000000000e2', '{"crowns": 1}') $$,
  '22023', 'Invalid price', 'a price in a coin the campaign does not have is refused, not read as free');
select is(public.spend_coins('93400000-0000-4000-8000-0000000000e2', '{"gp": 1, "cp": 5}'),
  '{"gp": 40, "sp": 11, "cp": 5}'::jsonb,
  'Pat pays 1 gp 5 cp with no copper: a silver is broken and 5 cp come back as change');
select is((select coins from public.party_members where id = '93400000-0000-4000-8000-0000000000e2'),
  '{"gp": 40, "sp": 11, "cp": 5}'::jsonb, 'the purse holds what spend_coins returned');

-- ── Removing a coin converts what it held ──────────────────────────────────
reset role;
update public.party_members set coins = private.coins_add(coins, '{"ep": 3}') where id = '93400000-0000-4000-8000-0000000000e2';
set local role authenticated;
select pg_temp.as_user(1);
select lives_ok($$
  update public.campaigns
     set currency = jsonb_set(currency, '{denominations}',
           (select jsonb_agg(d order by (d->>'value')::int desc) from jsonb_array_elements(currency->'denominations') d where d->>'key' <> 'ep'))
   where id = '93400000-0000-4000-8000-0000000000c1'
$$, 'the DM drops electrum from the campaign');
select pg_temp.as_user(2);
select is((select coins from public.party_members where id = '93400000-0000-4000-8000-0000000000e2'),
  '{"gp": 41, "sp": 16, "cp": 5}'::jsonb, 'Pat''s 3 ep become 1 gp 5 sp, so no value vanishes with the coin');
select pg_temp.as_user(1);
select is((select entries->0->'coins' from public.loot_tables where id = '93400000-0000-4000-8000-0000000000b1'),
  '{"gp": 1}'::jsonb, 'a loot table''s 2 ep become 1 gp, so it never rolls a coin the campaign no longer has');

-- Renaming a coin removes nothing, so nobody's counts move.
select pg_temp.as_user(1);
update public.campaigns set currency = jsonb_set(currency, '{denominations,0,name}', '"Crowns"')
 where id = '93400000-0000-4000-8000-0000000000c1';
select pg_temp.as_user(2);
select is((select coins from public.party_members where id = '93400000-0000-4000-8000-0000000000e2'),
  '{"gp": 41, "sp": 16, "cp": 5}'::jsonb, 'renaming a coin leaves every purse as it was');

select * from finish();
rollback;
