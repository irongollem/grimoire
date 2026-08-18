-- Objectives are decided by the story flow: arriving at a beat, or taking a
-- particular branch out of one, can reveal, complete or fail them — and stepping
-- back puts them back, because at a table stepping back is a correction.
begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

select col_type_is('public', 'quest_objectives', 'status', 'text', 'an objective has a real outcome, not a done flag');
select hasnt_column('public', 'quest_objectives', 'is_done', 'a boolean could not say an objective failed');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('66000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'objfx-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('66000000-0000-4000-8000-000000000010', '66000000-0000-4000-8000-000000000001', 'Effects');

-- The owner is enrolled as DM by the campaign's own trigger; inserting the
-- membership here collides with it.

insert into public.quests (id, user_id, campaign_id, title, status)
values ('66000000-0000-4000-8000-000000000030', '66000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000010', 'Two roads', 'active');

insert into public.quest_objectives (id, quest_id, description, status, is_player_visible, sort_order) values
  ('66000000-0000-4000-8000-000000000051', '66000000-0000-4000-8000-000000000030', 'Save the caravan', 'pending', false, 1),
  ('66000000-0000-4000-8000-000000000052', '66000000-0000-4000-8000-000000000030', 'Keep the bridge standing', 'pending', true, 2);

insert into public.quest_beats (id, quest_id, campaign_id, title, visibility, kind) values
  ('66000000-0000-4000-8000-000000000041', '66000000-0000-4000-8000-000000000030', '66000000-0000-4000-8000-000000000010', 'The fork', 'hidden', 'social'),
  ('66000000-0000-4000-8000-000000000042', '66000000-0000-4000-8000-000000000030', '66000000-0000-4000-8000-000000000010', 'The high road', 'hidden', 'explore'),
  ('66000000-0000-4000-8000-000000000043', '66000000-0000-4000-8000-000000000030', '66000000-0000-4000-8000-000000000010', 'The burning bridge', 'hidden', 'combat');

insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, label) values
  ('66000000-0000-4000-8000-000000000061', '66000000-0000-4000-8000-000000000030', '66000000-0000-4000-8000-000000000010', '66000000-0000-4000-8000-000000000041', '66000000-0000-4000-8000-000000000042', 'Take the high road'),
  ('66000000-0000-4000-8000-000000000062', '66000000-0000-4000-8000-000000000030', '66000000-0000-4000-8000-000000000010', '66000000-0000-4000-8000-000000000041', '66000000-0000-4000-8000-000000000043', 'Cross the bridge');

select throws_ok($$
  insert into public.quest_objective_effects (quest_id, objective_id, trigger_beat_id, trigger_edge_id, effect)
  values ('66000000-0000-4000-8000-000000000030', '66000000-0000-4000-8000-000000000051', '66000000-0000-4000-8000-000000000041', '66000000-0000-4000-8000-000000000061', 'complete')
$$, '23514', null, 'an effect fires from a beat or a branch, never both');

select throws_ok($$
  insert into public.quest_objective_effects (quest_id, objective_id, effect)
  values ('66000000-0000-4000-8000-000000000030', '66000000-0000-4000-8000-000000000051', 'complete')
$$, '23514', null, 'an effect without a trigger can never fire');

insert into public.quest_objective_effects (quest_id, objective_id, trigger_beat_id, effect) values
  ('66000000-0000-4000-8000-000000000030', '66000000-0000-4000-8000-000000000051', '66000000-0000-4000-8000-000000000041', 'reveal');
insert into public.quest_objective_effects (quest_id, objective_id, trigger_edge_id, effect) values
  ('66000000-0000-4000-8000-000000000030', '66000000-0000-4000-8000-000000000052', '66000000-0000-4000-8000-000000000062', 'fail');

select set_config('request.jwt.claim.sub', '66000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select lives_ok($$select public.transition_quest_runtime(
  '66000000-0000-4000-8000-000000000010', 'start', 0,
  '66000000-0000-4000-8000-000000000030', '66000000-0000-4000-8000-000000000041')$$,
  'entering the fork runs its beat effects');

select is(
  (select is_player_visible from public.quest_objectives where id = '66000000-0000-4000-8000-000000000051'),
  true,
  'arriving at a beat reveals the objective it hangs on'
);

-- The branch, not the beat: the party fails the bridge by choosing to cross it.
select is(
  (select status from public.quest_objectives where id = '66000000-0000-4000-8000-000000000052'),
  'pending',
  'a branch effect stays quiet until that branch is actually taken'
);

select lives_ok($$select public.transition_quest_runtime(
  '66000000-0000-4000-8000-000000000010', 'advance', 1, null, null,
  '66000000-0000-4000-8000-000000000062')$$,
  'taking the branch runs its edge effects');

select is(
  (select status from public.quest_objectives where id = '66000000-0000-4000-8000-000000000052'),
  'failed',
  'an objective can be failed by the road the party chose'
);

-- Stepping back at a table is a correction, so what the step forward decided
-- must come undone with it, not linger as a state the DM cannot see.
select lives_ok($$select public.transition_quest_runtime(
  '66000000-0000-4000-8000-000000000010', 'previous', 2)$$,
  'stepping back is allowed after an effect fired');

select is(
  (select status from public.quest_objectives where id = '66000000-0000-4000-8000-000000000052'),
  'pending',
  'stepping back over a branch undoes what that branch decided'
);

select is(
  (select count(*)::integer from public.quest_objective_effect_events
   where campaign_id = '66000000-0000-4000-8000-000000000010'),
  1,
  'only the reversed arrival is dropped from the effect log'
);

select * from finish();
rollback;
