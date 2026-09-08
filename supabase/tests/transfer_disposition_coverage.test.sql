begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

-- Issue #801. `transfer_campaign_ownership` already asked the outgoing owner
-- what should happen to their campaign-scoped originals — promote, reassign or
-- delete — and that mechanism was right. It covered two of the eight
-- dual-scoped tables: monsters and traps, the two it also clones.
--
-- The other six were left pointing at a campaign their author no longer owns,
-- which is #630's state and, because those FKs are NO ACTION, aborts the new
-- owner's account deletion later with a 23503 and no route forward.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('80100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hand-out@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('80100000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hand-in@example.invalid',  '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('80100000-0000-4000-8000-000000000010', '80100000-0000-4000-8000-000000000001', 'Handover');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('80100000-0000-4000-8000-000000000010', '80100000-0000-4000-8000-000000000001', 'dm', 'Outgoing'),
  ('80100000-0000-4000-8000-000000000010', '80100000-0000-4000-8000-000000000002', 'dm', 'Incoming')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- One row in each of the six kinds the disposition used to miss, all scoped to
-- the campaign about to change hands.
insert into public.puzzle_rooms (id, user_id, campaign_id, name)
values ('80100000-0000-4000-8000-000000000020', '80100000-0000-4000-8000-000000000001', '80100000-0000-4000-8000-000000000010', 'Their puzzle');
insert into public.dungeon_maps (id, user_id, campaign_id, name, layers, metadata)
values ('80100000-0000-4000-8000-000000000021', '80100000-0000-4000-8000-000000000001', '80100000-0000-4000-8000-000000000010', 'Their map', '{}'::jsonb, '{}'::jsonb);
insert into public.dungeon_features (id, user_id, campaign_id, name)
values ('80100000-0000-4000-8000-000000000022', '80100000-0000-4000-8000-000000000001', '80100000-0000-4000-8000-000000000010', 'Their feature');
-- And one the INCOMING owner already had scoped here: they keep it, because
-- they still own the campaign afterwards.
insert into public.dungeon_features (id, user_id, campaign_id, name)
values ('80100000-0000-4000-8000-000000000023', '80100000-0000-4000-8000-000000000002', '80100000-0000-4000-8000-000000000010', 'The incoming owner''s own');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"80100000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.transfer_campaign_ownership(
      '80100000-0000-4000-8000-000000000010',
      '80100000-0000-4000-8000-000000000002',
      false, 'promote', null)$$,
  'the transfer completes'
);

reset role;

-- Puzzles are NOT dispositioned, and must not be: the transfer hands them over
-- wholesale (`set user_id = p_new_owner_id`), along with quests, notes,
-- locations and thirty-odd others. They change hands rather than being
-- stranded, so there is nothing to release.
select is(
  (select user_id from public.puzzle_rooms where id = '80100000-0000-4000-8000-000000000020'),
  '80100000-0000-4000-8000-000000000002'::uuid,
  'a puzzle changes hands with the campaign rather than being dispositioned'
);

select is(
  (select campaign_id from public.dungeon_maps where id = '80100000-0000-4000-8000-000000000021'),
  null::uuid,
  'a Cartographer map is released — which is what makes "maps stay with the outgoing DM" true rather than merely stated'
);

select is(
  (select campaign_id from public.dungeon_features where id = '80100000-0000-4000-8000-000000000022'),
  null::uuid,
  'a dungeon feature is released'
);

select is(
  (select campaign_id from public.dungeon_features where id = '80100000-0000-4000-8000-000000000023'),
  '80100000-0000-4000-8000-000000000010'::uuid,
  'but the incoming owner''s own scoped work stays scoped'
);

-- The consequence that made this a bug rather than an untidiness. With the
-- previous owner's rows released, nothing foreign points at the campaign, so
-- the new owner can dispose of it without the NO ACTION check aborting.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"80100000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$select public.delete_campaign_with_homebrew('80100000-0000-4000-8000-000000000010', 'delete')$$,
  'and the new owner can later delete the campaign without tripping the FK'
);

select * from finish();
rollback;
