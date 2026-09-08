-- #797: a beat stages at a place — one column, campaign-scoped, and the
-- location_set attachment gone rather than deprecated.

begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

-- ── The deletion, asserted structurally ─────────────────────────────────────
--
-- Deliberately checking the constraint and the function body rather than only
-- the behaviour: #792 shipped a type that was gone from the client and still
-- live in the schema, and an outcome test would not have caught that.

select ok(
  position('location_set' in pg_get_constraintdef(oid)) = 0,
  'location_set is no longer an accepted attachment type'
) from pg_constraint where conname = 'quest_beat_attachments_attachment_type_check';

select ok(
  position('location_set' in lower(pg_get_functiondef('private.validate_quest_beat_attachment()'::regprocedure))) = 0,
  'the attachment validator has no location_set arm left'
);

select ok(
  position('room_ids' in lower(pg_get_functiondef('private.validate_quest_beat_attachment()'::regprocedure))) = 0,
  'room_ids validation went with it — the list was never enforceable'
);

select has_column('public', 'quest_beats', 'staged_at_location_id',
  'a beat carries the place it stages at');

select is(
  (select count(*)::integer from pg_constraint
    where conname = 'quest_beat_attachments_location_rooms_array'),
  0,
  'the room-id format CHECK went with the array it guarded'
);

-- ── Fixtures ────────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('79700000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue797-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('79700000-0000-4000-8000-000000000010', '79700000-0000-4000-8000-000000000001', 'Staging campaign'),
  ('79700000-0000-4000-8000-000000000011', '79700000-0000-4000-8000-000000000001', 'A different campaign');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('79700000-0000-4000-8000-000000000010', '79700000-0000-4000-8000-000000000001', 'dm', 'DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.quests (id, user_id, campaign_id, title)
values ('79700000-0000-4000-8000-000000000020', '79700000-0000-4000-8000-000000000001', '79700000-0000-4000-8000-000000000010', 'Staged quest');

-- One place in this campaign, one in another. A town on purpose: staging is not
-- restricted to sites, because production stages beats at towns and a lake.
insert into public.locations (id, user_id, campaign_id, name, location_type) values
  ('79700000-0000-4000-8000-000000000030', '79700000-0000-4000-8000-000000000001', '79700000-0000-4000-8000-000000000010', 'Good Mead', 'town'),
  ('79700000-0000-4000-8000-000000000031', '79700000-0000-4000-8000-000000000001', '79700000-0000-4000-8000-000000000011', 'Elsewhere', 'dungeon');

-- ── The guard ───────────────────────────────────────────────────────────────

select lives_ok($$
  insert into public.quest_beats (id, quest_id, campaign_id, title, kind, staged_at_location_id)
  values ('79700000-0000-4000-8000-000000000040', '79700000-0000-4000-8000-000000000020',
          '79700000-0000-4000-8000-000000000010', 'The summons', 'social',
          '79700000-0000-4000-8000-000000000030')
$$, 'a beat may stage at a place in its own campaign — including a town');

select lives_ok($$
  insert into public.quest_beats (id, quest_id, campaign_id, title, kind)
  values ('79700000-0000-4000-8000-000000000041', '79700000-0000-4000-8000-000000000020',
          '79700000-0000-4000-8000-000000000010', 'Somewhere unstated', 'social')
$$, 'staging is optional — most beats have no place');

select throws_ok($$
  insert into public.quest_beats (id, quest_id, campaign_id, title, kind, staged_at_location_id)
  values ('79700000-0000-4000-8000-000000000042', '79700000-0000-4000-8000-000000000020',
          '79700000-0000-4000-8000-000000000010', 'Trespass', 'social',
          '79700000-0000-4000-8000-000000000031')
$$, '23514', null,
   'a beat cannot stage at a place belonging to another campaign');

select throws_ok($$
  update public.quest_beats set staged_at_location_id = '79700000-0000-4000-8000-000000000031'
   where id = '79700000-0000-4000-8000-000000000041'
$$, '23514', null,
   'the guard covers UPDATE too, not only INSERT');

-- ── Losing the place unstages the beat rather than deleting it ──────────────

delete from public.locations where id = '79700000-0000-4000-8000-000000000030';

select is(
  (select staged_at_location_id from public.quest_beats where id = '79700000-0000-4000-8000-000000000040'),
  null,
  'deleting a location unstages its beats instead of taking them with it'
);

select * from finish();
rollback;
