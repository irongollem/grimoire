begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

select has_function(
  'public', 'improvise_quest_runtime',
  array['uuid', 'bigint', 'text', 'text', 'text', 'text', 'text', 'boolean', 'boolean', 'text'],
  'five-second improv has one atomic RPC'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('67100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue671-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('67100000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue671-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name) values ('67100000-0000-4000-8000-000000000010', '67100000-0000-4000-8000-000000000001', 'Improv campaign');
insert into public.quests (id, user_id, campaign_id, title) values ('67100000-0000-4000-8000-000000000020', '67100000-0000-4000-8000-000000000001', '67100000-0000-4000-8000-000000000010', 'Prepared quest');
insert into public.quest_beats (id, quest_id, campaign_id, title, canvas_x, canvas_y)
values ('67100000-0000-4000-8000-000000000030', '67100000-0000-4000-8000-000000000020', '67100000-0000-4000-8000-000000000010', 'Prepared beat', 100, 200);

set local role authenticated;
select set_config('request.jwt.claim.sub', '67100000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok($$
  select public.transition_quest_runtime(
    '67100000-0000-4000-8000-000000000010', 'start', 0,
    '67100000-0000-4000-8000-000000000020', '67100000-0000-4000-8000-000000000030'
  )
$$, 'prepared run starts');

create temporary table improv_result(payload jsonb);
insert into improv_result select public.improvise_quest_runtime(
  '67100000-0000-4000-8000-000000000010', 1, 'The chandelier falls', 'explore',
  'Keep the crowd moving', 'The hall erupts in chaos', 'A player cut the rope', true, false
);

select is((select payload -> 'beat' ->> 'visibility' from improv_result), 'hidden', 'improv starts hidden even with explicit reveal copy');
select is((select payload -> 'beat' ->> 'is_improvised' from improv_result), 'true', 'created beat retains improv provenance');
select is((select payload -> 'context' -> 'current' ->> 'title' from improv_result), 'The chandelier falls', 'created beat becomes current in the same commit');
select is((select transition_kind from public.quest_beat_transitions where runtime_version = 2), 'improv', 'runtime history records the improv transition');
select is((select count(*)::integer from public.quest_beat_edges where campaign_id = '67100000-0000-4000-8000-000000000010'), 0, 'history-only improv does not alter the authored graph');
select is((select return_stack -> 0 ->> 'beat_id' from public.quest_runtime_state where campaign_id = '67100000-0000-4000-8000-000000000010'), '67100000-0000-4000-8000-000000000030', 'improv can retain the prepared return point');
select is((select improv_reviewed_at from public.quest_beats where is_improvised), null::timestamptz, 'new improv remains flagged for post-session review');

select lives_ok($$ select public.transition_quest_runtime('67100000-0000-4000-8000-000000000010', 'return', 2) $$, 'DM can return to prepared play');
select lives_ok($$
  select public.improvise_quest_runtime(
    '67100000-0000-4000-8000-000000000010', 3, 'Kept detour', 'social', null, null,
    'The table made it canon', false, true, 'Follow the new ally'
  )
$$, 'DM can keep the improvised route in the authored graph');
select is((select label from public.quest_beat_edges where campaign_id = '67100000-0000-4000-8000-000000000010'), 'Follow the new ally', 'kept improv edge has explicit authored meaning');
select throws_ok($$
  select public.improvise_quest_runtime(
    '67100000-0000-4000-8000-000000000010', 3, 'Stale attempt', 'neutral', null, null,
    'Lost race', false, false
  )
$$, '40001', 'Quest runtime changed; expected version 3, current version 4', 'stale co-DM improv fails atomically');
select is((select count(*)::integer from public.quest_beats where is_improvised), 2, 'failed improv leaves no orphan beat to clean up');

select set_config('request.jwt.claim.sub', '67100000-0000-4000-8000-000000000002', true);
select throws_ok($$
  select public.improvise_quest_runtime(
    '67100000-0000-4000-8000-000000000010', 4, 'Intrusion', 'neutral', null, null, 'No', false, false
  )
$$, 'P0001', 'Not authorized', 'outsider cannot create or enter an improvised beat');

select * from finish();
rollback;
