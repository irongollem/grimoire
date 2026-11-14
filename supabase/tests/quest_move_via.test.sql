begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

-- Cover for the `p_via` argument of public.mark_quest_move (#1194): two ways
-- lead from the entry S to the lodge L (through the kennels K1, K2, or through
-- the tunnel T), then the route L -> V. The DM names the way; the player's quest
-- log is told in that order, so the server fills in exactly it, records each
-- step's route as provenance and fires that route's payoffs, and refuses a way
-- that does not start where the thread stands or follows no route.

set local grimoire.bypass_quota = 'on';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('11940000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'via1194-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name) values ('11940000-0000-4000-8000-00000000000a', '11940000-0000-4000-8000-000000000001', 'Via main');

insert into public.quests (id, user_id, campaign_id, title) values ('11940000-0000-4000-8000-0000000000a1', '11940000-0000-4000-8000-000000000001', '11940000-0000-4000-8000-00000000000a', 'Quest Via');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('11940000-0000-4000-8000-0000000000b1', '11940000-0000-4000-8000-0000000000a1', '11940000-0000-4000-8000-00000000000a', 'S'),
  ('11940000-0000-4000-8000-0000000000b2', '11940000-0000-4000-8000-0000000000a1', '11940000-0000-4000-8000-00000000000a', 'K1'),
  ('11940000-0000-4000-8000-0000000000b3', '11940000-0000-4000-8000-0000000000a1', '11940000-0000-4000-8000-00000000000a', 'K2'),
  ('11940000-0000-4000-8000-0000000000b4', '11940000-0000-4000-8000-0000000000a1', '11940000-0000-4000-8000-00000000000a', 'T'),
  ('11940000-0000-4000-8000-0000000000b5', '11940000-0000-4000-8000-0000000000a1', '11940000-0000-4000-8000-00000000000a', 'L'),
  ('11940000-0000-4000-8000-0000000000b6', '11940000-0000-4000-8000-0000000000a1', '11940000-0000-4000-8000-00000000000a', 'V');
update public.quests set entry_beat_id = '11940000-0000-4000-8000-0000000000b1' where id = '11940000-0000-4000-8000-0000000000a1';
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id) values
  ('11940000-0000-4000-8000-0000000000e1', '11940000-0000-4000-8000-0000000000a1', '11940000-0000-4000-8000-00000000000a', '11940000-0000-4000-8000-0000000000b1', '11940000-0000-4000-8000-0000000000b2'),
  ('11940000-0000-4000-8000-0000000000e2', '11940000-0000-4000-8000-0000000000a1', '11940000-0000-4000-8000-00000000000a', '11940000-0000-4000-8000-0000000000b2', '11940000-0000-4000-8000-0000000000b3'),
  ('11940000-0000-4000-8000-0000000000e3', '11940000-0000-4000-8000-0000000000a1', '11940000-0000-4000-8000-00000000000a', '11940000-0000-4000-8000-0000000000b3', '11940000-0000-4000-8000-0000000000b5'),
  ('11940000-0000-4000-8000-0000000000e4', '11940000-0000-4000-8000-0000000000a1', '11940000-0000-4000-8000-00000000000a', '11940000-0000-4000-8000-0000000000b1', '11940000-0000-4000-8000-0000000000b4'),
  ('11940000-0000-4000-8000-0000000000e5', '11940000-0000-4000-8000-0000000000a1', '11940000-0000-4000-8000-00000000000a', '11940000-0000-4000-8000-0000000000b4', '11940000-0000-4000-8000-0000000000b5'),
  ('11940000-0000-4000-8000-0000000000e6', '11940000-0000-4000-8000-0000000000a1', '11940000-0000-4000-8000-00000000000a', '11940000-0000-4000-8000-0000000000b5', '11940000-0000-4000-8000-0000000000b6');

-- Each way has an edge payoff of its own, and the lodge has an arrival payoff.
insert into public.quest_objectives (id, quest_id, description, status, sort_order) values
  ('11940000-0000-4000-8000-0000000000c1', '11940000-0000-4000-8000-0000000000a1', 'Kennels path', 'dormant', 1),
  ('11940000-0000-4000-8000-0000000000c2', '11940000-0000-4000-8000-0000000000a1', 'Tunnel path', 'dormant', 2);
insert into public.quest_consequences (id, quest_id, on_beat_id, on_edge_id, on_beat_outcome, action, target_objective_id) values
  ('11940000-0000-4000-8000-0000000000d1', '11940000-0000-4000-8000-0000000000a1', null, '11940000-0000-4000-8000-0000000000e1', 'arrived', 'raise', '11940000-0000-4000-8000-0000000000c1'),
  ('11940000-0000-4000-8000-0000000000d2', '11940000-0000-4000-8000-0000000000a1', null, '11940000-0000-4000-8000-0000000000e4', 'arrived', 'raise', '11940000-0000-4000-8000-0000000000c2');

create or replace function pg_temp.main_thread() returns uuid language sql as
  $$ select id from public.quest_threads where quest_id = '11940000-0000-4000-8000-0000000000a1' and label = 'Main' $$;
grant execute on function pg_temp.main_thread() to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11940000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);

-- Refusals first, each followed by the valid call below as the positive control.
select throws_ok(
  $$select public.mark_quest_move('11940000-0000-4000-8000-00000000000a'::uuid, '11940000-0000-4000-8000-0000000000a1'::uuid, pg_temp.main_thread(), 'route',
      p_edge_id => '11940000-0000-4000-8000-0000000000e6'::uuid, p_via => array['11940000-0000-4000-8000-0000000000b2', '11940000-0000-4000-8000-0000000000b3', '11940000-0000-4000-8000-0000000000b5']::uuid[])$$,
  '22023', 'That way does not lead from where the party is to this beat',
  'a way that does not start where the thread stands (the entry S) is refused'
);
select throws_ok(
  $$select public.mark_quest_move('11940000-0000-4000-8000-00000000000a'::uuid, '11940000-0000-4000-8000-0000000000a1'::uuid, pg_temp.main_thread(), 'route',
      p_edge_id => '11940000-0000-4000-8000-0000000000e6'::uuid, p_via => array['11940000-0000-4000-8000-0000000000b1', '11940000-0000-4000-8000-0000000000b2']::uuid[])$$,
  '22023', 'That way does not lead from where the party is to this beat',
  'a way that stops short of the route''s source is refused'
);
select throws_ok(
  $$select public.mark_quest_move('11940000-0000-4000-8000-00000000000a'::uuid, '11940000-0000-4000-8000-0000000000a1'::uuid, pg_temp.main_thread(), 'route',
      p_edge_id => '11940000-0000-4000-8000-0000000000e6'::uuid, p_via => array['11940000-0000-4000-8000-0000000000b1', '11940000-0000-4000-8000-0000000000b3', '11940000-0000-4000-8000-0000000000b5']::uuid[])$$,
  '22023', 'That way does not follow the routes of this quest',
  'a step that is not a route (S to K2) is refused'
);
select is((select count(*)::integer from public.quest_beat_transitions where to_quest_id = '11940000-0000-4000-8000-0000000000a1'), 0, 'a refused way wrote nothing');

-- Positive control: the kennels way.
select lives_ok(
  $$select public.mark_quest_move('11940000-0000-4000-8000-00000000000a'::uuid, '11940000-0000-4000-8000-0000000000a1'::uuid, pg_temp.main_thread(), 'route',
      p_edge_id => '11940000-0000-4000-8000-0000000000e6'::uuid, p_via => array['11940000-0000-4000-8000-0000000000b1', '11940000-0000-4000-8000-0000000000b2', '11940000-0000-4000-8000-0000000000b3', '11940000-0000-4000-8000-0000000000b5']::uuid[])$$,
  'a valid way is accepted'
);

select is(
  (select array_agg(to_beat_title order by seq) from public.quest_beat_transitions where to_quest_id = '11940000-0000-4000-8000-0000000000a1'),
  array['S', 'K1', 'K2', 'L', 'V'],
  'the thread was told the kennels way in order, then the route''s own target'
);
select is(
  (select count(*)::integer from public.quest_beat_transitions where to_quest_id = '11940000-0000-4000-8000-0000000000a1' and to_beat_id = '11940000-0000-4000-8000-0000000000b4'),
  0, 'the tunnel, the other way, was not filled in'
);
select is(
  (select provenance ->> 'edge_id' from public.quest_beat_transitions where to_quest_id = '11940000-0000-4000-8000-0000000000a1' and to_beat_id = '11940000-0000-4000-8000-0000000000b2'),
  '11940000-0000-4000-8000-0000000000e1', 'a filled-in step records the route it took'
);
select is(
  (select provenance ->> 'edge_id' from public.quest_beat_transitions where to_quest_id = '11940000-0000-4000-8000-0000000000a1' and to_beat_id = '11940000-0000-4000-8000-0000000000b5'),
  '11940000-0000-4000-8000-0000000000e3', 'and so does the lodge, by the kennels'' last route, not the tunnel''s'
);
select is(
  (select status from public.quest_objectives where id = '11940000-0000-4000-8000-0000000000c1'), 'pending',
  'the payoff on a filled-in route fired'
);
select is(
  (select status from public.quest_objectives where id = '11940000-0000-4000-8000-0000000000c2'), 'dormant',
  'and the other way''s payoff did not'
);

-- The tunnel way, on a fresh thread state: undo the move, then mark the other way.
select lives_ok($$select public.undo_quest_move('11940000-0000-4000-8000-00000000000a'::uuid, '11940000-0000-4000-8000-0000000000a1'::uuid, pg_temp.main_thread())$$, 'the move can be undone');
select lives_ok(
  $$select public.mark_quest_move('11940000-0000-4000-8000-00000000000a'::uuid, '11940000-0000-4000-8000-0000000000a1'::uuid, pg_temp.main_thread(), 'route',
      p_edge_id => '11940000-0000-4000-8000-0000000000e6'::uuid, p_via => array['11940000-0000-4000-8000-0000000000b1', '11940000-0000-4000-8000-0000000000b4', '11940000-0000-4000-8000-0000000000b5']::uuid[])$$,
  'the other way can be named instead'
);
select is(
  (select array_agg(to_beat_title order by seq) from public.quest_beat_transitions where to_quest_id = '11940000-0000-4000-8000-0000000000a1'),
  array['S', 'T', 'L', 'V'], 'and then the thread is told the tunnel way'
);

select * from finish();
rollback;
