-- The arrival ratchet reads the beat's visibility (20260909194207): a run that
-- starts on a rumored beat takes an undiscovered quest to Rumor and no further;
-- the first step onto any other beat takes it to Active. One-way as before.
begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

set local grimoire.bypass_quota = 'on';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('79700000-0000-4000-8000-000000a00001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ratchet-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('79700000-0000-4000-8000-000000a00010', '79700000-0000-4000-8000-000000a00001', 'Ratchet');

insert into public.quests (id, user_id, campaign_id, title, status)
values ('79700000-0000-4000-8000-000000a00030', '79700000-0000-4000-8000-000000a00001', '79700000-0000-4000-8000-000000a00010', 'Word on the road', 'undiscovered');

insert into public.quest_beats (id, quest_id, campaign_id, title, visibility) values
  ('79700000-0000-4000-8000-000000a00041', '79700000-0000-4000-8000-000000a00030', '79700000-0000-4000-8000-000000a00010', 'The rumor', 'rumored'),
  ('79700000-0000-4000-8000-000000a00042', '79700000-0000-4000-8000-000000a00030', '79700000-0000-4000-8000-000000a00010', 'The docks', 'hidden');

insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id)
values ('79700000-0000-4000-8000-000000a00061', '79700000-0000-4000-8000-000000a00030', '79700000-0000-4000-8000-000000a00010',
        '79700000-0000-4000-8000-000000a00041', '79700000-0000-4000-8000-000000a00042');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '79700000-0000-4000-8000-000000a00001', true);

select is(
  (select entry_beat_id from public.quests where id = '79700000-0000-4000-8000-000000a00030'),
  '79700000-0000-4000-8000-000000a00041'::uuid,
  'the rumor beat, written first, is the entry');

select lives_ok(
  $$select public.transition_quest_runtime(
      '79700000-0000-4000-8000-000000a00010', '79700000-0000-4000-8000-000000a00030',
      (select id from public.quest_threads where quest_id = '79700000-0000-4000-8000-000000a00030' and label = 'Main'),
      'start', 0, '79700000-0000-4000-8000-000000a00041')$$,
  'the run starts on the rumor beat');

select is(
  (select status::text from public.quests where id = '79700000-0000-4000-8000-000000a00030'),
  'rumor',
  'standing on a rumored beat makes the quest a rumor, not active');

select lives_ok(
  $$select public.transition_quest_runtime(
      '79700000-0000-4000-8000-000000a00010', '79700000-0000-4000-8000-000000a00030',
      (select id from public.quest_threads where quest_id = '79700000-0000-4000-8000-000000a00030' and label = 'Main'),
      'advance', 1, p_edge_id => '79700000-0000-4000-8000-000000a00061')$$,
  'the party takes the road');

select is(
  (select status::text from public.quests where id = '79700000-0000-4000-8000-000000a00030'),
  'active',
  'the first step past the rumor makes the quest active');

select * from finish();
rollback;
