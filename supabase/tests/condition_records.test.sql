begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

-- #1018: a condition on a creature is a record (`AppliedCondition`,
-- src/types/condition.types.ts), stored as a jsonb array in
-- `party_members.conditions`, `companions.conditions` and every combatant of
-- `encounter_state.combatants_live` (migration 20261010180827).
--
-- The checks refuse a bare string element. A tab still running the client from
-- before the change writes `["Prone"]`; accepted, that row would break every
-- reader of the new shape, so it must fail and make the tab reload instead.

select col_type_is('public', 'party_members', 'conditions', 'jsonb', 'party_members.conditions is jsonb');
select col_type_is('public', 'companions', 'conditions', 'jsonb', 'companions.conditions is jsonb');
select col_default_is('public', 'party_members', 'conditions', '[]', 'party_members.conditions defaults to an empty array');

select ok(
  exists (select 1 from pg_constraint
           where conrelid = 'public.companions'::regclass and conname = 'companions_conditions_are_records'),
  'companions refuses a condition that is not a record');
select ok(
  exists (select 1 from pg_constraint
           where conrelid = 'public.encounter_state'::regclass and conname = 'encounter_state_conditions_are_records'),
  'encounter_state refuses a combatant condition that is not a record');

-- ── Behaviour, on an unattached character ───────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('10180000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'conditions@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.party_members (id, user_id, name, ruleset)
values ('10180000-0000-4000-8000-000000000010', '10180000-0000-4000-8000-000000000001', 'Vex', '2014');

select is(
  (select conditions from public.party_members where id = '10180000-0000-4000-8000-000000000010'),
  '[]'::jsonb,
  'a new character starts with no conditions');

select lives_ok(
  $$ update public.party_members
        set conditions = '[{"name":"Paralyzed","source":{"id":"m-1","spell":"Hold Person","concentration":true},"ends":{"kind":"save","ability":"wis","dc":14,"at":"end"}},{"name":"Exhaustion","level":2}]'
      where id = '10180000-0000-4000-8000-000000000010' $$,
  'condition records are accepted');

select throws_ok(
  $$ update public.party_members set conditions = '["Prone"]' where id = '10180000-0000-4000-8000-000000000010' $$,
  '23514', null,
  'a bare condition name is refused');

select throws_ok(
  $$ update public.party_members set conditions = '[{"level":2}]' where id = '10180000-0000-4000-8000-000000000010' $$,
  '23514', null,
  'a record without a name is refused');

select throws_ok(
  $$ update public.party_members set conditions = '{}' where id = '10180000-0000-4000-8000-000000000010' $$,
  '23514', null,
  'an object in place of the list is refused');

select * from finish();
rollback;
