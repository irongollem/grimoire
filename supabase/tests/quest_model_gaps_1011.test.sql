-- #1011: what the quest model could not say while authoring Before the Count.
--
-- Cover for migration 20261007214426: clocks (ticked by the DM or by a rule, filling
-- one fires its rules, nobody writes `filled` directly), objective deadlines that fail
-- when the calendar moves past them, compound route gates (all / any, with a status
-- SET per condition), settled-is-final for rules, converge-all joins that wait for
-- threads that can still arrive rather than for authored routes, the move_npc /
-- add_companion / shift_faction_standing verbs with their undo, the calendar event
-- type fallback, and the party standing a player reads. Each refusal has a rightful
-- caller beside it (the DM ticks, the stranger and the player are refused).

begin;

create extension if not exists pgtap with schema extensions;
select plan(150);

set local grimoire.bypass_quota = 'on';

-- ── Fixture ─────────────────────────────────────────────────────────────────
-- u1 DM of c1, u2 player in c1, u3 stranger and DM of c2. One quest per scenario:
--   Q1 clocks  Q2/Q3 deadlines (active / completed)  Q4 gates  Q5 settled  Q6-Q10 converge
--   Q11 verbs, calendar event and factions

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('10110000-0000-4000-8000-100000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gaps1011-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10110000-0000-4000-8000-100000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gaps1011-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10110000-0000-4000-8000-100000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gaps1011-stranger@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name) values ('10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-100000000001', 'Gaps table'), ('10110000-0000-4000-8000-200000000002', '10110000-0000-4000-8000-100000000003', 'Stranger table');
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, ruleset) values ('10110000-0000-4000-8000-d00000000001', '10110000-0000-4000-8000-100000000002', '10110000-0000-4000-8000-100000000002', null, 'Gaps ranger', '2014');
insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-100000000001', 'dm', 'DM', null),
  ('10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-100000000002', 'player', 'Player', '10110000-0000-4000-8000-d00000000001'),
  ('10110000-0000-4000-8000-200000000002', '10110000-0000-4000-8000-100000000003', 'dm', 'Stranger', null)
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;
insert into public.quests (id, user_id, campaign_id, title, status) values ('10110000-0000-4000-8000-300000000001', '10110000-0000-4000-8000-100000000001', '10110000-0000-4000-8000-200000000001', 'Q1', 'active');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000001', '10110000-0000-4000-8000-300000000001', '10110000-0000-4000-8000-200000000001', 'B0');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000002', '10110000-0000-4000-8000-300000000001', '10110000-0000-4000-8000-200000000001', 'B1');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000001', '10110000-0000-4000-8000-300000000001', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000001', '10110000-0000-4000-8000-400000000002', 'choice', null, 'all');
insert into public.quest_objectives (id, quest_id, description, status, is_player_visible) values ('10110000-0000-4000-8000-600000000001', '10110000-0000-4000-8000-300000000001', 'O1', 'pending', false);
insert into public.quest_objectives (id, quest_id, description, status, is_player_visible) values ('10110000-0000-4000-8000-600000000002', '10110000-0000-4000-8000-300000000001', 'O2', 'pending', false);
insert into public.quest_clocks (id, campaign_id, quest_id, label, segments, filled) values ('10110000-0000-4000-8000-800000000001', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-300000000001', 'K1', 4, 0);
insert into public.quest_clocks (id, campaign_id, quest_id, label, segments, filled) values ('10110000-0000-4000-8000-800000000002', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-300000000001', 'K2', 3, 0);
insert into public.quest_consequences (quest_id, action, on_clock_id, target_objective_id, id) values ('10110000-0000-4000-8000-300000000001', 'fail', '10110000-0000-4000-8000-800000000001', '10110000-0000-4000-8000-600000000001', '10110000-0000-4000-8000-700000000001');
insert into public.quest_consequences (quest_id, action, on_beat_id, target_clock_id, action_payload, id) values ('10110000-0000-4000-8000-300000000001', 'tick_clock', '10110000-0000-4000-8000-400000000002', '10110000-0000-4000-8000-800000000002', '{"step": 3}'::jsonb, '10110000-0000-4000-8000-700000000002');
insert into public.quest_consequences (quest_id, action, on_clock_id, target_objective_id, id) values ('10110000-0000-4000-8000-300000000001', 'fail', '10110000-0000-4000-8000-800000000002', '10110000-0000-4000-8000-600000000002', '10110000-0000-4000-8000-700000000003');
insert into public.quests (id, user_id, campaign_id, title, status) values ('10110000-0000-4000-8000-300000000002', '10110000-0000-4000-8000-100000000001', '10110000-0000-4000-8000-200000000001', 'Q2', 'active');
insert into public.quests (id, user_id, campaign_id, title, status) values ('10110000-0000-4000-8000-300000000003', '10110000-0000-4000-8000-100000000001', '10110000-0000-4000-8000-200000000001', 'Q3', 'completed');
insert into public.quest_objectives (id, quest_id, description, status, is_player_visible, due_year, due_month, due_day) values ('10110000-0000-4000-8000-600000000003', '10110000-0000-4000-8000-300000000002', 'OD1', 'pending', false, 1495, 3, 14);
insert into public.quest_objectives (id, quest_id, description, status, is_player_visible, due_year, due_month, due_day) values ('10110000-0000-4000-8000-600000000004', '10110000-0000-4000-8000-300000000002', 'OD2', 'pending', false, 1495, 6, 1);
insert into public.quest_objectives (id, quest_id, description, status, is_player_visible, due_year, due_month, due_day) values ('10110000-0000-4000-8000-600000000005', '10110000-0000-4000-8000-300000000002', 'OD3', 'complete', false, 1495, 3, 1);
insert into public.quest_objectives (id, quest_id, description, status, is_player_visible) values ('10110000-0000-4000-8000-600000000006', '10110000-0000-4000-8000-300000000002', 'OD5', 'pending', false);
insert into public.quest_objectives (id, quest_id, description, status, is_player_visible, due_year, due_month, due_day) values ('10110000-0000-4000-8000-600000000007', '10110000-0000-4000-8000-300000000002', 'OD6', 'dormant', false, 1495, 3, 14);
insert into public.quest_objectives (id, quest_id, description, status, is_player_visible, due_year, due_month, due_day) values ('10110000-0000-4000-8000-600000000008', '10110000-0000-4000-8000-300000000003', 'OD4', 'pending', false, 1495, 3, 14);
insert into public.quest_consequences (quest_id, action, on_objective_id, on_objective_status, target_objective_id, id) values ('10110000-0000-4000-8000-300000000002', 'fail', '10110000-0000-4000-8000-600000000003', 'failed', '10110000-0000-4000-8000-600000000006', '10110000-0000-4000-8000-700000000004');
insert into public.quests (id, user_id, campaign_id, title, status) values ('10110000-0000-4000-8000-300000000004', '10110000-0000-4000-8000-100000000001', '10110000-0000-4000-8000-200000000001', 'Q4', 'active');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000003', '10110000-0000-4000-8000-300000000004', '10110000-0000-4000-8000-200000000001', 'G0');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000004', '10110000-0000-4000-8000-300000000004', '10110000-0000-4000-8000-200000000001', 'G1');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000005', '10110000-0000-4000-8000-300000000004', '10110000-0000-4000-8000-200000000001', 'G2');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000006', '10110000-0000-4000-8000-300000000004', '10110000-0000-4000-8000-200000000001', 'G3');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000007', '10110000-0000-4000-8000-300000000004', '10110000-0000-4000-8000-200000000001', 'G4');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000002', '10110000-0000-4000-8000-300000000004', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000003', '10110000-0000-4000-8000-400000000004', 'choice', null, 'all');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000003', '10110000-0000-4000-8000-300000000004', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000003', '10110000-0000-4000-8000-400000000005', 'choice', null, 'any');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000004', '10110000-0000-4000-8000-300000000004', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000003', '10110000-0000-4000-8000-400000000006', 'choice', null, 'all');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000005', '10110000-0000-4000-8000-300000000004', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000003', '10110000-0000-4000-8000-400000000007', 'choice', null, 'all');
insert into public.quest_objectives (id, quest_id, description, status, is_player_visible) values ('10110000-0000-4000-8000-600000000009', '10110000-0000-4000-8000-300000000004', 'OG1', 'pending', false);
insert into public.quest_objectives (id, quest_id, description, status, is_player_visible) values ('10110000-0000-4000-8000-600000000010', '10110000-0000-4000-8000-300000000004', 'OG2', 'pending', false);
insert into public.quest_objectives (id, quest_id, description, status, is_player_visible) values ('10110000-0000-4000-8000-600000000011', '10110000-0000-4000-8000-300000000004', 'OG3', 'dormant', false);
insert into public.quest_beat_edge_gates (id, edge_id, quest_id, campaign_id, objective_id, statuses) values ('10110000-0000-4000-8000-c00000000001', '10110000-0000-4000-8000-500000000002', '10110000-0000-4000-8000-300000000004', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-600000000009', array['complete']::text[]);
insert into public.quest_beat_edge_gates (id, edge_id, quest_id, campaign_id, objective_id, statuses) values ('10110000-0000-4000-8000-c00000000002', '10110000-0000-4000-8000-500000000002', '10110000-0000-4000-8000-300000000004', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-600000000010', array['complete']::text[]);
insert into public.quest_beat_edge_gates (id, edge_id, quest_id, campaign_id, objective_id, statuses) values ('10110000-0000-4000-8000-c00000000003', '10110000-0000-4000-8000-500000000003', '10110000-0000-4000-8000-300000000004', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-600000000009', array['complete']::text[]);
insert into public.quest_beat_edge_gates (id, edge_id, quest_id, campaign_id, objective_id, statuses) values ('10110000-0000-4000-8000-c00000000004', '10110000-0000-4000-8000-500000000003', '10110000-0000-4000-8000-300000000004', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-600000000010', array['complete']::text[]);
insert into public.quest_beat_edge_gates (id, edge_id, quest_id, campaign_id, objective_id, statuses) values ('10110000-0000-4000-8000-c00000000005', '10110000-0000-4000-8000-500000000004', '10110000-0000-4000-8000-300000000004', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-600000000011', array['dormant', 'pending']::text[]);
insert into public.quest_beat_edge_gates (id, edge_id, quest_id, campaign_id, objective_id, statuses) values ('10110000-0000-4000-8000-c00000000006', '10110000-0000-4000-8000-500000000005', '10110000-0000-4000-8000-300000000004', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-600000000009', array['complete']::text[]);
insert into public.quests (id, user_id, campaign_id, title, status) values ('10110000-0000-4000-8000-300000000005', '10110000-0000-4000-8000-100000000001', '10110000-0000-4000-8000-200000000001', 'Q5', 'active');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000008', '10110000-0000-4000-8000-300000000005', '10110000-0000-4000-8000-200000000001', 'SB');
insert into public.quest_objectives (id, quest_id, description, status, is_player_visible) values ('10110000-0000-4000-8000-600000000012', '10110000-0000-4000-8000-300000000005', 'S1', 'failed', false);
insert into public.quest_objectives (id, quest_id, description, status, is_player_visible) values ('10110000-0000-4000-8000-600000000013', '10110000-0000-4000-8000-300000000005', 'S2', 'complete', false);
insert into public.quest_objectives (id, quest_id, description, status, is_player_visible) values ('10110000-0000-4000-8000-600000000014', '10110000-0000-4000-8000-300000000005', 'S3', 'pending', false);
insert into public.quest_consequences (quest_id, action, on_beat_id, target_objective_id, id) values ('10110000-0000-4000-8000-300000000005', 'complete', '10110000-0000-4000-8000-400000000008', '10110000-0000-4000-8000-600000000012', '10110000-0000-4000-8000-700000000005');
insert into public.quest_consequences (quest_id, action, on_beat_id, target_objective_id, id) values ('10110000-0000-4000-8000-300000000005', 'fail', '10110000-0000-4000-8000-400000000008', '10110000-0000-4000-8000-600000000013', '10110000-0000-4000-8000-700000000006');
insert into public.quest_consequences (quest_id, action, on_objective_id, on_objective_status, target_objective_id, id) values ('10110000-0000-4000-8000-300000000005', 'fail', '10110000-0000-4000-8000-600000000012', 'failed', '10110000-0000-4000-8000-600000000014', '10110000-0000-4000-8000-700000000007');
insert into public.quests (id, user_id, campaign_id, title, status) values ('10110000-0000-4000-8000-300000000006', '10110000-0000-4000-8000-100000000001', '10110000-0000-4000-8000-200000000001', 'Q6', 'active');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000009', '10110000-0000-4000-8000-300000000006', '10110000-0000-4000-8000-200000000001', 'A');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000010', '10110000-0000-4000-8000-300000000006', '10110000-0000-4000-8000-200000000001', 'M1');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000011', '10110000-0000-4000-8000-300000000006', '10110000-0000-4000-8000-200000000001', 'M2');
insert into public.quest_beats (id, quest_id, campaign_id, title, converge_mode) values ('10110000-0000-4000-8000-400000000012', '10110000-0000-4000-8000-300000000006', '10110000-0000-4000-8000-200000000001', 'E', 'all');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000006', '10110000-0000-4000-8000-300000000006', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000009', '10110000-0000-4000-8000-400000000010', 'choice', null, 'all');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000007', '10110000-0000-4000-8000-300000000006', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000009', '10110000-0000-4000-8000-400000000011', 'choice', null, 'all');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000008', '10110000-0000-4000-8000-300000000006', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000010', '10110000-0000-4000-8000-400000000012', 'choice', null, 'all');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000009', '10110000-0000-4000-8000-300000000006', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000011', '10110000-0000-4000-8000-400000000012', 'choice', null, 'all');
insert into public.quest_objectives (id, quest_id, description, status, is_player_visible) values ('10110000-0000-4000-8000-600000000015', '10110000-0000-4000-8000-300000000006', 'OE', 'dormant', false);
insert into public.quest_consequences (quest_id, action, on_beat_id, target_objective_id, id) values ('10110000-0000-4000-8000-300000000006', 'reveal', '10110000-0000-4000-8000-400000000012', '10110000-0000-4000-8000-600000000015', '10110000-0000-4000-8000-700000000008');
insert into public.quests (id, user_id, campaign_id, title, status) values ('10110000-0000-4000-8000-300000000007', '10110000-0000-4000-8000-100000000001', '10110000-0000-4000-8000-200000000001', 'Q7', 'active');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000013', '10110000-0000-4000-8000-300000000007', '10110000-0000-4000-8000-200000000001', 'Q7F');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000014', '10110000-0000-4000-8000-300000000007', '10110000-0000-4000-8000-200000000001', 'Q7M');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000015', '10110000-0000-4000-8000-300000000007', '10110000-0000-4000-8000-200000000001', 'Q7P');
insert into public.quest_beats (id, quest_id, campaign_id, title, converge_mode) values ('10110000-0000-4000-8000-400000000016', '10110000-0000-4000-8000-300000000007', '10110000-0000-4000-8000-200000000001', 'Q7J', 'all');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000017', '10110000-0000-4000-8000-300000000007', '10110000-0000-4000-8000-200000000001', 'Q7X');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000010', '10110000-0000-4000-8000-300000000007', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000013', '10110000-0000-4000-8000-400000000014', 'choice', null, 'all');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000011', '10110000-0000-4000-8000-300000000007', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000013', '10110000-0000-4000-8000-400000000015', 'parallel', 'Side', 'all');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000012', '10110000-0000-4000-8000-300000000007', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000014', '10110000-0000-4000-8000-400000000016', 'choice', null, 'all');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000013', '10110000-0000-4000-8000-300000000007', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000015', '10110000-0000-4000-8000-400000000016', 'choice', null, 'all');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000014', '10110000-0000-4000-8000-300000000007', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000015', '10110000-0000-4000-8000-400000000017', 'choice', null, 'all');
insert into public.quest_objectives (id, quest_id, description, status, is_player_visible) values ('10110000-0000-4000-8000-600000000016', '10110000-0000-4000-8000-300000000007', 'Q7OJ', 'dormant', false);
insert into public.quest_consequences (quest_id, action, on_beat_id, target_objective_id, id) values ('10110000-0000-4000-8000-300000000007', 'reveal', '10110000-0000-4000-8000-400000000016', '10110000-0000-4000-8000-600000000016', '10110000-0000-4000-8000-700000000009');
insert into public.quests (id, user_id, campaign_id, title, status) values ('10110000-0000-4000-8000-300000000008', '10110000-0000-4000-8000-100000000001', '10110000-0000-4000-8000-200000000001', 'Q8', 'active');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000018', '10110000-0000-4000-8000-300000000008', '10110000-0000-4000-8000-200000000001', 'Q8F');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000019', '10110000-0000-4000-8000-300000000008', '10110000-0000-4000-8000-200000000001', 'Q8M');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000020', '10110000-0000-4000-8000-300000000008', '10110000-0000-4000-8000-200000000001', 'Q8P');
insert into public.quest_beats (id, quest_id, campaign_id, title, converge_mode) values ('10110000-0000-4000-8000-400000000021', '10110000-0000-4000-8000-300000000008', '10110000-0000-4000-8000-200000000001', 'Q8J', 'all');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000015', '10110000-0000-4000-8000-300000000008', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000018', '10110000-0000-4000-8000-400000000019', 'choice', null, 'all');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000016', '10110000-0000-4000-8000-300000000008', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000018', '10110000-0000-4000-8000-400000000020', 'parallel', 'Side', 'all');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000017', '10110000-0000-4000-8000-300000000008', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000019', '10110000-0000-4000-8000-400000000021', 'choice', null, 'all');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000018', '10110000-0000-4000-8000-300000000008', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000020', '10110000-0000-4000-8000-400000000021', 'choice', null, 'all');
insert into public.quest_objectives (id, quest_id, description, status, is_player_visible) values ('10110000-0000-4000-8000-600000000017', '10110000-0000-4000-8000-300000000008', 'Q8OJ', 'dormant', false);
insert into public.quest_consequences (quest_id, action, on_beat_id, target_objective_id, id) values ('10110000-0000-4000-8000-300000000008', 'reveal', '10110000-0000-4000-8000-400000000021', '10110000-0000-4000-8000-600000000017', '10110000-0000-4000-8000-700000000010');
insert into public.quests (id, user_id, campaign_id, title, status) values ('10110000-0000-4000-8000-300000000009', '10110000-0000-4000-8000-100000000001', '10110000-0000-4000-8000-200000000001', 'Q9', 'active');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000022', '10110000-0000-4000-8000-300000000009', '10110000-0000-4000-8000-200000000001', 'Q9F');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000023', '10110000-0000-4000-8000-300000000009', '10110000-0000-4000-8000-200000000001', 'Q9M');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000024', '10110000-0000-4000-8000-300000000009', '10110000-0000-4000-8000-200000000001', 'Q9P');
insert into public.quest_beats (id, quest_id, campaign_id, title, converge_mode) values ('10110000-0000-4000-8000-400000000025', '10110000-0000-4000-8000-300000000009', '10110000-0000-4000-8000-200000000001', 'Q9J', 'all');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000019', '10110000-0000-4000-8000-300000000009', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000022', '10110000-0000-4000-8000-400000000023', 'choice', null, 'all');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000020', '10110000-0000-4000-8000-300000000009', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000022', '10110000-0000-4000-8000-400000000024', 'parallel', 'Side', 'all');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000021', '10110000-0000-4000-8000-300000000009', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000023', '10110000-0000-4000-8000-400000000025', 'choice', null, 'all');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000022', '10110000-0000-4000-8000-300000000009', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000024', '10110000-0000-4000-8000-400000000025', 'choice', null, 'all');
insert into public.quest_objectives (id, quest_id, description, status, is_player_visible) values ('10110000-0000-4000-8000-600000000018', '10110000-0000-4000-8000-300000000009', 'Q9OJ', 'dormant', false);
insert into public.quest_consequences (quest_id, action, on_beat_id, target_objective_id, id) values ('10110000-0000-4000-8000-300000000009', 'reveal', '10110000-0000-4000-8000-400000000025', '10110000-0000-4000-8000-600000000018', '10110000-0000-4000-8000-700000000011');
insert into public.quests (id, user_id, campaign_id, title, status) values ('10110000-0000-4000-8000-300000000010', '10110000-0000-4000-8000-100000000001', '10110000-0000-4000-8000-200000000001', 'Q10', 'active');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000026', '10110000-0000-4000-8000-300000000010', '10110000-0000-4000-8000-200000000001', 'Q10F');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000027', '10110000-0000-4000-8000-300000000010', '10110000-0000-4000-8000-200000000001', 'Q10M');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000028', '10110000-0000-4000-8000-300000000010', '10110000-0000-4000-8000-200000000001', 'Q10P');
insert into public.quest_beats (id, quest_id, campaign_id, title, converge_mode) values ('10110000-0000-4000-8000-400000000029', '10110000-0000-4000-8000-300000000010', '10110000-0000-4000-8000-200000000001', 'Q10J', 'all');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000023', '10110000-0000-4000-8000-300000000010', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000026', '10110000-0000-4000-8000-400000000027', 'choice', null, 'all');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000024', '10110000-0000-4000-8000-300000000010', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000026', '10110000-0000-4000-8000-400000000028', 'parallel', 'Side', 'all');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000025', '10110000-0000-4000-8000-300000000010', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000027', '10110000-0000-4000-8000-400000000029', 'choice', null, 'all');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000026', '10110000-0000-4000-8000-300000000010', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000028', '10110000-0000-4000-8000-400000000029', 'choice', null, 'all');
insert into public.quest_objectives (id, quest_id, description, status, is_player_visible) values ('10110000-0000-4000-8000-600000000019', '10110000-0000-4000-8000-300000000010', 'Q10OJ', 'dormant', false);
insert into public.quest_consequences (quest_id, action, on_beat_id, target_objective_id, id) values ('10110000-0000-4000-8000-300000000010', 'reveal', '10110000-0000-4000-8000-400000000029', '10110000-0000-4000-8000-600000000019', '10110000-0000-4000-8000-700000000012');
insert into public.quests (id, user_id, campaign_id, title, status) values ('10110000-0000-4000-8000-300000000011', '10110000-0000-4000-8000-100000000001', '10110000-0000-4000-8000-200000000001', 'Q11', 'active');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000030', '10110000-0000-4000-8000-300000000011', '10110000-0000-4000-8000-200000000001', 'V0');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000031', '10110000-0000-4000-8000-300000000011', '10110000-0000-4000-8000-200000000001', 'V1');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000027', '10110000-0000-4000-8000-300000000011', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000030', '10110000-0000-4000-8000-400000000031', 'choice', null, 'all');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000032', '10110000-0000-4000-8000-300000000011', '10110000-0000-4000-8000-200000000001', 'V2');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000028', '10110000-0000-4000-8000-300000000011', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000030', '10110000-0000-4000-8000-400000000032', 'choice', null, 'all');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000033', '10110000-0000-4000-8000-300000000011', '10110000-0000-4000-8000-200000000001', 'V3');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000029', '10110000-0000-4000-8000-300000000011', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000030', '10110000-0000-4000-8000-400000000033', 'choice', null, 'all');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000034', '10110000-0000-4000-8000-300000000011', '10110000-0000-4000-8000-200000000001', 'V4');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000030', '10110000-0000-4000-8000-300000000011', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000030', '10110000-0000-4000-8000-400000000034', 'choice', null, 'all');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000035', '10110000-0000-4000-8000-300000000011', '10110000-0000-4000-8000-200000000001', 'V5');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000031', '10110000-0000-4000-8000-300000000011', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000030', '10110000-0000-4000-8000-400000000035', 'choice', null, 'all');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000036', '10110000-0000-4000-8000-300000000011', '10110000-0000-4000-8000-200000000001', 'V6');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000032', '10110000-0000-4000-8000-300000000011', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000030', '10110000-0000-4000-8000-400000000036', 'choice', null, 'all');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('10110000-0000-4000-8000-400000000037', '10110000-0000-4000-8000-300000000011', '10110000-0000-4000-8000-200000000001', 'V7');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id, route_kind, thread_label, gate_mode) values ('10110000-0000-4000-8000-500000000033', '10110000-0000-4000-8000-300000000011', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-400000000030', '10110000-0000-4000-8000-400000000037', 'choice', null, 'all');
insert into public.locations (id, user_id, campaign_id, name, location_type) values ('10110000-0000-4000-8000-a00000000001', '10110000-0000-4000-8000-100000000001', '10110000-0000-4000-8000-200000000001', 'Home', 'building'), ('10110000-0000-4000-8000-a00000000002', '10110000-0000-4000-8000-100000000001', '10110000-0000-4000-8000-200000000001', 'Away', 'building'), ('10110000-0000-4000-8000-a00000000003', '10110000-0000-4000-8000-100000000003', '10110000-0000-4000-8000-200000000002', 'Elsewhere', 'building');
insert into public.npcs (id, user_id, campaign_id, name, location_id, stat_block) values
  ('10110000-0000-4000-8000-900000000001', '10110000-0000-4000-8000-100000000001', '10110000-0000-4000-8000-200000000001', 'Mover', '10110000-0000-4000-8000-a00000000001', null),
  ('10110000-0000-4000-8000-900000000002', '10110000-0000-4000-8000-100000000001', '10110000-0000-4000-8000-200000000001', 'Drifter', null, null),
  ('10110000-0000-4000-8000-900000000003', '10110000-0000-4000-8000-100000000001', '10110000-0000-4000-8000-200000000001', 'Veteran', null, '{"hit_points": "45 (6d8 + 18)", "armor_class": "15 (chain mail)", "speed": "40 ft., fly 60 ft."}'::jsonb),
  ('10110000-0000-4000-8000-900000000004', '10110000-0000-4000-8000-100000000001', '10110000-0000-4000-8000-200000000001', 'Blank', null, null),
  ('10110000-0000-4000-8000-900000000005', '10110000-0000-4000-8000-100000000003', '10110000-0000-4000-8000-200000000002', 'Foreigner', null, null);
insert into public.factions (id, user_id, campaign_id, name, party_standing, player_visible_to) values
  ('10110000-0000-4000-8000-b00000000001', '10110000-0000-4000-8000-100000000001', '10110000-0000-4000-8000-200000000001', 'Order', 'unknown', '{}'),
  ('10110000-0000-4000-8000-b00000000002', '10110000-0000-4000-8000-100000000001', '10110000-0000-4000-8000-200000000001', 'Guild', 'indifferent', '{}'),
  ('10110000-0000-4000-8000-b00000000003', '10110000-0000-4000-8000-100000000001', '10110000-0000-4000-8000-200000000001', 'Cult', 'unknown', '{}'),
  ('10110000-0000-4000-8000-b00000000004', '10110000-0000-4000-8000-100000000001', '10110000-0000-4000-8000-200000000001', 'Watch', 'unfriendly', array['10110000-0000-4000-8000-d00000000001']::uuid[]);
insert into public.quest_consequences (quest_id, action, on_beat_id, target_npc_id, target_location_id, id) values ('10110000-0000-4000-8000-300000000011', 'move_npc', '10110000-0000-4000-8000-400000000031', '10110000-0000-4000-8000-900000000001', '10110000-0000-4000-8000-a00000000002', '10110000-0000-4000-8000-700000000013');
insert into public.quest_consequences (quest_id, action, on_beat_id, target_npc_id, target_location_id, id) values ('10110000-0000-4000-8000-300000000011', 'move_npc', '10110000-0000-4000-8000-400000000031', '10110000-0000-4000-8000-900000000002', '10110000-0000-4000-8000-a00000000002', '10110000-0000-4000-8000-700000000014');
-- A rule may not name another campaign's place or NPC at all (#1011 audit):
-- refused when written, so the run context can never resolve a foreign name.
select throws_ok($q$insert into public.quest_consequences (quest_id, action, on_beat_id, target_npc_id, target_location_id, id) values ('10110000-0000-4000-8000-300000000011', 'move_npc', '10110000-0000-4000-8000-400000000032', '10110000-0000-4000-8000-900000000001', '10110000-0000-4000-8000-a00000000003', '10110000-0000-4000-8000-700000000015')$q$, '23514', 'A quest rule can only name a place of its own campaign', 'a rule naming another campaign''s place is refused when written');
select throws_ok($q$insert into public.quest_consequences (quest_id, action, on_beat_id, target_npc_id, target_location_id, id) values ('10110000-0000-4000-8000-300000000011', 'move_npc', '10110000-0000-4000-8000-400000000032', '10110000-0000-4000-8000-900000000005', '10110000-0000-4000-8000-a00000000002', '10110000-0000-4000-8000-700000000016')$q$, '23514', 'A quest rule can only name an NPC of its own campaign', 'a rule naming another campaign''s NPC is refused when written');
insert into public.quest_consequences (quest_id, action, on_beat_id, target_npc_id, id) values ('10110000-0000-4000-8000-300000000011', 'add_companion', '10110000-0000-4000-8000-400000000033', '10110000-0000-4000-8000-900000000003', '10110000-0000-4000-8000-700000000017');
insert into public.quest_consequences (quest_id, action, on_beat_id, target_npc_id, id) values ('10110000-0000-4000-8000-300000000011', 'add_companion', '10110000-0000-4000-8000-400000000033', '10110000-0000-4000-8000-900000000004', '10110000-0000-4000-8000-700000000018');
insert into public.quest_consequences (quest_id, action, on_beat_id, target_faction_id, action_payload, id) values ('10110000-0000-4000-8000-300000000011', 'shift_faction_standing', '10110000-0000-4000-8000-400000000034', '10110000-0000-4000-8000-b00000000001', '{"to": "helpful"}'::jsonb, '10110000-0000-4000-8000-700000000019');
insert into public.quest_consequences (quest_id, action, on_beat_id, target_faction_id, action_payload, id) values ('10110000-0000-4000-8000-300000000011', 'shift_faction_standing', '10110000-0000-4000-8000-400000000035', '10110000-0000-4000-8000-b00000000002', '{"step": -2}'::jsonb, '10110000-0000-4000-8000-700000000020');
insert into public.quest_consequences (quest_id, action, on_beat_id, target_faction_id, action_payload, id) values ('10110000-0000-4000-8000-300000000011', 'shift_faction_standing', '10110000-0000-4000-8000-400000000035', '10110000-0000-4000-8000-b00000000003', '{"step": 1}'::jsonb, '10110000-0000-4000-8000-700000000021');
insert into public.quest_consequences (quest_id, action, on_beat_id, action_payload, id) values ('10110000-0000-4000-8000-300000000011', 'create_calendar_event', '10110000-0000-4000-8000-400000000036', '{"title": "Moot at dawn"}'::jsonb, '10110000-0000-4000-8000-700000000022');

-- ── Assertions ──────────────────────────────────────────────────────────────
set local role authenticated;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10110000-0000-4000-8000-100000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select public.tick_quest_clock('10110000-0000-4000-8000-800000000001') ->> 'filled'),
  '1', 'the DM ticks a clock one segment');

select is(
  (select public.tick_quest_clock('10110000-0000-4000-8000-800000000001', 1, 'again') ->> 'changed'),
  'true', 'a tick reports that it changed the clock');

select is(
  (select filled from public.quest_clocks where id = '10110000-0000-4000-8000-800000000001'),
  2, 'the clock now stands at two segments');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10110000-0000-4000-8000-100000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok($q$
  select public.tick_quest_clock('10110000-0000-4000-8000-800000000001')
$q$, 'P0001', 'Not authorized', 'a DM of another campaign cannot tick the clock');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10110000-0000-4000-8000-100000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok($q$
  select public.tick_quest_clock('10110000-0000-4000-8000-800000000001')
$q$, 'P0001', 'Not authorized', 'a player cannot tick the clock');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok($q$
  select public.tick_quest_clock('10110000-0000-4000-8000-800000000001')
$q$, 'P0001', 'Authentication required', 'an unauthenticated caller cannot tick the clock');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10110000-0000-4000-8000-100000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok($q$
  select public.tick_quest_clock('10110000-0000-4000-8000-800000000001', 0)
$q$, '22023', 'A tick needs a non-zero step', 'a zero step is refused');

select is(
  (select filled from public.quest_clocks where id = '10110000-0000-4000-8000-800000000001'),
  2, 'the refused ticks left the clock where it was');

select throws_ok($q$
  update public.quest_clocks set filled = 3 where id = '10110000-0000-4000-8000-800000000001'
$q$, '42501', null, 'a DM cannot write filled directly, only through a tick');

select lives_ok($q$
  update public.quest_clocks set label = 'Renamed clock' where id = '10110000-0000-4000-8000-800000000001'
$q$, 'a DM can still rename a clock');

select is(
  (select label from public.quest_clocks where id = '10110000-0000-4000-8000-800000000001'),
  'Renamed clock', 'the rename landed');

select lives_ok($q$
  insert into public.quest_clocks (id, campaign_id, quest_id, label, segments, sort_order) values ('10110000-0000-4000-8000-800000000003', '10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-300000000001', 'Fresh', 6, 2)
$q$, 'a DM can add a clock to their quest');

select is(
  (select public.tick_quest_clock('10110000-0000-4000-8000-800000000001', 2) ->> 'filled_up'),
  'true', 'filling the last segments reports the clock filled up');

select is(
  (select status from public.quest_objectives where id = '10110000-0000-4000-8000-600000000001'),
  'failed', 'a filled clock fired its rule: the objective failed');

select is(
  (select count(*)::integer from public.quest_beat_transitions where to_quest_id = '10110000-0000-4000-8000-300000000001' and transition_kind = 'assert' and provenance ->> 'clock_id' = '10110000-0000-4000-8000-800000000001'),
  1, 'the fill is logged as one assert transition naming the clock');

select is(
  (select public.tick_quest_clock('10110000-0000-4000-8000-800000000001') ->> 'changed'),
  'false', 'ticking a full clock changes nothing');

select is(
  (select public.tick_quest_clock('10110000-0000-4000-8000-800000000003', -9) ->> 'filled'),
  '0', 'a negative tick clamps at zero');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000001', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000001' and label = 'Main'), p_command => 'start', p_expected_version => 0, p_target_beat_id => '10110000-0000-4000-8000-400000000001')
$q$, 'Main starts at B0');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000001', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000001' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000001' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000001' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000001')
$q$, 'Main advances onto the beat whose rule ticks a clock');

select is(
  (select filled from public.quest_clocks where id = '10110000-0000-4000-8000-800000000002'),
  3, 'the tick_clock rule filled the clock');

select is(
  (select status from public.quest_objectives where id = '10110000-0000-4000-8000-600000000002'),
  'failed', 'the filled clock''s own rule cascaded in the same transition');

select is(
  (select count(distinct transition_id)::integer from public.quest_consequence_events where consequence_id in ('10110000-0000-4000-8000-700000000002', '10110000-0000-4000-8000-700000000003')),
  1, 'both the tick and the cascade belong to the one arrival transition');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000001', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000001' and label = 'Main'), p_command => 'previous', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000001' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000001' and label = 'Main')))
$q$, 'Main steps back from the beat');

select is(
  (select filled from public.quest_clocks where id = '10110000-0000-4000-8000-800000000002'),
  0, 'previous restores the clock fill');

select is(
  (select status from public.quest_objectives where id = '10110000-0000-4000-8000-600000000002'),
  'pending', 'previous restores the objective the clock rule failed');

select lives_ok($q$
  update public.campaigns set current_year = 1495, current_month = 3, current_day = 14 where id = '10110000-0000-4000-8000-200000000001'
$q$, 'the DM moves the date to the due day');

select is(
  (select status from public.quest_objectives where id = '10110000-0000-4000-8000-600000000003'),
  'pending', 'an objective is not failed on its due day');

select lives_ok($q$
  update public.campaigns set current_year = 1495, current_month = 3, current_day = 15 where id = '10110000-0000-4000-8000-200000000001'
$q$, 'the DM moves the date past the due date');

select is(
  (select status from public.quest_objectives where id = '10110000-0000-4000-8000-600000000003'),
  'failed', 'a pending objective past its due date fails');

select is(
  (select status from public.quest_objectives where id = '10110000-0000-4000-8000-600000000004'),
  'pending', 'an objective due later is untouched');

select is(
  (select status from public.quest_objectives where id = '10110000-0000-4000-8000-600000000005'),
  'complete', 'a complete objective is never failed by its deadline');

select is(
  (select status from public.quest_objectives where id = '10110000-0000-4000-8000-600000000007'),
  'dormant', 'a dormant objective is not failed by its deadline');

select is(
  (select status from public.quest_objectives where id = '10110000-0000-4000-8000-600000000008'),
  'pending', 'a non-active quest''s objective is untouched');

select is(
  (select count(*)::integer from public.quest_beat_transitions where to_quest_id = '10110000-0000-4000-8000-300000000002' and transition_kind = 'assert' and reason = 'Deadline passed' and provenance ->> 'deadline' = 'true'),
  1, 'the overdue objectives fail under one ''Deadline passed'' assert transition');

select is(
  (select count(*)::integer from public.quest_beat_transitions where to_quest_id = '10110000-0000-4000-8000-300000000003' and reason = 'Deadline passed'),
  0, 'the non-active quest gets no deadline transition');

select is(
  (select status from public.quest_objectives where id = '10110000-0000-4000-8000-600000000006'),
  'failed', 'the failed objective rule cascaded');

select lives_ok($q$
  update public.campaigns set current_year = 1495, current_month = 1, current_day = 1 where id = '10110000-0000-4000-8000-200000000001'
$q$, 'the DM winds the calendar back');

select is(
  (select count(*)::integer from public.quest_beat_transitions where to_quest_id = '10110000-0000-4000-8000-300000000002' and reason = 'Deadline passed'),
  1, 'moving the date backward writes no transition');

select is(
  (select status from public.quest_objectives where id = '10110000-0000-4000-8000-600000000004'),
  'pending', 'moving the date backward fails nothing');

select is(
  (select status from public.quest_objectives where id = '10110000-0000-4000-8000-600000000003'),
  'failed', 'moving the date backward un-fails nothing');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000004', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main'), p_command => 'start', p_expected_version => 0, p_target_beat_id => '10110000-0000-4000-8000-400000000003')
$q$, 'Main starts at G0');

select is(
  (select o -> 'gate' from jsonb_array_elements(public.get_quest_runtime_context('10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-300000000004', (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')) -> 'outgoing') o where o ->> 'edge_id' = '10110000-0000-4000-8000-500000000002') ->> 'mode',
  'all', 'the all-gate reports its mode');

select is(
  (select o -> 'gate' from jsonb_array_elements(public.get_quest_runtime_context('10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-300000000004', (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')) -> 'outgoing') o where o ->> 'edge_id' = '10110000-0000-4000-8000-500000000002') ->> 'is_open',
  'false', 'an all-gate with two unmet conditions is closed');

select is(
  jsonb_array_length((select o -> 'gate' from jsonb_array_elements(public.get_quest_runtime_context('10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-300000000004', (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')) -> 'outgoing') o where o ->> 'edge_id' = '10110000-0000-4000-8000-500000000002') -> 'conditions'),
  2, 'the all-gate carries both conditions');

select is(
  (select o -> 'gate' from jsonb_array_elements(public.get_quest_runtime_context('10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-300000000004', (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')) -> 'outgoing') o where o ->> 'edge_id' = '10110000-0000-4000-8000-500000000002') -> 'conditions' -> 0 ->> 'objective',
  'OG1', 'a condition names its objective');

select is(
  (select o -> 'gate' from jsonb_array_elements(public.get_quest_runtime_context('10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-300000000004', (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')) -> 'outgoing') o where o ->> 'edge_id' = '10110000-0000-4000-8000-500000000002') -> 'conditions' -> 0 -> 'statuses',
  '["complete"]'::jsonb, 'a condition carries its status set');

select is(
  (select o -> 'gate' from jsonb_array_elements(public.get_quest_runtime_context('10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-300000000004', (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')) -> 'outgoing') o where o ->> 'edge_id' = '10110000-0000-4000-8000-500000000002') -> 'conditions' -> 0 ->> 'current_status',
  'pending', 'a condition reports the objective''s current status');

select is(
  (select o -> 'gate' from jsonb_array_elements(public.get_quest_runtime_context('10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-300000000004', (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')) -> 'outgoing') o where o ->> 'edge_id' = '10110000-0000-4000-8000-500000000002') -> 'conditions' -> 0 ->> 'met',
  'false', 'an unmet condition says so');

select is(
  (select o -> 'gate' from jsonb_array_elements(public.get_quest_runtime_context('10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-300000000004', (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')) -> 'outgoing') o where o ->> 'edge_id' = '10110000-0000-4000-8000-500000000003') ->> 'mode',
  'any', 'the any-gate reports its mode');

select is(
  (select o -> 'gate' from jsonb_array_elements(public.get_quest_runtime_context('10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-300000000004', (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')) -> 'outgoing') o where o ->> 'edge_id' = '10110000-0000-4000-8000-500000000003') ->> 'is_open',
  'false', 'an any-gate with nothing met is closed');

select throws_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000004', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000004' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000002')
$q$, '23514', 'That route needs "OG1" to be complete, and "OG2" to be complete; now "OG1" is pending, "OG2" is pending', 'a closed all-gate refuses with every condition named');

select throws_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000004', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000004' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000003')
$q$, '23514', 'That route needs "OG1" to be complete, or "OG2" to be complete; now "OG1" is pending, "OG2" is pending', 'a closed any-gate joins its conditions with or');

select throws_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000004', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000004' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000005')
$q$, '23514', 'That route needs "OG1" to be complete, and it is pending', 'a one-condition gate keeps the single-condition message');

select is(
  (select o -> 'gate' from jsonb_array_elements(public.get_quest_runtime_context('10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-300000000004', (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')) -> 'outgoing') o where o ->> 'edge_id' = '10110000-0000-4000-8000-500000000004') ->> 'is_open',
  'true', 'a status set that includes dormant is met by a dormant objective');

select is(
  (select o -> 'gate' from jsonb_array_elements(public.get_quest_runtime_context('10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-300000000004', (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')) -> 'outgoing') o where o ->> 'edge_id' = '10110000-0000-4000-8000-500000000004') -> 'conditions' -> 0 -> 'statuses',
  '["dormant", "pending"]'::jsonb, 'the dormant status set is reported whole');

select lives_ok($q$
  select public.assert_quest_objective_status('10110000-0000-4000-8000-600000000011', 'complete', 'the oath is kept')
$q$, 'the DM settles the dormant objective');

select is(
  (select o -> 'gate' from jsonb_array_elements(public.get_quest_runtime_context('10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-300000000004', (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')) -> 'outgoing') o where o ->> 'edge_id' = '10110000-0000-4000-8000-500000000004') ->> 'is_open',
  'false', 'the gate closes once the objective leaves its status set');

select throws_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000004', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000004' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000004')
$q$, '23514', 'That route needs "OG3" to be dormant or pending, and it is complete', 'the message joins a status set with or');

select lives_ok($q$
  select public.assert_quest_objective_status('10110000-0000-4000-8000-600000000009', 'complete', 'the vault opens')
$q$, 'the DM completes the first condition');

select is(
  (select o -> 'gate' from jsonb_array_elements(public.get_quest_runtime_context('10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-300000000004', (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')) -> 'outgoing') o where o ->> 'edge_id' = '10110000-0000-4000-8000-500000000002') ->> 'is_open',
  'false', 'an all-gate stays closed while one condition is unmet');

select is(
  (select o -> 'gate' from jsonb_array_elements(public.get_quest_runtime_context('10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-300000000004', (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')) -> 'outgoing') o where o ->> 'edge_id' = '10110000-0000-4000-8000-500000000002') -> 'conditions' -> 0 ->> 'met',
  'true', 'the met condition says so');

select is(
  (select o -> 'gate' from jsonb_array_elements(public.get_quest_runtime_context('10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-300000000004', (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')) -> 'outgoing') o where o ->> 'edge_id' = '10110000-0000-4000-8000-500000000003') ->> 'is_open',
  'true', 'an any-gate opens as soon as one condition is met');

select throws_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000004', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000004' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000002')
$q$, '23514', null, 'the all-gate still refuses with half its conditions met');

select lives_ok($q$
  select public.assert_quest_objective_status('10110000-0000-4000-8000-600000000010', 'complete', 'the beacon burns')
$q$, 'the DM completes the second condition');

select is(
  (select o -> 'gate' from jsonb_array_elements(public.get_quest_runtime_context('10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-300000000004', (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')) -> 'outgoing') o where o ->> 'edge_id' = '10110000-0000-4000-8000-500000000002') ->> 'is_open',
  'true', 'an all-gate opens once every condition is met');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000004', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000004' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000002')
$q$, 'Main walks the opened all-gate');

select is(
  (select current_beat_id from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000004' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000004' and label = 'Main')),
  '10110000-0000-4000-8000-400000000004'::uuid, 'Main stands at the gated beat');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000005', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000005' and label = 'Main'), p_command => 'start', p_expected_version => 0, p_target_beat_id => '10110000-0000-4000-8000-400000000008')
$q$, 'Main starts at the beat whose rules try to settle settled objectives');

select is(
  (select status from public.quest_objectives where id = '10110000-0000-4000-8000-600000000012'),
  'failed', 'a complete rule leaves a failed objective failed');

select is(
  (select status from public.quest_objectives where id = '10110000-0000-4000-8000-600000000013'),
  'complete', 'a fail rule leaves a complete objective complete');

select is(
  (select status from public.quest_objectives where id = '10110000-0000-4000-8000-600000000014'),
  'pending', 'a rule that changed nothing did not seed the cascade');

select is(
  (select count(*)::integer from public.quest_consequence_events where consequence_id = '10110000-0000-4000-8000-700000000007'),
  0, 'the rule watching the no-op never fired');

select lives_ok($q$
  select public.assert_quest_objective_status('10110000-0000-4000-8000-600000000012', 'complete', 'the DM overrules')
$q$, 'the DM can assert over a failed objective');

select is(
  (select status from public.quest_objectives where id = '10110000-0000-4000-8000-600000000012'),
  'complete', 'the DM assert still changes a settled objective');

select lives_ok($q$
  select public.assert_quest_objective_status('10110000-0000-4000-8000-600000000013', 'failed', 'and back')
$q$, 'the DM can assert over a complete objective');

select is(
  (select status from public.quest_objectives where id = '10110000-0000-4000-8000-600000000013'),
  'failed', 'the DM assert changes it the other way too');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000006', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000006' and label = 'Main'), p_command => 'start', p_expected_version => 0, p_target_beat_id => '10110000-0000-4000-8000-400000000009')
$q$, 'Main starts at A');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000006', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000006' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000006' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000006' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000006')
$q$, 'Main takes the first ending route');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000006', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000006' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000006' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000006' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000008')
$q$, 'Main arrives at the converge-all ending');

select is(
  (select status from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000006' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000006' and label = 'Main')),
  'running', 'a lone thread runs straight through an ending with several incoming routes');

select is(
  (select status from public.quest_threads where id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000006' and label = 'Main')),
  'live', 'and its thread stays live');

select is(
  (select status from public.quest_objectives where id = '10110000-0000-4000-8000-600000000015'),
  'pending', 'the ending''s rules fired on arrival');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000007', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000007' and label = 'Main'), p_command => 'start', p_expected_version => 0, p_target_beat_id => '10110000-0000-4000-8000-400000000013')
$q$, 'Main starts at the fork');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000007', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000007' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000007' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000007' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000010', p_spawn_edge_ids => array['10110000-0000-4000-8000-500000000011']::uuid[])
$q$, 'Main advances and spawns the side thread');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000007', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000007' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000007' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000007' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000012')
$q$, 'Main reaches the join while the side thread could still arrive');

select is(
  (select status from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000007' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000007' and label = 'Main')),
  'waiting', 'the join parks Main while a live thread can still reach it');

select is(
  (select status from public.quest_threads where id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000007' and label = 'Main')),
  'waiting', 'and the thread record says waiting');

select is(
  (select status from public.quest_objectives where id = '10110000-0000-4000-8000-600000000016'),
  'dormant', 'the join''s rules wait for the merge');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000007', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000007' and label = 'Side'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000007' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000007' and label = 'Side')), p_edge_id => '10110000-0000-4000-8000-500000000014')
$q$, 'The side thread walks somewhere the join cannot be reached from');

select is(
  (select status from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000007' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000007' and label = 'Main')),
  'running', 'Main is released once nothing can reach the join');

select is(
  (select status from public.quest_threads where id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000007' and label = 'Main')),
  'live', 'and its thread is live again');

select is(
  (select status from public.quest_objectives where id = '10110000-0000-4000-8000-600000000016'),
  'pending', 'the join''s rules fired on release');

select is(
  (select count(*)::integer from public.quest_consequence_events where consequence_id = '10110000-0000-4000-8000-700000000009'),
  1, 'the join''s rule fired exactly once');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000008', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000008' and label = 'Main'), p_command => 'start', p_expected_version => 0, p_target_beat_id => '10110000-0000-4000-8000-400000000018')
$q$, 'Main starts at the fork');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000008', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000008' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000008' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000008' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000015', p_spawn_edge_ids => array['10110000-0000-4000-8000-500000000016']::uuid[])
$q$, 'Main advances and spawns the side thread');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000008', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000008' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000008' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000008' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000017')
$q$, 'Main reaches the join first');

select is(
  (select status from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000008' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000008' and label = 'Main')),
  'waiting', 'Main waits at the join');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000008', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000008' and label = 'Side'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000008' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000008' and label = 'Side')), p_edge_id => '10110000-0000-4000-8000-500000000018')
$q$, 'The side thread arrives too');

select is(
  (select status from public.quest_threads where id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000008' and label = 'Main')),
  'live', 'the earliest arrival survives as the live thread');

select is(
  (select status from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000008' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000008' and label = 'Main')),
  'running', 'and runs on');

select is(
  (select status from public.quest_threads where id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000008' and label = 'Side')),
  'merged', 'the later arrival is merged');

select is(
  (select merged_into_thread_id from public.quest_threads where id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000008' and label = 'Side')),
  (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000008' and label = 'Main'), 'the merged thread points at the survivor');

select is(
  (select count(*)::integer from public.quest_consequence_events where consequence_id = '10110000-0000-4000-8000-700000000010'),
  1, 'the join''s rule fired once for the merge');

select is(
  (select status from public.quest_objectives where id = '10110000-0000-4000-8000-600000000017'),
  'pending', 'the join''s objective moved');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000009', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000009' and label = 'Main'), p_command => 'start', p_expected_version => 0, p_target_beat_id => '10110000-0000-4000-8000-400000000022')
$q$, 'Main starts at the fork');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000009', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000009' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000009' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000009' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000019', p_spawn_edge_ids => array['10110000-0000-4000-8000-500000000020']::uuid[])
$q$, 'Main advances and spawns the side thread');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000009', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000009' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000009' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000009' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000021')
$q$, 'Main reaches the join');

select is(
  (select status from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000009' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000009' and label = 'Main')),
  'waiting', 'Main waits for the side thread');

select lives_ok($q$
  select public.close_quest_thread('10110000-0000-4000-8000-200000000001', '10110000-0000-4000-8000-300000000009', (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000009' and label = 'Side'), 'abandoned')
$q$, 'the DM closes the thread the join was waiting on');

select is(
  (select status from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000009' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000009' and label = 'Main')),
  'running', 'closing the blocking thread releases the join');

select is(
  (select count(*)::integer from public.quest_consequence_events where consequence_id = '10110000-0000-4000-8000-700000000011'),
  1, 'the join''s rule fired once');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000010', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000010' and label = 'Main'), p_command => 'start', p_expected_version => 0, p_target_beat_id => '10110000-0000-4000-8000-400000000026')
$q$, 'Main starts at the fork');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000010', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000010' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000010' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000010' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000023')
$q$, 'Main takes the single route, never spawning the parallel one');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000010', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000010' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000010' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000010' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000025')
$q$, 'Main reaches the join');

select is(
  (select status from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000010' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000010' and label = 'Main')),
  'running', 'a parallel route that was never spawned does not block the join');

select is(
  (select status from public.quest_objectives where id = '10110000-0000-4000-8000-600000000019'),
  'pending', 'the join''s rules fired on arrival');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000011', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main'), p_command => 'start', p_expected_version => 0, p_target_beat_id => '10110000-0000-4000-8000-400000000030')
$q$, 'Main starts at V0');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000011', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000011' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000027')
$q$, 'Main reaches the beat that moves NPCs');

select is(
  (select location_id from public.npcs where id = '10110000-0000-4000-8000-900000000001'),
  '10110000-0000-4000-8000-a00000000002'::uuid, 'move_npc moves the NPC to the place');

select is(
  (select location_id from public.npcs where id = '10110000-0000-4000-8000-900000000002'),
  '10110000-0000-4000-8000-a00000000002'::uuid, 'move_npc places an NPC that had no location');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000011', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main'), p_command => 'previous', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000011' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main')))
$q$, 'Main steps back');

select is(
  (select location_id from public.npcs where id = '10110000-0000-4000-8000-900000000001'),
  '10110000-0000-4000-8000-a00000000001'::uuid, 'previous returns the NPC to their old place');

select is(
  (select location_id from public.npcs where id = '10110000-0000-4000-8000-900000000002'),
  null::uuid, 'previous restores a null location too');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000011', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000011' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000028')
$q$, 'Main reaches the beat with cross-campaign moves');

select is(
  (select location_id from public.npcs where id = '10110000-0000-4000-8000-900000000001'),
  '10110000-0000-4000-8000-a00000000001'::uuid, 'a move into another campaign''s place does nothing');

select is(
  (select location_id from public.npcs where id = '10110000-0000-4000-8000-900000000005'),
  null::uuid, 'a move of another campaign''s NPC does nothing');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000011', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main'), p_command => 'previous', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000011' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main')))
$q$, 'Main steps back');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000011', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000011' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000029')
$q$, 'Main reaches the beat that adds companions');

select is(
  (select count(*)::integer from public.companions where campaign_id = '10110000-0000-4000-8000-200000000001'),
  2, 'add_companion files one companion per rule');

select is(
  (select source_type::text from public.companions where source_npc_id = '10110000-0000-4000-8000-900000000003'),
  'npc', 'the companion remembers its NPC');

select is(
  (select name from public.companions where source_npc_id = '10110000-0000-4000-8000-900000000003'),
  'Veteran', 'the companion takes the NPC name');

select is(
  (select array[max_hp, current_hp, ac, speed] from public.companions where source_npc_id = '10110000-0000-4000-8000-900000000003'),
  array[45, 45, 15, 40], 'the companion''s stats are the leading digits of the stat block');

select is(
  (select array[max_hp, current_hp, ac, speed] from public.companions where source_npc_id = '10110000-0000-4000-8000-900000000004'),
  array[1, 1, 10, 30], 'an NPC without a stat block gets the defaults');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000011', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main'), p_command => 'previous', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000011' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main')))
$q$, 'Main steps back');

select is(
  (select count(*)::integer from public.companions where campaign_id = '10110000-0000-4000-8000-200000000001'),
  0, 'previous deletes the companions the rules added');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000011', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000011' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000030')
$q$, 'Main reaches the beat that shifts a faction');

select is(
  (select party_standing::text from public.factions where id = '10110000-0000-4000-8000-b00000000001'),
  'helpful', 'shift_faction_standing sets a stance outright');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000011', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main'), p_command => 'previous', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000011' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main')))
$q$, 'Main steps back');

select is(
  (select party_standing::text from public.factions where id = '10110000-0000-4000-8000-b00000000001'),
  'unknown', 'previous restores the faction standing');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000011', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000011' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000031')
$q$, 'Main reaches the beat that steps standing');

select is(
  (select party_standing::text from public.factions where id = '10110000-0000-4000-8000-b00000000002'),
  'hostile', 'a step moves standing along the ladder');

select is(
  (select party_standing::text from public.factions where id = '10110000-0000-4000-8000-b00000000003'),
  'unknown', 'a step does nothing from unknown');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000011', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main'), p_command => 'previous', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000011' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main')))
$q$, 'Main steps back');

select is(
  (select party_standing::text from public.factions where id = '10110000-0000-4000-8000-b00000000002'),
  'indifferent', 'previous restores a stepped standing');

select throws_ok($q$
  insert into public.quest_consequences (quest_id, on_beat_id, action, target_npc_id) values ('10110000-0000-4000-8000-300000000011', '10110000-0000-4000-8000-400000000037', 'move_npc', '10110000-0000-4000-8000-900000000001')
$q$, '23514', null, 'a move_npc rule without a destination is rejected');

select lives_ok($q$
  select public.transition_quest_runtime(p_campaign_id => '10110000-0000-4000-8000-200000000001', p_quest_id => '10110000-0000-4000-8000-300000000011', p_thread_id => (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main'), p_command => 'advance', p_expected_version => (select version from public.quest_runtime_state where quest_id = '10110000-0000-4000-8000-300000000011' and thread_id = (select id from public.quest_threads where quest_id = '10110000-0000-4000-8000-300000000011' and label = 'Main')), p_edge_id => '10110000-0000-4000-8000-500000000032')
$q$, 'Main reaches the beat that files a calendar event');

select is(
  (select event_type from public.calendar_events where linked_quest_id = '10110000-0000-4000-8000-300000000011'),
  'quest', 'a calendar rule without an event type files it under quest');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10110000-0000-4000-8000-100000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select party_standing::text from public.get_player_visible_factions('10110000-0000-4000-8000-200000000001') where id = '10110000-0000-4000-8000-b00000000004'),
  'unfriendly', 'players see the party standing with a faction they can see');

reset role;
select * from finish();
rollback;
