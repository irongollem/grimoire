-- #1073 story 9: a character's own senses (party_members.senses, 20261017205242_party_member_senses). The player who
-- owns a character can write them; the length is bounded.

begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('10730000-0000-4000-8000-000000000901', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue1073-senses-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10730000-0000-4000-8000-000000000902', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue1073-senses-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('10730000-0000-4000-8000-000000000910', '10730000-0000-4000-8000-000000000901', 'Senses campaign');

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, ruleset)
values ('10730000-0000-4000-8000-000000000920', '10730000-0000-4000-8000-000000000901', '10730000-0000-4000-8000-000000000902', '10730000-0000-4000-8000-000000000910', 'Vesna', '2014');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10730000-0000-4000-8000-000000000902","role":"authenticated"}', true);

update public.party_members set senses = 'darkvision 60 ft., blindsight 10 ft.' where id = '10730000-0000-4000-8000-000000000920';
reset role;

select is(
  (select senses from public.party_members where id = '10730000-0000-4000-8000-000000000920'),
  'darkvision 60 ft., blindsight 10 ft.',
  'the player who owns a character writes its senses');

select throws_ok(
  $$update public.party_members set senses = repeat('x', 201) where id = '10730000-0000-4000-8000-000000000920'$$,
  '23514',
  null,
  'senses are bounded in length');

select is(
  (select senses from public.party_members where id = '10730000-0000-4000-8000-000000000920'),
  'darkvision 60 ft., blindsight 10 ft.',
  'and a refused write leaves them as they were');

select * from finish();
rollback;
