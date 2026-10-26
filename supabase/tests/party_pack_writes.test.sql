-- #1112: who may write a pack, and the two ways things leave one.
--
--   1 Dana (DM)   2 Pat (plays e2)   3 Quinn (plays e3, same table)   4 Sam (stranger)
--   e9 is a character at another table.
-- Every refusal sits beside the same caller succeeding at the allowed thing, so a pass
-- proves the rule rather than a broken fixture.

begin;

create extension if not exists pgtap with schema extensions;
select plan(47);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('11120000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'party-packs-' || n || '@example.invalid', '',
       '{}'::jsonb, '{}'::jsonb
from generate_series(1, 4) as n;

insert into public.campaigns (id, user_id, name) values
  ('11120000-0000-4000-8000-0000000000c1', '11120000-0000-4000-8000-000000000001', 'Dana''s table'),
  ('11120000-0000-4000-8000-0000000000c2', '11120000-0000-4000-8000-000000000001', 'Dana''s other table');

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, is_dm_managed, ruleset, gp, sp) values
  ('11120000-0000-4000-8000-0000000000e2', '11120000-0000-4000-8000-000000000002',
   '11120000-0000-4000-8000-000000000002', '11120000-0000-4000-8000-0000000000c1', 'Ilse', false, '2014', 41, 12),
  ('11120000-0000-4000-8000-0000000000e3', '11120000-0000-4000-8000-000000000003',
   '11120000-0000-4000-8000-000000000003', '11120000-0000-4000-8000-0000000000c1', 'Dorn', false, '2014', 7, 0),
  ('11120000-0000-4000-8000-0000000000e9', '11120000-0000-4000-8000-000000000001',
   null, '11120000-0000-4000-8000-0000000000c2', 'Elsewhere', true, '2014', 0, 0);

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('11120000-0000-4000-8000-0000000000c1', '11120000-0000-4000-8000-000000000001', 'dm', 'Dana', null),
  ('11120000-0000-4000-8000-0000000000c1', '11120000-0000-4000-8000-000000000002', 'player', 'Pat', '11120000-0000-4000-8000-0000000000e2'),
  ('11120000-0000-4000-8000-0000000000c1', '11120000-0000-4000-8000-000000000003', 'player', 'Quinn', '11120000-0000-4000-8000-0000000000e3'),
  -- Pat also sits at the other table, unseated, so a row could be carried across.
  ('11120000-0000-4000-8000-0000000000c2', '11120000-0000-4000-8000-000000000002', 'player', 'Pat', null)
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

-- a1 stash torch · a2 Pat's rope · a3 Pat's 3 potions · a4 Quinn's dagger · a9 Pat's worn,
-- attuned amulet · a5 Pat's bag holding a6, and a7 (a pouch) holding a8 · b1-b4 spares for
-- the plain-write checks.
insert into public.party_inventory (id, campaign_id, user_id, name, quantity, carried_by, location, is_container, container_id, is_equipped, is_attuned, slot) values
  ('11120000-0000-4000-8000-0000000000a1', '11120000-0000-4000-8000-0000000000c1', '11120000-0000-4000-8000-000000000001', 'Torch', 3, null, 'backpack', false, null, false, false, null),
  ('11120000-0000-4000-8000-0000000000a2', '11120000-0000-4000-8000-0000000000c1', '11120000-0000-4000-8000-000000000002', 'Rope', 1, '11120000-0000-4000-8000-0000000000e2', 'backpack', false, null, false, false, null),
  ('11120000-0000-4000-8000-0000000000a3', '11120000-0000-4000-8000-0000000000c1', '11120000-0000-4000-8000-000000000002', 'Potion of Healing', 3, '11120000-0000-4000-8000-0000000000e2', 'belt', false, null, false, false, null),
  ('11120000-0000-4000-8000-0000000000a4', '11120000-0000-4000-8000-0000000000c1', '11120000-0000-4000-8000-000000000003', 'Dagger', 1, '11120000-0000-4000-8000-0000000000e3', 'backpack', false, null, false, false, null),
  ('11120000-0000-4000-8000-0000000000a9', '11120000-0000-4000-8000-0000000000c1', '11120000-0000-4000-8000-000000000002', 'Amulet of Health', 1, '11120000-0000-4000-8000-0000000000e2', 'equipped', false, null, true, true, 'neck'),
  ('11120000-0000-4000-8000-0000000000a5', '11120000-0000-4000-8000-0000000000c1', '11120000-0000-4000-8000-000000000002', 'Bag of Holding', 1, '11120000-0000-4000-8000-0000000000e2', 'backpack', true, null, false, false, null),
  ('11120000-0000-4000-8000-0000000000b1', '11120000-0000-4000-8000-0000000000c1', '11120000-0000-4000-8000-000000000002', 'Chalk', 1, '11120000-0000-4000-8000-0000000000e2', 'backpack', false, null, false, false, null),
  ('11120000-0000-4000-8000-0000000000b2', '11120000-0000-4000-8000-0000000000c1', '11120000-0000-4000-8000-000000000003', 'Mess kit', 1, '11120000-0000-4000-8000-0000000000e3', 'backpack', false, null, false, false, null),
  ('11120000-0000-4000-8000-0000000000b3', '11120000-0000-4000-8000-0000000000c1', '11120000-0000-4000-8000-000000000003', 'Bedroll', 1, '11120000-0000-4000-8000-0000000000e3', 'backpack', false, null, false, false, null);
insert into public.party_inventory (id, campaign_id, user_id, name, quantity, carried_by, location, is_container, container_id) values
  ('11120000-0000-4000-8000-0000000000a6', '11120000-0000-4000-8000-0000000000c1', '11120000-0000-4000-8000-000000000002', 'Holy water', 2, '11120000-0000-4000-8000-0000000000e2', 'container', false, '11120000-0000-4000-8000-0000000000a5'),
  ('11120000-0000-4000-8000-0000000000a7', '11120000-0000-4000-8000-0000000000c1', '11120000-0000-4000-8000-000000000002', 'Pouch', 1, '11120000-0000-4000-8000-0000000000e2', 'container', true, '11120000-0000-4000-8000-0000000000a5'),
  -- Pat's satchel, with a row of QUINN's pointed into it by Quinn: giving the satchel
  -- must not carry Quinn's row away with it.
  ('11120000-0000-4000-8000-0000000000c5', '11120000-0000-4000-8000-0000000000c1', '11120000-0000-4000-8000-000000000002', 'Satchel', 1, '11120000-0000-4000-8000-0000000000e2', 'backpack', true, null);
insert into public.party_inventory (id, campaign_id, user_id, name, quantity, carried_by, location, is_container, container_id) values
  ('11120000-0000-4000-8000-0000000000b4', '11120000-0000-4000-8000-0000000000c1', '11120000-0000-4000-8000-000000000003', 'Spoon', 1, '11120000-0000-4000-8000-0000000000e3', 'container', false, '11120000-0000-4000-8000-0000000000c5');
insert into public.party_inventory (id, campaign_id, user_id, name, quantity, carried_by, location, is_container, container_id) values
  ('11120000-0000-4000-8000-0000000000a8', '11120000-0000-4000-8000-0000000000c1', '11120000-0000-4000-8000-000000000002', 'Ferry Bell', 1, '11120000-0000-4000-8000-0000000000e2', 'container', false, '11120000-0000-4000-8000-0000000000a7');

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"11120000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

-- Rows a plain statement touched: RLS hides a refused row instead of raising, so a
-- refused update or delete is "0 rows", and the allowed one beside it is "1 row".
create function pg_temp.touched(p_sql text) returns int language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

create function pg_temp.row_of(p_id text) returns public.party_inventory language sql as $$
  select * from public.party_inventory where id = ('11120000-0000-4000-8000-0000000000' || p_id)::uuid;
$$;

set local role authenticated;

-- ── Plain writes: own pack and the stash, never another pack ────────────────
select pg_temp.as_user(2);
select is(pg_temp.touched($$ update public.party_inventory set notes = 'coiled' where id = '11120000-0000-4000-8000-0000000000b1' $$),
  1, 'Pat changes a row in Pat''s own pack');
select is(pg_temp.touched($$ update public.party_inventory set quantity = 2 where id = '11120000-0000-4000-8000-0000000000a1' $$),
  1, 'Pat changes a row in the stash');
select is(pg_temp.touched($$ update public.party_inventory set notes = 'mine now' where id = '11120000-0000-4000-8000-0000000000b2' $$),
  0, 'Pat cannot change a row in Quinn''s pack');
select is(pg_temp.touched($$ delete from public.party_inventory where id = '11120000-0000-4000-8000-0000000000b2' $$),
  0, 'Pat cannot delete a row from Quinn''s pack');
select is((select count(*)::int from public.party_inventory where id = '11120000-0000-4000-8000-0000000000b2'),
  1, 'Pat still reads Quinn''s pack');
select is(pg_temp.touched($$ update public.party_inventory set carried_by = null where id = '11120000-0000-4000-8000-0000000000b1' $$),
  1, 'Pat puts a row of Pat''s into the stash');
select is(pg_temp.touched($$ update public.party_inventory set carried_by = '11120000-0000-4000-8000-0000000000e2' where id = '11120000-0000-4000-8000-0000000000b1' $$),
  1, 'Pat takes it back out of the stash');
select throws_ok(
  $$ update public.party_inventory set carried_by = '11120000-0000-4000-8000-0000000000e3' where id = '11120000-0000-4000-8000-0000000000b1' $$,
  '42501', null, 'a plain update cannot push a row into Quinn''s pack');
select lives_ok(
  $$ insert into public.party_inventory (campaign_id, user_id, name, carried_by) values
     ('11120000-0000-4000-8000-0000000000c1', '11120000-0000-4000-8000-000000000002', 'Lantern', '11120000-0000-4000-8000-0000000000e2') $$,
  'Pat adds to Pat''s own pack');
select throws_ok(
  $$ insert into public.party_inventory (campaign_id, user_id, name, carried_by) values
     ('11120000-0000-4000-8000-0000000000c1', '11120000-0000-4000-8000-000000000002', 'Lantern', '11120000-0000-4000-8000-0000000000e3') $$,
  '42501', null, 'Pat cannot add straight into Quinn''s pack');

select pg_temp.as_user(4);
select is(pg_temp.touched($$ update public.party_inventory set notes = 'x' where id = '11120000-0000-4000-8000-0000000000a1' $$),
  0, 'a stranger cannot change the stash');

select pg_temp.as_user(1);
select is(pg_temp.touched($$ update public.party_inventory set notes = 'checked' where id = '11120000-0000-4000-8000-0000000000b3' $$),
  1, 'the DM changes a row in Quinn''s pack');
select is(pg_temp.touched($$ update public.party_inventory set carried_by = '11120000-0000-4000-8000-0000000000e2' where id = '11120000-0000-4000-8000-0000000000b3' $$),
  1, 'the DM moves a row from Quinn''s pack to Pat''s');

-- ── give_inventory_item ──────────────────────────────────────────────────────
select pg_temp.as_user(4);
select throws_ok(
  $$ select public.give_inventory_item('11120000-0000-4000-8000-0000000000a2', '11120000-0000-4000-8000-0000000000e3') $$,
  '42501', 'Not authorized', 'a stranger cannot give Pat''s rope away');

select pg_temp.as_user(2);
select throws_ok(
  $$ select public.give_inventory_item('11120000-0000-4000-8000-0000000000a4', '11120000-0000-4000-8000-0000000000e2') $$,
  '42501', 'Not authorized', 'Pat cannot take Quinn''s dagger by giving it to Pat');
select throws_ok(
  $$ select public.give_inventory_item('11120000-0000-4000-8000-0000000000a2', '11120000-0000-4000-8000-0000000000e9') $$,
  '22023', 'That character is not in this campaign', 'Pat cannot give to a character at another table');
select throws_ok(
  $$ select public.give_inventory_item('11120000-0000-4000-8000-0000000000a3', '11120000-0000-4000-8000-0000000000e3', 4) $$,
  '22023', null, 'Pat cannot give more potions than the stack holds');

select is(public.give_inventory_item('11120000-0000-4000-8000-0000000000a2', '11120000-0000-4000-8000-0000000000e3'),
  '11120000-0000-4000-8000-0000000000a2'::uuid, 'Pat gives the rope to Quinn');
select is((pg_temp.row_of('a2')).carried_by, '11120000-0000-4000-8000-0000000000e3'::uuid, 'the rope is in Quinn''s pack');
select is((pg_temp.row_of('a2')).location, 'backpack', 'it lands in the backpack');

select isnt(public.give_inventory_item('11120000-0000-4000-8000-0000000000a3', '11120000-0000-4000-8000-0000000000e3', 2),
  '11120000-0000-4000-8000-0000000000a3'::uuid, 'Pat gives two of three potions as a new row');
select is((pg_temp.row_of('a3')).quantity, 1, 'one potion stays with Pat');
select is((select quantity from public.party_inventory where name = 'Potion of Healing' and carried_by = '11120000-0000-4000-8000-0000000000e3'),
  2, 'two potions are in Quinn''s pack');

select lives_ok($$ select public.give_inventory_item('11120000-0000-4000-8000-0000000000a9', '11120000-0000-4000-8000-0000000000e3') $$,
  'Pat gives the worn amulet to Quinn');
select is((pg_temp.row_of('a9')).is_attuned, false, 'the amulet arrives unattuned');
select is((pg_temp.row_of('a9')).is_equipped, false, 'the amulet arrives unequipped');

select throws_ok(
  $$ select public.give_inventory_item('11120000-0000-4000-8000-0000000000a5', '11120000-0000-4000-8000-0000000000e3', 0) $$,
  '22023', null, 'a give of none is refused');
select lives_ok($$ select public.give_inventory_item('11120000-0000-4000-8000-0000000000a5', '11120000-0000-4000-8000-0000000000e3') $$,
  'Pat gives the bag to Quinn');
select is((select count(*)::int from public.party_inventory
            where id in ('11120000-0000-4000-8000-0000000000a5', '11120000-0000-4000-8000-0000000000a6',
                         '11120000-0000-4000-8000-0000000000a7', '11120000-0000-4000-8000-0000000000a8')
              and carried_by = '11120000-0000-4000-8000-0000000000e3'),
  4, 'everything in the bag, the pouch inside it too, went with it');
select is((pg_temp.row_of('a8')).container_id, '11120000-0000-4000-8000-0000000000a7'::uuid, 'the bell is still in the pouch');

select lives_ok($$ select public.give_inventory_item('11120000-0000-4000-8000-0000000000c5', null) $$,
  'Pat puts the satchel in the stash');
select is((pg_temp.row_of('c5')).carried_by, null::uuid, 'the satchel is in the stash');
select is((pg_temp.row_of('b4')).carried_by, '11120000-0000-4000-8000-0000000000e3'::uuid,
  'Quinn''s spoon, pointed into the satchel by Quinn, stays Quinn''s');
select lives_ok($$ select public.give_inventory_item('11120000-0000-4000-8000-0000000000a1', '11120000-0000-4000-8000-0000000000e3', 1) $$,
  'Pat hands one torch from the stash to Quinn');
select throws_ok(
  $$ update public.party_inventory set campaign_id = '11120000-0000-4000-8000-0000000000c2' where id = '11120000-0000-4000-8000-0000000000a1' $$,
  '42501', 'A pack row stays in its campaign', 'a stash row cannot be carried to another table');

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$ select public.give_inventory_item('11120000-0000-4000-8000-0000000000b1', null) $$,
  '42501', 'Not authorized', 'nobody signed in gives nothing');
select throws_ok(
  $$ select public.give_coins('11120000-0000-4000-8000-0000000000e2', '11120000-0000-4000-8000-0000000000e3', 0, 1) $$,
  '42501', 'Not authorized', 'nobody signed in moves no coins');
select pg_temp.as_user(2);

-- ── give_coins ───────────────────────────────────────────────────────────────
select pg_temp.as_user(3);
select throws_ok(
  $$ select public.give_coins('11120000-0000-4000-8000-0000000000e2', '11120000-0000-4000-8000-0000000000e3', 0, 5) $$,
  '42501', 'Not authorized', 'Quinn cannot take coins out of Pat''s purse');
select pg_temp.as_user(4);
select throws_ok(
  $$ select public.give_coins('11120000-0000-4000-8000-0000000000e2', '11120000-0000-4000-8000-0000000000e3', 0, 5) $$,
  '42501', 'Not authorized', 'a stranger cannot move Pat''s coins');

select pg_temp.as_user(2);
select throws_ok(
  $$ select public.give_coins('11120000-0000-4000-8000-0000000000e2', '11120000-0000-4000-8000-0000000000e3', 0, 100) $$,
  '22023', 'Not that many coins in the purse', 'Pat cannot give more gold than Pat has');
select throws_ok(
  $$ select public.give_coins('11120000-0000-4000-8000-0000000000e2', '11120000-0000-4000-8000-0000000000e3') $$,
  '22023', 'Give at least one coin', 'a give of nothing is refused');
select throws_ok(
  $$ select public.give_coins('11120000-0000-4000-8000-0000000000e2', '11120000-0000-4000-8000-0000000000e3', 0, -5) $$,
  '22023', 'Give at least one coin', 'a negative give cannot pull coins the other way');
select throws_ok(
  $$ select public.give_coins('11120000-0000-4000-8000-0000000000e2', '11120000-0000-4000-8000-0000000000e9', 0, 5) $$,
  '22023', 'That character is not in this campaign', 'Pat cannot pay a character at another table');

select lives_ok($$ select public.give_coins('11120000-0000-4000-8000-0000000000e2', '11120000-0000-4000-8000-0000000000e3', 0, 5, 0, 2) $$,
  'Pat gives Quinn 5 gp and 2 sp');
select is((select gp from public.party_members where id = '11120000-0000-4000-8000-0000000000e3'), 12, 'Quinn has 12 gp');

select pg_temp.as_user(1);
select lives_ok($$ select public.give_coins('11120000-0000-4000-8000-0000000000e3', '11120000-0000-4000-8000-0000000000e2', 0, 1) $$,
  'the DM moves a gold piece from Quinn back to Pat');
select is((select gp::text || '/' || sp::text from public.party_members where id = '11120000-0000-4000-8000-0000000000e2'),
  '37/10', 'Pat ends with 37 gp and 10 sp');

select * from finish();
rollback;
