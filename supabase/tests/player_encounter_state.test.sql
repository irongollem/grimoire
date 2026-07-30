begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('57000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue570-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('57000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue570-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('57000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue570-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('57000000-0000-4000-8000-000000000010', '57000000-0000-4000-8000-000000000001', 'Projection test');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('57000000-0000-4000-8000-000000000010', '57000000-0000-4000-8000-000000000002', 'player', 'Player');

insert into public.encounters (id, user_id, campaign_id, name)
values ('57000000-0000-4000-8000-000000000020', '57000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000010', 'Secret fight');

insert into public.npcs (
  id, user_id, campaign_id, name, portrait_url, portrait_focal_point,
  disguise_name, disguise_portrait_url, disguise_portrait_focal_point, is_revealed
) values (
  '57000000-0000-4000-8000-000000000030',
  '57000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000010',
  'Archmage Selene',
  'https://example.invalid/selene.webp',
  '{"x":20,"y":30}'::jsonb,
  'The Veiled One',
  'https://example.invalid/veiled.webp',
  '{"x":70,"y":40}'::jsonb,
  false
);

insert into public.encounter_state (
  id, encounter_id, campaign_id, user_id, is_running, current_round,
  active_combatant_index, combatants_live, started_at
) values (
  '57000000-0000-4000-8000-000000000040',
  '57000000-0000-4000-8000-000000000020',
  '57000000-0000-4000-8000-000000000010',
  '57000000-0000-4000-8000-000000000001',
  true,
  2,
  0,
  '[
    {"instance_id":"hidden-1","type":"monster","name":"Secret Dragon","faction_id":"enemy","initiative":30,"hp":200,"max_hp":200,"ac":"22","conditions":[],"curses":["secret"],"death_saves":{"successes":0,"failures":0},"dex_mod":4,"reveal_state":"hidden","portrait_url":"https://example.invalid/dragon.webp","legendary_actions_remaining":3,"position":{"x":1,"y":1},"footprint":4},
    {"instance_id":"unseen-1","type":"monster","name":"Invisible Assassin","faction_id":"enemy","initiative":20,"hp":80,"max_hp":80,"ac":"18","conditions":["Invisible"],"curses":[],"death_saves":{"successes":0,"failures":0},"dex_mod":5,"reveal_state":"unseen","portrait_url":"https://example.invalid/assassin.webp","monster_id":"57000000-0000-4000-8000-000000000099","position":{"x":2,"y":2},"footprint":1},
    {"instance_id":"npc-1","type":"monster","name":"Archmage Selene","faction_id":"enemy","initiative":15,"hp":50,"max_hp":50,"ac":"16","conditions":[],"curses":["DM secret"],"death_saves":{"successes":0,"failures":0},"dex_mod":2,"reveal_state":"revealed","portrait_url":"https://example.invalid/selene.webp","portrait_focal_point":{"x":20,"y":30},"npc_id":"57000000-0000-4000-8000-000000000030","def_id":"secret-def","legendary_action_cap":3,"reactionUsed":false,"position":{"x":3,"y":3},"footprint":1},
    {"instance_id":"player-1","type":"player","name":"Hero","faction_id":"party","initiative":10,"hp":25,"max_hp":25,"ac":"17","conditions":[],"curses":[],"death_saves":{"successes":0,"failures":0},"dex_mod":1,"party_member_id":"57000000-0000-4000-8000-000000000050","reveal_state":"revealed","position":{"x":4,"y":4},"footprint":1}
  ]'::jsonb,
  now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '57000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::integer from public.encounter_state where campaign_id = '57000000-0000-4000-8000-000000000010'),
  0,
  'campaign members cannot select the raw encounter state'
);

select is(
  (select count(*)::integer from public.get_player_encounter_state('57000000-0000-4000-8000-000000000010')),
  1,
  'campaign members can read the player-safe projection'
);

select is(
  (select jsonb_array_length(combatants_live) from public.get_player_encounter_state('57000000-0000-4000-8000-000000000010')),
  3,
  'hidden combatants are absent from the projection'
);

select is(
  (select combatant->>'name'
     from public.get_player_encounter_state('57000000-0000-4000-8000-000000000010') state,
          jsonb_array_elements(state.combatants_live) combatant
    where combatant->>'instance_id' = 'unseen-1'),
  '???',
  'unseen combatant identity is opaque'
);

select ok(
  (select not (combatant ? 'monster_id') and combatant->>'portrait_url' is null
     from public.get_player_encounter_state('57000000-0000-4000-8000-000000000010') state,
          jsonb_array_elements(state.combatants_live) combatant
    where combatant->>'instance_id' = 'unseen-1'),
  'unseen combatant source identity and portrait are stripped'
);

select is(
  (select combatant->>'name'
     from public.get_player_encounter_state('57000000-0000-4000-8000-000000000010') state,
          jsonb_array_elements(state.combatants_live) combatant
    where combatant->>'instance_id' = 'npc-1'),
  'The Veiled One',
  'concealed NPCs use their cover name'
);

select is(
  (select combatant->>'portrait_url'
     from public.get_player_encounter_state('57000000-0000-4000-8000-000000000010') state,
          jsonb_array_elements(state.combatants_live) combatant
    where combatant->>'instance_id' = 'npc-1'),
  'https://example.invalid/veiled.webp',
  'concealed NPCs use their cover portrait'
);

select ok(
  (select not (combatant ? 'def_id')
          and not (combatant ? 'legendary_action_cap')
          and not (combatant ? 'reactionUsed')
          and combatant->>'ac' = ''
          and combatant->'curses' = '[]'::jsonb
     from public.get_player_encounter_state('57000000-0000-4000-8000-000000000010') state,
          jsonb_array_elements(state.combatants_live) combatant
    where combatant->>'instance_id' = 'npc-1'),
  'DM-only combatant fields are stripped'
);

select is(
  (select active_combatant_instance_id from public.get_player_encounter_state('57000000-0000-4000-8000-000000000010')),
  null,
  'a hidden active combatant does not leak through the active-turn marker'
);

select is(
  (select count(*)::integer from public.encounter_state_player_updates
    where campaign_id = '57000000-0000-4000-8000-000000000010'),
  1,
  'campaign members can receive the metadata-only realtime signal'
);

reset role;
update public.npcs
set is_revealed = true
where id = '57000000-0000-4000-8000-000000000030';
set local role authenticated;
select set_config('request.jwt.claim.sub', '57000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select combatant->>'name'
     from public.get_player_encounter_state('57000000-0000-4000-8000-000000000010') state,
          jsonb_array_elements(state.combatants_live) combatant
    where combatant->>'instance_id' = 'npc-1'),
  'Archmage Selene',
  'revealing a disguise updates the projected identity without respawning the combatant'
);

select set_config('request.jwt.claim.sub', '57000000-0000-4000-8000-000000000003', true);
select is(
  (select count(*)::integer from public.get_player_encounter_state('57000000-0000-4000-8000-000000000010')),
  0,
  'non-members cannot read the projection'
);

select * from finish();
rollback;
