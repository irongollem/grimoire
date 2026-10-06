-- #975: a paper doll is written only by its generator. The owner and the DM
-- may update the row (doll_requested_at is theirs to set and clear), but not
-- its doll; a service-role write (the generator) passes.
--
--   1 Pia (the character's player)
begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('97500000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'doll-guard-1@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, level, ruleset, max_hp, current_hp) values
  ('97500000-0000-4000-8000-0000000000e1', '97500000-0000-4000-8000-000000000001',
   '97500000-0000-4000-8000-000000000001', null, 'Pia''s rogue', 3, '2014', 20, 20);

select set_config('request.jwt.claims', '{"sub":"97500000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$ update public.party_members set doll = '{"version":1}'::jsonb where id = '97500000-0000-4000-8000-0000000000e1' $$,
  '42501', null, 'the player cannot write a doll on their own character');

select lives_ok(
  $$ update public.party_members set doll_requested_at = now() where id = '97500000-0000-4000-8000-0000000000e1' $$,
  'the player can ask their DM for a doll');

select throws_ok(
  $$ insert into public.party_members (user_id, owner_user_id, name, level, ruleset, max_hp, current_hp, doll)
     values ('97500000-0000-4000-8000-000000000001', '97500000-0000-4000-8000-000000000001', 'Forged', 1, '2014', 8, 8, '{"version":1}'::jsonb) $$,
  '42501', null, 'a new character cannot arrive with a doll');

reset role;
set local role service_role;

select lives_ok(
  $$ update public.party_members set doll = '{"version":1}'::jsonb, doll_requested_at = null where id = '97500000-0000-4000-8000-0000000000e1' $$,
  'the generator (service role) writes the doll and clears the ask');

reset role;

select is(
  (select doll_requested_at from public.party_members where id = '97500000-0000-4000-8000-0000000000e1'),
  null, 'the finished doll answered the ask');

select * from finish();
rollback;
