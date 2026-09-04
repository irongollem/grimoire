begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

-- Story #788 (epic #780). The table's whole value is that the database, not a
-- trigger and not the client, enforces what a placement is: exactly one target,
-- each a real foreign key, and no duplicate of the same entry in one room.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('78800000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'placements-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name)
values ('78800000-0000-4000-8000-000000000010', '78800000-0000-4000-8000-000000000001', 'Placements');
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('78800000-0000-4000-8000-000000000010', '78800000-0000-4000-8000-000000000001', 'dm', 'DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.locations (id, user_id, campaign_id, name, location_type) values
  ('78800000-0000-4000-8000-000000000020', '78800000-0000-4000-8000-000000000001', '78800000-0000-4000-8000-000000000010', 'The Sunken Vault', 'dungeon');
insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type) values
  ('78800000-0000-4000-8000-000000000021', '78800000-0000-4000-8000-000000000001', '78800000-0000-4000-8000-000000000010', '78800000-0000-4000-8000-000000000020', 'Reliquary', 'room'),
  ('78800000-0000-4000-8000-000000000022', '78800000-0000-4000-8000-000000000001', '78800000-0000-4000-8000-000000000010', '78800000-0000-4000-8000-000000000020', 'Flooded Nave', 'room');

insert into public.traps (id, user_id, campaign_id, name)
values ('78800000-0000-4000-8000-000000000030', '78800000-0000-4000-8000-000000000001', '78800000-0000-4000-8000-000000000010', 'Needle lock');
-- dungeon_features carry no campaign_id at all — user-scoped catalogue content.
-- Placing one is exactly why this is a join rather than a column on the entry.
insert into public.dungeon_features (id, user_id, name)
values ('78800000-0000-4000-8000-000000000031', '78800000-0000-4000-8000-000000000001', 'Collapsing floor');

-- ── the exclusive arc ───────────────────────────────────────────────────────

select lives_ok(
  $$insert into public.location_placements (id, user_id, location_id, trap_id, note)
    values ('78800000-0000-4000-8000-000000000040', '78800000-0000-4000-8000-000000000001', '78800000-0000-4000-8000-000000000021', '78800000-0000-4000-8000-000000000030', 'On the sealed reliquary')$$,
  'a placement naming exactly one target is accepted'
);

select throws_ok(
  $$insert into public.location_placements (user_id, location_id)
    values ('78800000-0000-4000-8000-000000000001', '78800000-0000-4000-8000-000000000021')$$,
  '23514',
  null,
  'a placement naming no target is rejected'
);

select throws_ok(
  $$insert into public.location_placements (user_id, location_id, trap_id, dungeon_feature_id)
    values ('78800000-0000-4000-8000-000000000001', '78800000-0000-4000-8000-000000000021',
            '78800000-0000-4000-8000-000000000030', '78800000-0000-4000-8000-000000000031')$$,
  '23514',
  null,
  'a placement naming two targets is rejected'
);

-- ── reuse is the point; duplication is the mistake ──────────────────────────

select lives_ok(
  $$insert into public.location_placements (user_id, location_id, trap_id)
    values ('78800000-0000-4000-8000-000000000001', '78800000-0000-4000-8000-000000000022', '78800000-0000-4000-8000-000000000030')$$,
  'the same trap may be placed in a second room'
);

select throws_ok(
  $$insert into public.location_placements (user_id, location_id, trap_id)
    values ('78800000-0000-4000-8000-000000000001', '78800000-0000-4000-8000-000000000021', '78800000-0000-4000-8000-000000000030')$$,
  '23505',
  null,
  'the same trap may not be placed twice in one room'
);

-- A different kind in the same room is not a duplicate — the uniques are
-- partial and per-kind, which a single composite unique would get wrong.
select lives_ok(
  $$insert into public.location_placements (user_id, location_id, dungeon_feature_id)
    values ('78800000-0000-4000-8000-000000000001', '78800000-0000-4000-8000-000000000021', '78800000-0000-4000-8000-000000000031')$$,
  'a feature and a trap may share a room'
);

-- ── real foreign keys, so deletes cascade without a trigger ─────────────────

select throws_ok(
  $$insert into public.location_placements (user_id, location_id, trap_id)
    values ('78800000-0000-4000-8000-000000000001', '78800000-0000-4000-8000-000000000021', '78800000-0000-4000-8000-000000000099')$$,
  '23503',
  null,
  'a placement cannot name a trap that does not exist'
);

delete from public.traps where id = '78800000-0000-4000-8000-000000000030';
select is(
  (select count(*)::integer from public.location_placements where trap_id = '78800000-0000-4000-8000-000000000030'),
  0,
  'deleting the trap removes every placement of it'
);

delete from public.locations where id = '78800000-0000-4000-8000-000000000021';
select is(
  (select count(*)::integer from public.location_placements where location_id = '78800000-0000-4000-8000-000000000021'),
  0,
  'deleting the room removes what was placed in it'
);

select * from finish();
rollback;
