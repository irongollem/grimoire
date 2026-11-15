-- #1201: a fight row counts its writes, so a writer can tell that the row changed under it.
--
--   1 DM   2 player seated on the character pm (token "p-<pm>")
--
-- The count must rise for every writer (the DM's own update, a player's token move through the definer RPC), must
-- not be settable by the writer, and must make a write on a stale count change nothing. The last assertion is the
-- positive control: the same conditional write on the current count goes through.

begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('12010000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'fight-version-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 2) as n;

insert into public.campaigns (id, user_id, name, game_system) values
  ('12010000-0000-4000-8000-0000000000c1', '12010000-0000-4000-8000-000000000001', 'Fight version', 'dnd5e-2014');

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, ruleset) values
  ('12010000-0000-4000-8000-0000000000e1', '12010000-0000-4000-8000-000000000002', '12010000-0000-4000-8000-000000000002',
   '12010000-0000-4000-8000-0000000000c1', 'Aria', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('12010000-0000-4000-8000-0000000000c1', '12010000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('12010000-0000-4000-8000-0000000000c1', '12010000-0000-4000-8000-000000000002', 'player', 'Player', '12010000-0000-4000-8000-0000000000e1')
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

insert into public.encounters (id, user_id, campaign_id, name) values
  ('12010000-0000-4000-8000-0000000000d1', '12010000-0000-4000-8000-000000000001', '12010000-0000-4000-8000-0000000000c1', 'Version fight');

insert into public.encounter_state (id, encounter_id, campaign_id, user_id, is_running, current_round, active_combatant_index, combatants_live) values
  ('12010000-0000-4000-8000-0000000000f1', '12010000-0000-4000-8000-0000000000d1', '12010000-0000-4000-8000-0000000000c1',
   '12010000-0000-4000-8000-000000000001', true, 1, 0,
   '[{"instance_id":"p-12010000-0000-4000-8000-0000000000e1","type":"player","name":"Aria","faction_id":"players","initiative":12,"hp":10,"max_hp":10,"ac":"14","conditions":[],"curses":[],"death_saves":{"successes":0,"failures":0},"dex_mod":2,"party_member_id":"12010000-0000-4000-8000-0000000000e1"}]'::jsonb);

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"12010000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

create function pg_temp.fight() returns text language sql security definer as $$
  select version::text || '|round ' || current_round::text || '|' || coalesce(combatants_live->0->'position'->>'x', '-')
  from public.encounter_state where id = '12010000-0000-4000-8000-0000000000f1';
$$;

select is(pg_temp.fight(), '0|round 1|-', 'a new fight starts at version 0');

-- ── The DM's own write ─────────────────────────────────────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user(1);

update public.encounter_state set current_round = 2 where id = '12010000-0000-4000-8000-0000000000f1';
select is(pg_temp.fight(), '1|round 2|-', 'an update by the DM raises the version by one');

-- ── A writer cannot choose the number ──────────────────────────────────────────────────────────────────────────────
update public.encounter_state set current_round = 3, version = 99 where id = '12010000-0000-4000-8000-0000000000f1';
select is(pg_temp.fight(), '2|round 3|-', 'a version sent by the writer is ignored: the count comes from the stored row');

-- ── A player's token move counts too ───────────────────────────────────────────────────────────────────────────────
select pg_temp.as_user(2);
select lives_ok($$
  select public.update_combatant_position('12010000-0000-4000-8000-0000000000f1',
    'p-12010000-0000-4000-8000-0000000000e1', '{"x": 4, "y": 5}'::jsonb)
$$, 'a player may move their own token');
select is(pg_temp.fight(), '3|round 3|4', 'the move through the definer RPC raises the version, so a roster write made on the old count will notice');

-- ── A write on a stale count changes nothing ───────────────────────────────────────────────────────────────────────
select pg_temp.as_user(1);
with stale as (
  update public.encounter_state set current_round = 9
  where id = '12010000-0000-4000-8000-0000000000f1' and version = 2
  returning 1
)
select is((select count(*)::int from stale), 0, 'a write that read version 2 changes no row once the token move made it 3');
select is(pg_temp.fight(), '3|round 3|4', 'and the fight is as the token move left it');

-- ── The same write on the current count goes through (positive control) ────────────────────────────────────────────
with fresh as (
  update public.encounter_state set current_round = 4
  where id = '12010000-0000-4000-8000-0000000000f1' and version = 3
  returning 1
)
select is((select count(*)::int from fresh) || '|' || pg_temp.fight(), '1|4|round 4|4',
  'a write on the count it read goes through and raises it again');

reset role;
select * from finish();
rollback;
