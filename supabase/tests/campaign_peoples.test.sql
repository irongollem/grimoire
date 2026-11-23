-- #1255 item 30: the peoples of a world are rows that link a species or a bestiary creature to a share.
--
--   1 Dana (DM)   2 Pat (a player at Dana's table)   3 Sam (a stranger, DM of another table)   4 Cole (Dana's co-DM)
-- Every refusal sits beside the same caller, or the DM, succeeding at the allowed thing.

begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('12553000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'peoples-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 4) as n;

insert into public.campaigns (id, user_id, name, game_system) values
  ('12553000-0000-4000-8000-0000000000c1', '12553000-0000-4000-8000-000000000001', 'Elf country', 'dnd5e-2024'),
  ('12553000-0000-4000-8000-0000000000c3', '12553000-0000-4000-8000-000000000003', 'Sam''s table', 'dnd5e-2024');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('12553000-0000-4000-8000-0000000000c1', '12553000-0000-4000-8000-000000000002', 'player', 'Pat'),
  ('12553000-0000-4000-8000-0000000000c1', '12553000-0000-4000-8000-000000000004', 'dm', 'Cole');

insert into public.library_species (id, name, ruleset, source_document_key, source_record_key, speed) values
  ('test_1255_elf', 'Elf', '2024', 'test-1255', 'elf', '{"walk": 30}');
insert into public.species (id, user_id, name) values
  ('12553000-0000-4000-8000-0000000000e1', '12553000-0000-4000-8000-000000000001', 'Saltborn'),
  ('12553000-0000-4000-8000-0000000000e3', '12553000-0000-4000-8000-000000000003', 'Sam''s own people'),
  ('12553000-0000-4000-8000-0000000000e4', '12553000-0000-4000-8000-000000000004', 'Cole''s own people');
insert into public.monsters (id, user_id, name) values
  ('12553000-0000-4000-8000-0000000000f1', '12553000-0000-4000-8000-000000000001', 'Marsh goblin');

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"12553000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

set local role authenticated;

-- ── The DM writes the peoples: a library species, a species of their own and a creature ──
select pg_temp.as_user(1);
select lives_ok($$
  insert into public.campaign_peoples (campaign_id, library_species_id, percent, sort_order)
  values ('12553000-0000-4000-8000-0000000000c1', 'test_1255_elf', 80, 0)
$$, 'the DM lists a species from a shared book');
select lives_ok($$
  insert into public.campaign_peoples (campaign_id, species_id, percent, sort_order)
  values ('12553000-0000-4000-8000-0000000000c1', '12553000-0000-4000-8000-0000000000e1', 10, 1)
$$, 'the DM lists a species of their own');
select lives_ok($$
  insert into public.campaign_peoples (campaign_id, monster_id, percent, sort_order)
  values ('12553000-0000-4000-8000-0000000000c1', '12553000-0000-4000-8000-0000000000f1', 5, 2)
$$, 'a creature of the bestiary can be a people too');
select results_eq(
  $$select name, kind, percent::numeric from public.campaign_peoples_named
     where campaign_id = '12553000-0000-4000-8000-0000000000c1' order by sort_order$$,
  $$values ('Elf'::text, 'species'::text, 80::numeric), ('Saltborn', 'species', 10), ('Marsh goblin', 'creature', 5)$$,
  'the DM reads them by name, each with its kind and its share');

-- ── What the table refuses ──
select throws_ok($$
  insert into public.campaign_peoples (campaign_id, library_species_id, percent)
  values ('12553000-0000-4000-8000-0000000000c1', 'no_such_species', 1)
$$, '23503', null, 'a library id that names no species is refused: a people is never typed');
select throws_ok($$
  insert into public.campaign_peoples (campaign_id, library_species_id, percent)
  values ('12553000-0000-4000-8000-0000000000c1', 'test_1255_elf', 1)
$$, '23505', null, 'a people cannot be listed twice');
select throws_ok($$
  insert into public.campaign_peoples (campaign_id, percent) values ('12553000-0000-4000-8000-0000000000c1', 1)
$$, '23514', null, 'a row must name exactly one people');
select throws_ok($$
  insert into public.campaign_peoples (campaign_id, species_id, percent)
  values ('12553000-0000-4000-8000-0000000000c1', '12553000-0000-4000-8000-0000000000e3', 1)
$$, null, null, 'a species that belongs to a stranger cannot be listed');

-- The total is checked at commit, so it is forced here with SET CONSTRAINTS.
select throws_ok($$
  do $do$ begin
    update public.campaign_peoples set percent = 90 where library_species_id = 'test_1255_elf';
    set constraints all immediate;
  end $do$
$$, '23514', null, 'shares that pass a hundred are refused');
set constraints all deferred;
select lives_ok($$
  do $do$ begin
    update public.campaign_peoples set percent = 85 where library_species_id = 'test_1255_elf';
    set constraints all immediate;
  end $do$
$$, 'shares that fill the hundred exactly are accepted');
set constraints all deferred;

-- ── Who else may touch it ──
select pg_temp.as_user(2);
select is_empty($$select 1 from public.campaign_peoples where campaign_id = '12553000-0000-4000-8000-0000000000c1'$$,
  'a player at the table does not read the peoples: they are the DM''s');
select throws_ok($$
  insert into public.campaign_peoples (campaign_id, library_species_id, percent)
  values ('12553000-0000-4000-8000-0000000000c1', 'test_1255_elf', 1)
$$, '42501', null, 'a player cannot write them');

select pg_temp.as_user(3);
select is_empty($$select 1 from public.campaign_peoples_named where campaign_id = '12553000-0000-4000-8000-0000000000c1'$$,
  'a stranger reads nothing through the named view either');
select throws_ok($$
  insert into public.campaign_peoples (campaign_id, library_species_id, percent)
  values ('12553000-0000-4000-8000-0000000000c1', 'test_1255_elf', 1)
$$, '42501', null, 'a DM of another table cannot write another campaign''s peoples');

-- ── A co-DM ──
-- A species on a co-DM's own shelf is not readable by the campaign's owner (species_select reads an owner's shelf,
-- not a co-DM's). Its share still counts, so the owner must see the row, without its name, or her total would not
-- add up and the refusal at a hundred would have no visible cause.
select pg_temp.as_user(1);
update public.campaign_peoples set percent = 50 where library_species_id = 'test_1255_elf';
select pg_temp.as_user(4);
insert into public.campaign_peoples (campaign_id, species_id, percent, sort_order)
values ('12553000-0000-4000-8000-0000000000c1', '12553000-0000-4000-8000-0000000000e4', 5, 3);
select pg_temp.as_user(1);
select is(
  (select count(*)::int from public.campaign_peoples_named where campaign_id = '12553000-0000-4000-8000-0000000000c1'), 4,
  'the owner sees every people of the campaign, a co-DM''s own species included');
select is(
  (select name from public.campaign_peoples_named
    where campaign_id = '12553000-0000-4000-8000-0000000000c1' and record_id = '12553000-0000-4000-8000-0000000000e4'),
  null, 'and that species comes without its name, which is not hers to read');

reset role;
select * from finish();
rollback;
