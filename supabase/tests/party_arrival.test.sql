begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

-- Story #790 (epic #780). Arriving somewhere writes into #787's log rather
-- than a second history of its own, because "the party has been here" and
-- "this place is explored" are the same fact.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('79000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'arrival-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('79000000-0000-4000-8000-000000000010', '79000000-0000-4000-8000-000000000001', 'Arrivals');
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('79000000-0000-4000-8000-000000000010', '79000000-0000-4000-8000-000000000001', 'dm', 'DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.locations (id, user_id, campaign_id, name, location_type) values
  ('79000000-0000-4000-8000-000000000020', '79000000-0000-4000-8000-000000000001', '79000000-0000-4000-8000-000000000010', 'The Sunken Vault', 'dungeon'),
  ('79000000-0000-4000-8000-000000000021', '79000000-0000-4000-8000-000000000001', '79000000-0000-4000-8000-000000000010', 'The Drowned Chapel', 'dungeon');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"79000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- The very first move is from NULL, which is exactly the case `<>` would have
-- skipped: NULL <> 'x' is NULL, so the WHEN clause needs `is distinct from`.
update public.campaigns set current_location_id = '79000000-0000-4000-8000-000000000020'
 where id = '79000000-0000-4000-8000-000000000010';

select is(
  (select value from public.location_state
    where location_id = '79000000-0000-4000-8000-000000000020' and fact = 'explored'),
  true,
  'the first arrival, from no location at all, marks the place explored'
);

select is(
  (select asserted_note from public.location_state
    where location_id = '79000000-0000-4000-8000-000000000020' and fact = 'explored'),
  'The party arrived here',
  'and says why it was asserted, so it is distinguishable from a DM saying so'
);

-- Returning writes nothing: the log answers "has the party been here", and a
-- row per visit would bury the DM's own assertions under machine noise.
update public.campaigns set current_location_id = '79000000-0000-4000-8000-000000000021'
 where id = '79000000-0000-4000-8000-000000000010';
update public.campaigns set current_location_id = '79000000-0000-4000-8000-000000000020'
 where id = '79000000-0000-4000-8000-000000000010';

select is(
  (select count(*)::integer from public.location_state_events
    where location_id = '79000000-0000-4000-8000-000000000020' and fact = 'explored'),
  1,
  'returning somewhere already explored does not append again'
);

select is(
  (select count(*)::integer from public.location_state_events
    where location_id = '79000000-0000-4000-8000-000000000021' and fact = 'explored'),
  1,
  'but a new place does get its own arrival'
);

-- A DM explicitly taking it back is a statement, and walking back in should
-- record the return. This is why the guard reads the newest assertion rather
-- than merely checking that a row exists.
insert into public.location_state_events (user_id, location_id, fact, value, note)
values ('79000000-0000-4000-8000-000000000001', '79000000-0000-4000-8000-000000000020', 'explored', false, 'Actually we never got inside');

update public.campaigns set current_location_id = '79000000-0000-4000-8000-000000000021'
 where id = '79000000-0000-4000-8000-000000000010';
update public.campaigns set current_location_id = '79000000-0000-4000-8000-000000000020'
 where id = '79000000-0000-4000-8000-000000000010';

select is(
  (select value from public.location_state
    where location_id = '79000000-0000-4000-8000-000000000020' and fact = 'explored'),
  true,
  'after a DM un-explores a place, arriving again re-asserts it'
);

-- Moving to the same place is not an arrival; the WHEN clause must not fire.
update public.campaigns set current_location_id = '79000000-0000-4000-8000-000000000020'
 where id = '79000000-0000-4000-8000-000000000010';

select is(
  (select count(*)::integer from public.location_state_events
    where location_id = '79000000-0000-4000-8000-000000000020'),
  3,
  'a no-op update writes nothing'
);

select * from finish();
rollback;
