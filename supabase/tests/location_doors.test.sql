begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

-- Story #785 (epic #780). A door is a *room to room* connection inside one
-- site. The guard is the whole point: without it a "door" could join two rooms
-- in different dungeons, or a room to a continent, and every consumer would
-- have to re-derive what a valid connection is — the hole that
-- quest_beat_attachments.metadata.room_ids left by validating only existence.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('78500000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'doors-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name)
values ('78500000-0000-4000-8000-000000000010', '78500000-0000-4000-8000-000000000001', 'Doors');
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('78500000-0000-4000-8000-000000000010', '78500000-0000-4000-8000-000000000001', 'dm', 'DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.locations (id, user_id, campaign_id, name, location_type) values
  ('78500000-0000-4000-8000-000000000020', '78500000-0000-4000-8000-000000000001', '78500000-0000-4000-8000-000000000010', 'The Sunken Vault', 'dungeon'),
  ('78500000-0000-4000-8000-000000000021', '78500000-0000-4000-8000-000000000001', '78500000-0000-4000-8000-000000000010', 'The Drowned Chapel', 'dungeon');
insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type) values
  ('78500000-0000-4000-8000-000000000030', '78500000-0000-4000-8000-000000000001', '78500000-0000-4000-8000-000000000010', '78500000-0000-4000-8000-000000000020', 'Flooded Nave', 'room'),
  ('78500000-0000-4000-8000-000000000031', '78500000-0000-4000-8000-000000000001', '78500000-0000-4000-8000-000000000010', '78500000-0000-4000-8000-000000000020', 'Reliquary', 'room'),
  ('78500000-0000-4000-8000-000000000032', '78500000-0000-4000-8000-000000000001', '78500000-0000-4000-8000-000000000010', '78500000-0000-4000-8000-000000000021', 'Far Vestry', 'room');

select lives_ok(
  $$insert into public.location_doors (id, user_id, from_location_id, to_location_id, label)
    values ('78500000-0000-4000-8000-000000000040', '78500000-0000-4000-8000-000000000001',
            '78500000-0000-4000-8000-000000000030', '78500000-0000-4000-8000-000000000031', 'stair down')$$,
  'two rooms in one site may be connected'
);

select throws_ok(
  $$insert into public.location_doors (user_id, from_location_id, to_location_id, label)
    values ('78500000-0000-4000-8000-000000000001',
            '78500000-0000-4000-8000-000000000030', '78500000-0000-4000-8000-000000000032', 'impossible')$$,
  '23514',
  null,
  'a door may not span two different sites'
);

select throws_ok(
  $$insert into public.location_doors (user_id, from_location_id, to_location_id, label)
    values ('78500000-0000-4000-8000-000000000001',
            '78500000-0000-4000-8000-000000000030', '78500000-0000-4000-8000-000000000020', 'up')$$,
  '23514',
  null,
  'a door may not connect a room to its own site'
);

select throws_ok(
  $$insert into public.location_doors (user_id, from_location_id, to_location_id, label)
    values ('78500000-0000-4000-8000-000000000001',
            '78500000-0000-4000-8000-000000000030', '78500000-0000-4000-8000-000000000030', 'ouroboros')$$,
  '23514',
  null,
  'a door may not connect a room to itself'
);

-- Two rooms can genuinely have two connections — a main door and a secret
-- passage — so the pair alone is not unique; the label separates them.
select lives_ok(
  $$insert into public.location_doors (user_id, from_location_id, to_location_id, label, is_secret)
    values ('78500000-0000-4000-8000-000000000001',
            '78500000-0000-4000-8000-000000000030', '78500000-0000-4000-8000-000000000031', 'hidden crawlspace', true)$$,
  'a second, differently-labelled connection between the same rooms is allowed'
);

select throws_ok(
  $$insert into public.location_doors (user_id, from_location_id, to_location_id, label)
    values ('78500000-0000-4000-8000-000000000001',
            '78500000-0000-4000-8000-000000000030', '78500000-0000-4000-8000-000000000031', 'stair down')$$,
  '23505',
  null,
  'the same labelled connection cannot be created twice'
);

-- Authored prep, not play state: the defaults must describe a plain open door,
-- so a DM who sets nothing gets nothing surprising.
select results_eq(
  $$select is_one_way, starts_locked, is_secret from public.location_doors
     where id = '78500000-0000-4000-8000-000000000040'$$,
  $$values (false, false, false)$$,
  'a door defaults to two-way, unlocked and not secret'
);

delete from public.locations where id = '78500000-0000-4000-8000-000000000031';
select is(
  (select count(*)::integer from public.location_doors
    where from_location_id = '78500000-0000-4000-8000-000000000030'),
  0,
  'removing a room removes the doors that led to it'
);

select * from finish();
rollback;
