begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

-- Every species has a walking speed: its own, or one on each of its subraces
-- (a darakhul's heritages). Migration 20261012105028.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000001012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'walk-speed-tests@example.invalid', '', '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

select lives_ok($$
  insert into public.species (user_id, name) values ('00000000-0000-4000-8000-000000001012', 'Defaulted')
$$, 'a species written without a speed is allowed');

select is(
  (select speed from public.species where user_id = '00000000-0000-4000-8000-000000001012' and name = 'Defaulted'),
  '{"walk": 30}'::jsonb,
  'and starts at 30 ft walking'
);

select throws_ok($$
  insert into public.species (user_id, name, speed) values ('00000000-0000-4000-8000-000000001012', 'Nulled', null)
$$, '23514', null, 'a species cannot be written with speed null');

select throws_ok($$
  insert into public.species (user_id, name, speed) values ('00000000-0000-4000-8000-000000001012', 'Flyer', '{"fly": 30}')
$$, '23514', null, 'another mode is no walking speed');

select throws_ok($$
  insert into public.species (user_id, name, speed) values ('00000000-0000-4000-8000-000000001012', 'Texty', '{"walk": "30"}')
$$, '23514', null, 'a walking speed is a number');

select lives_ok($$
  insert into public.species (user_id, name, speed, subraces) values ('00000000-0000-4000-8000-000000001012', 'Heritaged', null,
    '[{"name": "Dwarf", "description": "", "traits": [], "speed": {"walk": 25}},
      {"name": "Human", "description": "", "traits": [], "speed": {"walk": 30}}]')
$$, 'a species may leave its walking speed to subraces that all state one');

select throws_ok($$
  insert into public.species (user_id, name, speed, subraces) values ('00000000-0000-4000-8000-000000001012', 'Gapped', null,
    '[{"name": "Dwarf", "description": "", "traits": [], "speed": {"walk": 25}},
      {"name": "Ravenfolk", "description": "", "traits": []}]')
$$, '23514', null, 'but not when one subrace leaves it unstated');

select throws_ok($$
  insert into public.species (user_id, name, speed, subraces) values ('00000000-0000-4000-8000-000000001012', 'Empty', null, '[]')
$$, '23514', null, 'nor with no subraces at all');

select is(
  (select count(*)::integer from public.library_species
   where coalesce(
     jsonb_typeof(speed -> 'walk') = 'number'
     or (jsonb_typeof(subraces) = 'array'
         and jsonb_path_exists(subraces, '$[0]')
         and not jsonb_path_exists(subraces, '$[*] ? (!exists(@.speed.walk ? (@.type() == "number")))')),
     false) is false),
  0,
  'every library species has a walking speed'
);

select * from finish();
rollback;
