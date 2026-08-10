begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('68700000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue687-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name) values ('68700000-0000-4000-8000-000000000010', '68700000-0000-4000-8000-000000000001', 'Atomic current archive');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values ('68700000-0000-4000-8000-000000000010', '68700000-0000-4000-8000-000000000001', 'dm', 'DM') on conflict (campaign_id, user_id) do update set role = excluded.role;
insert into public.quests (id, user_id, campaign_id, title) values ('68700000-0000-4000-8000-000000000020', '68700000-0000-4000-8000-000000000001', '68700000-0000-4000-8000-000000000010', 'Quest');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('68700000-0000-4000-8000-000000000030', '68700000-0000-4000-8000-000000000020', '68700000-0000-4000-8000-000000000010', 'Current'),
  ('68700000-0000-4000-8000-000000000031', '68700000-0000-4000-8000-000000000020', '68700000-0000-4000-8000-000000000010', 'Replacement'),
  ('68700000-0000-4000-8000-000000000032', '68700000-0000-4000-8000-000000000020', '68700000-0000-4000-8000-000000000010', 'Later current');
insert into public.quest_beat_edges (quest_id, campaign_id, source_beat_id, target_beat_id) values ('68700000-0000-4000-8000-000000000020', '68700000-0000-4000-8000-000000000010', '68700000-0000-4000-8000-000000000030', '68700000-0000-4000-8000-000000000031');
insert into public.quest_runtime_state (campaign_id, current_quest_id, current_beat_id, status, version, visit_stack, visit_index) values (
  '68700000-0000-4000-8000-000000000010', '68700000-0000-4000-8000-000000000020', '68700000-0000-4000-8000-000000000030', 'running', 3,
  '[{"quest_id":"68700000-0000-4000-8000-000000000020","beat_id":"68700000-0000-4000-8000-000000000030"}]'::jsonb, 0
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '68700000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok($$ select public.archive_quest_beat('68700000-0000-4000-8000-000000000030') $$, '22023', 'Current beat removal requires its runtime version', 'current removal requires concurrency state');
select is((select kind from public.quest_beats where id = '68700000-0000-4000-8000-000000000030'), 'neutral', 'rejected removal leaves beat authored');
select is((select count(*)::integer from public.quest_beat_transitions where campaign_id = '68700000-0000-4000-8000-000000000010'), 0, 'rejected removal adds no history');

select lives_ok($$ select public.archive_quest_beat('68700000-0000-4000-8000-000000000030', 3, '68700000-0000-4000-8000-000000000031', false) $$, 'current beat relocation and archive commit together');
select is((select current_beat_id from public.quest_runtime_state where campaign_id = '68700000-0000-4000-8000-000000000010'), '68700000-0000-4000-8000-000000000031'::uuid, 'cursor moves to replacement');
select is((select kind from public.quest_beats where id = '68700000-0000-4000-8000-000000000030'), 'archived', 'former current beat is archived');
select is((select count(*)::integer from public.quest_beat_edges where source_beat_id = '68700000-0000-4000-8000-000000000030'), 0, 'former current routes are detached');
select is((select count(*)::integer from public.quest_beat_transitions where campaign_id = '68700000-0000-4000-8000-000000000010'), 1, 'successful relocation adds exactly one history row');

select throws_ok($$ select public.archive_quest_beat('68700000-0000-4000-8000-000000000031', 3, null, true) $$, '40001', 'Quest runtime changed; reload before removing this beat', 'stale version rejects the whole removal');
select is((select kind from public.quest_beats where id = '68700000-0000-4000-8000-000000000031'), 'neutral', 'stale removal leaves replacement authored');
select is((select count(*)::integer from public.quest_beat_transitions where campaign_id = '68700000-0000-4000-8000-000000000010'), 1, 'stale removal adds no history');

select * from finish();
rollback;
