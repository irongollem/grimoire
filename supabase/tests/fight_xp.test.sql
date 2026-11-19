begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

-- XP for a won fight (#1021 row 27, `20261119191615`). Adding XP is not idempotent, and the fight's server replays its
-- end-of-fight writes when a retry finds the fight ended, so the award must land once. What would go wrong silently:
-- a replay doubling everyone's XP, XP for a fight still running, another campaign's character getting a share, or a
-- browser calling the award for itself.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('10290000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fx-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10290000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fx-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name, game_system) values
  ('10290000-0000-4000-8000-000000000010', '10290000-0000-4000-8000-000000000001', 'XP', 'dnd5e-2014'),
  ('10290000-0000-4000-8000-000000000011', '10290000-0000-4000-8000-000000000003', 'Elsewhere', 'dnd5e-2014');
insert into public.party_members (id, user_id, campaign_id, name, ruleset, experience_points) values
  ('10290000-0000-4000-8000-000000000030', '10290000-0000-4000-8000-000000000001', '10290000-0000-4000-8000-000000000010', 'Wren', '2014', 100),
  ('10290000-0000-4000-8000-000000000031', '10290000-0000-4000-8000-000000000001', '10290000-0000-4000-8000-000000000010', 'Ash', '2014', 0),
  ('10290000-0000-4000-8000-000000000039', '10290000-0000-4000-8000-000000000003', '10290000-0000-4000-8000-000000000011', 'Not here', '2014', 0);
insert into public.encounters (id, user_id, campaign_id, name) values
  ('10290000-0000-4000-8000-000000000020', '10290000-0000-4000-8000-000000000001', '10290000-0000-4000-8000-000000000010', 'The ogre');
insert into public.encounter_state (encounter_id, campaign_id, user_id, is_running) values
  ('10290000-0000-4000-8000-000000000020', '10290000-0000-4000-8000-000000000010', '10290000-0000-4000-8000-000000000001', true);

create temporary table fx_args as select
  '10290000-0000-4000-8000-000000000020'::uuid as encounter_id,
  array['10290000-0000-4000-8000-000000000030', '10290000-0000-4000-8000-000000000031', '10290000-0000-4000-8000-000000000039']::uuid[] as members;

select is(
  (select public.award_fight_xp(encounter_id, members, 225, 450) from fx_args), false,
  'a fight still running gives nothing'
);

update public.encounter_state set ended_at = now(), is_running = false where encounter_id = '10290000-0000-4000-8000-000000000020';
select is((select public.award_fight_xp(encounter_id, members, 225, 450) from fx_args), true, 'an ended fight gives its XP');
select is(
  (select array_agg(experience_points order by name) from public.party_members where campaign_id = '10290000-0000-4000-8000-000000000010'),
  array[225, 325],
  'each character of the fight gets the share, each from where they stood'
);
select is(
  (select experience_points from public.party_members where id = '10290000-0000-4000-8000-000000000039'), 0,
  'a character of another campaign gets nothing, whatever the list says'
);

-- The server's retry of End combat replays the award.
select is((select public.award_fight_xp(encounter_id, members, 225, 450) from fx_args), false, 'a replay gives nothing');
select is(
  (select count(*)::integer from public.campaign_messages where campaign_id = '10290000-0000-4000-8000-000000000010' and message like '%worth 450 XP%'),
  1, 'the table hears it once'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10290000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ select public.award_fight_xp('10290000-0000-4000-8000-000000000020', array['10290000-0000-4000-8000-000000000030']::uuid[], 99999, 99999) $$,
  '42501', null, 'a signed-in user, even the DM, cannot award XP through it: only the fight''s server can'
);
reset role;

select * from finish();
rollback;
