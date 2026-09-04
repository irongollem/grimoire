begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

-- Story #789 (epic #780). The column is the easy half. The half that breaks
-- things silently is the disposition: NO ACTION on the FK means any delete path
-- that skips `delete_campaign_with_homebrew` fails on the constraint instead of
-- quietly cascading or promoting — so a column added without a branch here does
-- not fail at migration time, or in any test that never deletes a campaign. It
-- fails months later, in front of a DM.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('78900000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'maps-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('78900000-0000-4000-8000-000000000010', '78900000-0000-4000-8000-000000000001', 'Doomed'),
  ('78900000-0000-4000-8000-000000000011', '78900000-0000-4000-8000-000000000001', 'Survivor');

insert into public.dungeon_maps (id, user_id, name, campaign_id, layers, metadata) values
  ('78900000-0000-4000-8000-000000000020', '78900000-0000-4000-8000-000000000001', 'Scoped to the doomed one', '78900000-0000-4000-8000-000000000010', '{}'::jsonb, '{}'::jsonb),
  ('78900000-0000-4000-8000-000000000021', '78900000-0000-4000-8000-000000000001', 'Universal crypt',          null,                                   '{}'::jsonb, '{}'::jsonb),
  ('78900000-0000-4000-8000-000000000022', '78900000-0000-4000-8000-000000000001', 'Other campaign''s',        '78900000-0000-4000-8000-000000000011', '{}'::jsonb, '{}'::jsonb);

-- Null is the default and means "every campaign", so nothing drawn before this
-- migration silently acquires an intent its author never expressed.
-- Scoped to this file's fixtures: seed.sql is a dump of real data and already
-- contains maps of its own, so an unscoped count here measures the seed.
select is(
  (select count(*)::integer from public.dungeon_maps
    where campaign_id is null
      and id in ('78900000-0000-4000-8000-000000000020',
                 '78900000-0000-4000-8000-000000000021',
                 '78900000-0000-4000-8000-000000000022')),
  1,
  'a map with no campaign is universal, not orphaned'
);

-- ── the FK refuses to guess ─────────────────────────────────────────────────
-- This is the guarantee the whole design rests on: deleting the campaign
-- directly must fail rather than cascade or promote.
select throws_ok(
  $$delete from public.campaigns where id = '78900000-0000-4000-8000-000000000010'$$,
  '23503',
  null,
  'deleting a campaign out from under a scoped map is refused'
);

-- ── promote ─────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"78900000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.delete_campaign_with_homebrew('78900000-0000-4000-8000-000000000010', 'promote')$$,
  'promoting disposes of the scoped map and lets the campaign go'
);

select is(
  (select campaign_id from public.dungeon_maps where id = '78900000-0000-4000-8000-000000000020'),
  null::uuid,
  'a promoted map survives the campaign and becomes universal'
);

select is(
  (select campaign_id from public.dungeon_maps where id = '78900000-0000-4000-8000-000000000022'),
  '78900000-0000-4000-8000-000000000011'::uuid,
  'another campaign''s map is untouched'
);

-- ── delete ──────────────────────────────────────────────────────────────────
select lives_ok(
  $$select public.delete_campaign_with_homebrew('78900000-0000-4000-8000-000000000011', 'delete')$$,
  'deleting disposes of the scoped map and lets the campaign go'
);

select is(
  (select count(*)::integer from public.dungeon_maps where id = '78900000-0000-4000-8000-000000000022'),
  0,
  'a deleted disposition takes the scoped map with it'
);

-- The one that would be most costly to get wrong: universal work must survive
-- every campaign deletion, under either disposition.
select is(
  (select count(*)::integer from public.dungeon_maps where id = '78900000-0000-4000-8000-000000000021'),
  1,
  'a universal map survives both dispositions'
);

-- ── Cross-owner: the case 20260809000004 exists to prevent ──────────────────
--
-- This is the first regression test in the repo for that migration, and it was
-- written because a `create or replace` built from 20260809000003 silently
-- reverted it and passed every existing test. Transferring a campaign does not
-- re-scope the previous owner's authored rows (#630), so after a transfer the
-- new owner's disposition choice would otherwise reach work they did not write.
--
-- The disposition is a decision about your own material. It is not consent to
-- delete someone else's.

-- Fixtures need the superuser role back; the block above left us as
-- `authenticated`, which cannot write auth.users.
reset role;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('78900000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'maps-previous-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

-- Campaign now owned by DM one; the map inside it was authored by DM two, the
-- way it looks after a handover.
insert into public.campaigns (id, user_id, name) values
  ('78900000-0000-4000-8000-000000000012', '78900000-0000-4000-8000-000000000001', 'Handed over');
insert into public.dungeon_maps (id, user_id, name, campaign_id, layers, metadata) values
  ('78900000-0000-4000-8000-000000000023', '78900000-0000-4000-8000-000000000002', 'Drawn by the previous owner', '78900000-0000-4000-8000-000000000012', '{}'::jsonb, '{}'::jsonb);

-- Back to the campaign owner for the RPC itself.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"78900000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.delete_campaign_with_homebrew('78900000-0000-4000-8000-000000000012', 'delete')$$,
  'the campaign deletes even though it holds another user''s map'
);

reset role;

select is(
  (select count(*)::integer from public.dungeon_maps where id = '78900000-0000-4000-8000-000000000023'),
  1,
  'choosing delete does NOT destroy a map the deleting DM did not author'
);

select is(
  (select campaign_id from public.dungeon_maps where id = '78900000-0000-4000-8000-000000000023'),
  null::uuid,
  'the other user''s map is promoted to universal rather than stranded'
);

-- ── dungeon_features rides the same disposition (#800) ─────────────────────
--
-- Same mechanism, same trap: a campaign_id without a branch in
-- delete_campaign_with_homebrew fails only months later, in front of a DM, as a
-- constraint violation they cannot act on.

reset role;
insert into public.campaigns (id, user_id, name)
values ('78900000-0000-4000-8000-000000000013', '78900000-0000-4000-8000-000000000001', 'Features');
insert into public.dungeon_features (id, user_id, name, campaign_id) values
  ('78900000-0000-4000-8000-000000000050', '78900000-0000-4000-8000-000000000001', 'Scoped collapsing floor', '78900000-0000-4000-8000-000000000013'),
  ('78900000-0000-4000-8000-000000000051', '78900000-0000-4000-8000-000000000001', 'Universal secret door',   null);

select throws_ok(
  $$delete from public.campaigns where id = '78900000-0000-4000-8000-000000000013'$$,
  '23503',
  null,
  'deleting a campaign out from under a scoped feature is refused'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"78900000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.delete_campaign_with_homebrew('78900000-0000-4000-8000-000000000013', 'promote')$$,
  'promoting disposes of the scoped feature and lets the campaign go'
);

reset role;
select is(
  (select campaign_id from public.dungeon_features where id = '78900000-0000-4000-8000-000000000050'),
  null::uuid,
  'a promoted feature survives the campaign and becomes universal'
);

select is(
  (select count(*)::integer from public.dungeon_features where id = '78900000-0000-4000-8000-000000000051'),
  1,
  'a universal feature is untouched'
);

select * from finish();
rollback;
