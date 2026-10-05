begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

-- set_quest_beat_positions (#972, migration 20261005075059): a canvas drag of
-- several beats saved in one statement, confined to the named quest.

set local grimoire.bypass_quota = 'on';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('97300000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'positions-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('97300000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'positions-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('97300000-0000-4000-8000-000000000010', '97300000-0000-4000-8000-000000000001', 'Positions');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('97300000-0000-4000-8000-000000000010', '97300000-0000-4000-8000-000000000002', 'player', 'Player')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.quests (id, user_id, campaign_id, title) values
  ('97300000-0000-4000-8000-000000000020', '97300000-0000-4000-8000-000000000001', '97300000-0000-4000-8000-000000000010', 'Moved'),
  ('97300000-0000-4000-8000-000000000021', '97300000-0000-4000-8000-000000000001', '97300000-0000-4000-8000-000000000010', 'Elsewhere');

insert into public.quest_beats (id, quest_id, campaign_id, title, canvas_x, canvas_y) values
  ('97300000-0000-4000-8000-000000000030', '97300000-0000-4000-8000-000000000020', '97300000-0000-4000-8000-000000000010', 'A', 0, 0),
  ('97300000-0000-4000-8000-000000000031', '97300000-0000-4000-8000-000000000020', '97300000-0000-4000-8000-000000000010', 'B', 0, 0),
  ('97300000-0000-4000-8000-000000000032', '97300000-0000-4000-8000-000000000021', '97300000-0000-4000-8000-000000000010', 'Other quest', 0, 0);

set local role authenticated;
select set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"97300000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  public.set_quest_beat_positions('97300000-0000-4000-8000-000000000020', '[
    {"id": "97300000-0000-4000-8000-000000000030", "x": 120.5, "y": 40},
    {"id": "97300000-0000-4000-8000-000000000031", "x": 300, "y": -20},
    {"id": "97300000-0000-4000-8000-000000000032", "x": 999, "y": 999}
  ]'::jsonb),
  2,
  'the beats of the named quest move together; a beat of another quest is not counted'
);
select is(
  (select array_agg(canvas_x::text || ',' || canvas_y::text order by title) from public.quest_beats
    where quest_id = '97300000-0000-4000-8000-000000000020'),
  array['120.5,40', '300,-20'],
  'each beat lands where it was dropped'
);
select is(
  (select canvas_x::text || ',' || canvas_y::text from public.quest_beats where id = '97300000-0000-4000-8000-000000000032'),
  '0,0',
  'a position list cannot reach a beat of another quest'
);

select set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"97300000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ select public.set_quest_beat_positions('97300000-0000-4000-8000-000000000020', '[{"id": "97300000-0000-4000-8000-000000000030", "x": 1, "y": 1}]'::jsonb) $$,
  'Not authorized',
  'a player cannot move a beat'
);

reset role;
select ok(not has_function_privilege('anon', 'public.set_quest_beat_positions(uuid,jsonb)', 'EXECUTE'), 'anon cannot call it');

select * from finish();
rollback;
