-- #1021 row 13 (the maintainer's decision, 21 Nov 2026): a creature that took the Hide action and has not been found is
-- not on the players' screens. `get_player_encounter_state` leaves out a non-player combatant holding the Hidden
-- condition, and keeps a party member who hides (same side) and a creature that is revealed and not hiding.
begin;
set constraints all immediate;

create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('10213000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hidden-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10213000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hidden-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('10213000-0000-4000-8000-000000000010', '10213000-0000-4000-8000-000000000001', 'Hiding test');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('10213000-0000-4000-8000-000000000010', '10213000-0000-4000-8000-000000000002', 'player', 'Player');

insert into public.encounters (id, user_id, campaign_id, name)
values ('10213000-0000-4000-8000-000000000020', '10213000-0000-4000-8000-000000000001', '10213000-0000-4000-8000-000000000010', 'Ambush');

insert into public.encounter_state (id, encounter_id, campaign_id, user_id, is_running, current_round, active_combatant_index, combatants_live, started_at)
values (
  '10213000-0000-4000-8000-000000000040', '10213000-0000-4000-8000-000000000020', '10213000-0000-4000-8000-000000000010',
  '10213000-0000-4000-8000-000000000001', true, 1, 0,
  '[
    {"instance_id":"kobold-hid","type":"monster","name":"Kobold","faction_id":"enemy","initiative":18,"hp":5,"max_hp":5,"ac":"12","conditions":[{"name":"Hidden","stealth":17}],"curses":[],"death_saves":{"successes":0,"failures":0},"dex_mod":2,"reveal_state":"revealed","position":{"x":1,"y":1}},
    {"instance_id":"kobold-seen","type":"monster","name":"Kobold","faction_id":"enemy","initiative":12,"hp":5,"max_hp":5,"ac":"12","conditions":[{"name":"Prone"}],"curses":[],"death_saves":{"successes":0,"failures":0},"dex_mod":2,"reveal_state":"revealed","position":{"x":2,"y":2}},
    {"instance_id":"rogue","type":"player","name":"Tam","faction_id":"party","initiative":10,"hp":20,"max_hp":20,"ac":"14","conditions":[{"name":"Hidden","stealth":19}],"curses":[],"death_saves":{"successes":0,"failures":0},"dex_mod":3,"reveal_state":"revealed","position":{"x":3,"y":3}}
  ]'::jsonb,
  now()
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10213000-0000-4000-8000-000000000002","role":"authenticated"}', true);

create temp view seen as
  select combatant->>'instance_id' as instance_id
    from public.get_player_encounter_state('10213000-0000-4000-8000-000000000010') state,
         jsonb_array_elements(state.combatants_live) combatant;

select ok(not exists (select 1 from seen where instance_id = 'kobold-hid'), 'a hiding creature is not sent to the players');
select ok(exists (select 1 from seen where instance_id = 'kobold-seen'), 'a creature that is not hiding is still sent');
select ok(exists (select 1 from seen where instance_id = 'rogue'), 'a party member who hides is still on the players'' screens');
-- The hiding kobold held the first initiative slot: with it left out, the projection names no active combatant rather than a wrong one.
select is((select active_combatant_index from public.get_player_encounter_state('10213000-0000-4000-8000-000000000010')), -1,
  'the turn of a hiding creature shows as nobody''s, not as the next creature''s');

select * from finish();
rollback;
