begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

-- Where the party is in a conversation (#1021). The narrator moves it with a tool, and the model can be talked
-- into naming any id it has seen, so the database itself must refuse a place from another campaign: otherwise a
-- conversation in one campaign would be handed another campaign's place, its description and its people.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('12160000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'scene-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system) values
  ('12160000-0000-4000-8000-000000000010', '12160000-0000-4000-8000-000000000001', 'Scene campaign', 'dnd5e-2024'),
  ('12160000-0000-4000-8000-000000000011', '12160000-0000-4000-8000-000000000001', 'The other campaign', 'dnd5e-2024');

insert into public.locations (id, user_id, campaign_id, name) values
  ('12160000-0000-4000-8000-000000000020', '12160000-0000-4000-8000-000000000001', '12160000-0000-4000-8000-000000000010', 'The front room'),
  ('12160000-0000-4000-8000-000000000021', '12160000-0000-4000-8000-000000000001', '12160000-0000-4000-8000-000000000011', 'Somewhere else entirely');

insert into public.agent_sessions (id, user_id, campaign_id, kind, provider, model)
values ('12160000-0000-4000-8000-000000000030', '12160000-0000-4000-8000-000000000001', '12160000-0000-4000-8000-000000000010', 'solo_table', 'openai', 'gpt-test');

-- Positive control: a place of the conversation's own campaign is accepted.
select lives_ok(
  $$ update public.agent_sessions set scene_location_id = '12160000-0000-4000-8000-000000000020'
     where id = '12160000-0000-4000-8000-000000000030' $$,
  'the server can stand the party in a place of the conversation''s campaign'
);

select throws_ok(
  $$ update public.agent_sessions set scene_location_id = '12160000-0000-4000-8000-000000000021'
     where id = '12160000-0000-4000-8000-000000000030' $$,
  '23514',
  null,
  'a place from another campaign is refused, even for the same owner and even from the server'
);

-- The same for the play session a conversation is a sitting of.
insert into public.campaign_sessions (id, campaign_id, user_id, number, started_at) values
  ('12160000-0000-4000-8000-000000000040', '12160000-0000-4000-8000-000000000010', '12160000-0000-4000-8000-000000000001', 1, now()),
  ('12160000-0000-4000-8000-000000000041', '12160000-0000-4000-8000-000000000011', '12160000-0000-4000-8000-000000000001', 1, now());

select lives_ok(
  $$ update public.agent_sessions set campaign_session_id = '12160000-0000-4000-8000-000000000040'
     where id = '12160000-0000-4000-8000-000000000030' $$,
  'a conversation can be a sitting of a session of its own campaign'
);

select throws_ok(
  $$ update public.agent_sessions set campaign_session_id = '12160000-0000-4000-8000-000000000041'
     where id = '12160000-0000-4000-8000-000000000030' $$,
  '23514',
  null,
  'a session of another campaign is refused, so one campaign''s play is never dated into another''s evening'
);

-- And for the clock a scene runs against.
insert into public.quests (id, user_id, campaign_id, title) values
  ('12160000-0000-4000-8000-000000000050', '12160000-0000-4000-8000-000000000001', '12160000-0000-4000-8000-000000000010', 'A quest here'),
  ('12160000-0000-4000-8000-000000000051', '12160000-0000-4000-8000-000000000001', '12160000-0000-4000-8000-000000000011', 'A quest elsewhere');
insert into public.quest_clocks (id, campaign_id, quest_id, label, segments) values
  ('12160000-0000-4000-8000-000000000060', '12160000-0000-4000-8000-000000000010', '12160000-0000-4000-8000-000000000050', 'The guard returns', 4),
  ('12160000-0000-4000-8000-000000000061', '12160000-0000-4000-8000-000000000011', '12160000-0000-4000-8000-000000000051', 'Another table''s clock', 4);

select lives_ok(
  $$ update public.agent_sessions set pressure_clock_id = '12160000-0000-4000-8000-000000000060'
     where id = '12160000-0000-4000-8000-000000000030' $$,
  'a conversation can run against a clock of its own campaign'
);

select throws_ok(
  $$ update public.agent_sessions set pressure_clock_id = '12160000-0000-4000-8000-000000000061'
     where id = '12160000-0000-4000-8000-000000000030' $$,
  '23514',
  null,
  'a clock of another campaign is refused, or one table''s turns would tick another table''s clock'
);

-- The owner reads where the party is, and cannot move it: only the server writes the row.
set local role authenticated;
select set_config('request.jwt.claim.sub', '12160000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ update public.agent_sessions set scene_location_id = null where id = '12160000-0000-4000-8000-000000000030' $$,
  '42501',
  null,
  'the owner''s own client cannot move the party'
);

reset role;

-- A deleted place leaves the party nowhere, and the conversation survives.
delete from public.locations where id = '12160000-0000-4000-8000-000000000020';
select is(
  (select scene_location_id from public.agent_sessions where id = '12160000-0000-4000-8000-000000000030'),
  null::uuid,
  'deleting the place clears the scene and keeps the conversation'
);

select * from finish();
rollback;
