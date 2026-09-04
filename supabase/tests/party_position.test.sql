begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

-- Story #786 (epic #780). A member's effective position is derived: their
-- override if they have one, otherwise the campaign's. What this file pins is
-- that derivation and the backfill's predicate — not the one-time UPDATE in the
-- migration itself, which cannot be observed after `db reset` because seeding
-- follows migrations.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('78600000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'party-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.locations (id, user_id, campaign_id, name, location_type) values
  ('78600000-0000-4000-8000-000000000020', '78600000-0000-4000-8000-000000000001', null, 'Ilvaren Reach', 'region'),
  ('78600000-0000-4000-8000-000000000021', '78600000-0000-4000-8000-000000000001', null, 'The Sunken Vault', 'dungeon');

insert into public.campaigns (id, user_id, name, current_location_id)
values ('78600000-0000-4000-8000-000000000010', '78600000-0000-4000-8000-000000000001', 'Position', '78600000-0000-4000-8000-000000000020');

update public.locations set campaign_id = '78600000-0000-4000-8000-000000000010'
 where id in ('78600000-0000-4000-8000-000000000020', '78600000-0000-4000-8000-000000000021');

insert into public.party_members (id, user_id, campaign_id, name, current_location_id) values
  ('78600000-0000-4000-8000-000000000030', '78600000-0000-4000-8000-000000000001', '78600000-0000-4000-8000-000000000010', 'Follows the party', null),
  ('78600000-0000-4000-8000-000000000031', '78600000-0000-4000-8000-000000000001', '78600000-0000-4000-8000-000000000010', 'Scouting ahead',    '78600000-0000-4000-8000-000000000021'),
  ('78600000-0000-4000-8000-000000000032', '78600000-0000-4000-8000-000000000001', '78600000-0000-4000-8000-000000000010', 'Redundantly pinned', '78600000-0000-4000-8000-000000000020');

-- The derivation, expressed the way the client must express it.
create temporary view effective_position as
  select pm.id, coalesce(pm.current_location_id, c.current_location_id) as location_id
    from public.party_members pm
    join public.campaigns c on c.id = pm.campaign_id;

select is(
  (select location_id from effective_position where id = '78600000-0000-4000-8000-000000000030'),
  '78600000-0000-4000-8000-000000000020'::uuid,
  'a member with no override is wherever the party is'
);

select is(
  (select location_id from effective_position where id = '78600000-0000-4000-8000-000000000031'),
  '78600000-0000-4000-8000-000000000021'::uuid,
  'a member with an override is where the override says'
);

-- Moving the party is ONE write, and the follower comes along without being
-- touched. This is the whole point: nothing propagates, so nothing can drift.
update public.campaigns set current_location_id = '78600000-0000-4000-8000-000000000021'
 where id = '78600000-0000-4000-8000-000000000010';

select is(
  (select location_id from effective_position where id = '78600000-0000-4000-8000-000000000030'),
  '78600000-0000-4000-8000-000000000021'::uuid,
  'moving the party moves the follower, with no write to their row'
);

select is(
  (select current_location_id from public.party_members where id = '78600000-0000-4000-8000-000000000030'),
  null::uuid,
  'and the follower''s own row is still untouched'
);

-- The one that would be most costly to get wrong: a member left behind must not
-- be dragged along by the party moving.
update public.campaigns set current_location_id = '78600000-0000-4000-8000-000000000020'
 where id = '78600000-0000-4000-8000-000000000010';

select is(
  (select location_id from effective_position where id = '78600000-0000-4000-8000-000000000031'),
  '78600000-0000-4000-8000-000000000021'::uuid,
  'a member who stayed behind is not dragged along when the party moves'
);

-- The backfill's predicate, applied to this file's own fixtures: a stored
-- location equal to the campaign's is redundant, and nulling it loses nothing
-- because it derives to the same place. Anything else is a real override.
update public.party_members pm
   set current_location_id = null
  from public.campaigns c
 where pm.campaign_id = c.id
   and pm.current_location_id is not null
   and pm.current_location_id = c.current_location_id;

select results_eq(
  $$select id from public.party_members
     where campaign_id = '78600000-0000-4000-8000-000000000010' and current_location_id is not null$$,
  $$values ('78600000-0000-4000-8000-000000000031'::uuid)$$,
  'the backfill clears only redundant pins, never a real override'
);

select * from finish();
rollback;
