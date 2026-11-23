-- A token cannot move while the fight waits for a Reaction (#1021, 20261123233319).
--
--   1 DM   2 player seated on the character pm (token "p-<pm>")
--
-- The paused creature turn is replayed from the fight as it stood, so a move during the wait would change the turn the
-- player was asked about. Both the DM and the player are refused while `pending_reaction` is set; the positive control
-- is the same move going through once it is cleared.

begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('11230000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'token-wait-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 2) as n;

insert into public.campaigns (id, user_id, name, game_system) values
  ('11230000-0000-4000-8000-0000000000c1', '11230000-0000-4000-8000-000000000001', 'Token wait', 'dnd5e-2014');

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, ruleset) values
  ('11230000-0000-4000-8000-0000000000e1', '11230000-0000-4000-8000-000000000002', '11230000-0000-4000-8000-000000000002',
   '11230000-0000-4000-8000-0000000000c1', 'Aria', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('11230000-0000-4000-8000-0000000000c1', '11230000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('11230000-0000-4000-8000-0000000000c1', '11230000-0000-4000-8000-000000000002', 'player', 'Player', '11230000-0000-4000-8000-0000000000e1')
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

insert into public.encounters (id, user_id, campaign_id, name) values
  ('11230000-0000-4000-8000-0000000000d1', '11230000-0000-4000-8000-000000000001', '11230000-0000-4000-8000-0000000000c1', 'Wait fight');

insert into public.encounter_state (id, encounter_id, campaign_id, user_id, is_running, current_round, active_combatant_index, combatants_live, pending_reaction) values
  ('11230000-0000-4000-8000-0000000000f1', '11230000-0000-4000-8000-0000000000d1', '11230000-0000-4000-8000-0000000000c1',
   '11230000-0000-4000-8000-000000000001', true, 1, 0,
   '[{"instance_id":"p-11230000-0000-4000-8000-0000000000e1","type":"player","name":"Aria","faction_id":"players","initiative":12,"hp":10,"max_hp":10,"ac":"14","conditions":[],"curses":[],"death_saves":{"successes":0,"failures":0},"dex_mod":2,"party_member_id":"11230000-0000-4000-8000-0000000000e1"}]'::jsonb,
   '{"offer":{"kind":"shield"}}'::jsonb);

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"11230000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

set local role authenticated;

select pg_temp.as_user(2);
select throws_ok($$
  select public.update_combatant_position('11230000-0000-4000-8000-0000000000f1',
    'p-11230000-0000-4000-8000-0000000000e1', '{"x": 4, "y": 5}'::jsonb)
$$, 'P0001', 'The fight is waiting for a reaction.', 'a player cannot move their token while a Reaction waits');

select pg_temp.as_user(1);
select throws_ok($$
  select public.update_combatant_position('11230000-0000-4000-8000-0000000000f1',
    'p-11230000-0000-4000-8000-0000000000e1', '{"x": 4, "y": 5}'::jsonb)
$$, 'P0001', 'The fight is waiting for a reaction.', 'nor can the DM move any token');

reset role;
update public.encounter_state set pending_reaction = null where id = '11230000-0000-4000-8000-0000000000f1';
set local role authenticated;

select pg_temp.as_user(2);
select lives_ok($$
  select public.update_combatant_position('11230000-0000-4000-8000-0000000000f1',
    'p-11230000-0000-4000-8000-0000000000e1', '{"x": 4, "y": 5}'::jsonb)
$$, 'once nothing waits, the same move goes through');

reset role;
select is((select combatants_live->0->'position'->>'x' from public.encounter_state where id = '11230000-0000-4000-8000-0000000000f1'),
  '4', 'and the token is where it was moved');

select * from finish();
rollback;
