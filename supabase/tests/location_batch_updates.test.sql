-- The batched location writes (20261008200423): update_location_map_regions,
-- update_location_doors and update_location_placements apply one patch per
-- row in a single call, as the DM; a row that is missing or not the caller's
-- refuses the whole batch with nothing written; a column outside the table's
-- update list is refused, not ignored; anon cannot call them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('b4700000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'batch-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('b4700000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'batch-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('b4700000-0000-4000-8000-000000000010', 'b4700000-0000-4000-8000-000000000001', 'Batch'),
  ('b4700000-0000-4000-8000-000000000011', 'b4700000-0000-4000-8000-000000000002', 'Elsewhere');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('b4700000-0000-4000-8000-000000000010', 'b4700000-0000-4000-8000-000000000001', 'dm', 'DM'),
  ('b4700000-0000-4000-8000-000000000011', 'b4700000-0000-4000-8000-000000000002', 'dm', 'Other')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.locations (id, user_id, campaign_id, name, location_type) values
  ('b4700000-0000-4000-8000-000000000020', 'b4700000-0000-4000-8000-000000000001', 'b4700000-0000-4000-8000-000000000010', 'The Vault', 'dungeon'),
  ('b4700000-0000-4000-8000-000000000025', 'b4700000-0000-4000-8000-000000000002', 'b4700000-0000-4000-8000-000000000011', 'Their Keep', 'dungeon');
insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type) values
  ('b4700000-0000-4000-8000-000000000021', 'b4700000-0000-4000-8000-000000000001', 'b4700000-0000-4000-8000-000000000010', 'b4700000-0000-4000-8000-000000000020', 'Nave', 'room'),
  ('b4700000-0000-4000-8000-000000000022', 'b4700000-0000-4000-8000-000000000001', 'b4700000-0000-4000-8000-000000000010', 'b4700000-0000-4000-8000-000000000020', 'Reliquary', 'room'),
  ('b4700000-0000-4000-8000-000000000026', 'b4700000-0000-4000-8000-000000000002', 'b4700000-0000-4000-8000-000000000011', 'b4700000-0000-4000-8000-000000000025', 'Their Hall', 'room');

insert into public.location_map_regions (id, user_id, site_location_id, space_location_id, cells) values
  ('b4700000-0000-4000-8000-000000000030', 'b4700000-0000-4000-8000-000000000001', 'b4700000-0000-4000-8000-000000000020', 'b4700000-0000-4000-8000-000000000021', '["1,1"]'::jsonb),
  ('b4700000-0000-4000-8000-000000000031', 'b4700000-0000-4000-8000-000000000001', 'b4700000-0000-4000-8000-000000000020', 'b4700000-0000-4000-8000-000000000022', '["2,2"]'::jsonb),
  ('b4700000-0000-4000-8000-000000000035', 'b4700000-0000-4000-8000-000000000002', 'b4700000-0000-4000-8000-000000000025', 'b4700000-0000-4000-8000-000000000026', '["9,9"]'::jsonb);

insert into public.location_doors (id, user_id, from_location_id, to_location_id, label) values
  ('b4700000-0000-4000-8000-000000000040', 'b4700000-0000-4000-8000-000000000001', 'b4700000-0000-4000-8000-000000000021', 'b4700000-0000-4000-8000-000000000022', 'Arch');

insert into public.traps (id, user_id, campaign_id, name) values
  ('b4700000-0000-4000-8000-000000000050', 'b4700000-0000-4000-8000-000000000001', 'b4700000-0000-4000-8000-000000000010', 'Needle');
insert into public.location_placements (id, user_id, location_id, trap_id) values
  ('b4700000-0000-4000-8000-000000000060', 'b4700000-0000-4000-8000-000000000001', 'b4700000-0000-4000-8000-000000000021', 'b4700000-0000-4000-8000-000000000050');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b4700000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- ── Each row gets its own patch, in one call ─────────────────────────────────

select lives_ok($$ select public.update_location_map_regions('[
    {"id": "b4700000-0000-4000-8000-000000000030", "update": {"cells": ["1,1", "1,2"], "cell_signature": "sig-a"}},
    {"id": "b4700000-0000-4000-8000-000000000031", "update": {"cells": [], "cell_signature": null}}
  ]'::jsonb) $$, 'the DM updates two regions in one call');
select is((select cells from public.location_map_regions where id = 'b4700000-0000-4000-8000-000000000030'),
  '["1,1", "1,2"]'::jsonb, 'the first region took its own cells');
select is((select array[cells::text, coalesce(cell_signature, 'null')] from public.location_map_regions where id = 'b4700000-0000-4000-8000-000000000031'),
  array['[]', 'null'], 'and the second its own, an explicit null included');
select is((select space_location_id from public.location_map_regions where id = 'b4700000-0000-4000-8000-000000000030'),
  'b4700000-0000-4000-8000-000000000021'::uuid, 'a column the patch does not name is left as it was');

select lives_ok($$ select public.update_location_doors('[
    {"id": "b4700000-0000-4000-8000-000000000040", "update": {"door_kind": "arch", "derived_from": "publish"}}
  ]'::jsonb) $$, 'the DM updates a door');
select is((select door_kind || '/' || derived_from from public.location_doors where id = 'b4700000-0000-4000-8000-000000000040'),
  'arch/publish', 'and the door changed');

select lives_ok($$ select public.update_location_placements('[
    {"id": "b4700000-0000-4000-8000-000000000060", "update": {"location_id": "b4700000-0000-4000-8000-000000000022", "source_cell_key": "2,2"}}
  ]'::jsonb) $$, 'the DM re-anchors a placement');
select is((select location_id from public.location_placements where id = 'b4700000-0000-4000-8000-000000000060'),
  'b4700000-0000-4000-8000-000000000022'::uuid, 'and the placement moved');

-- ── All or nothing ───────────────────────────────────────────────────────────

select throws_ok($$ select public.update_location_map_regions('[
    {"id": "b4700000-0000-4000-8000-000000000030", "update": {"cell_signature": "sig-b"}},
    {"id": "b4700000-0000-4000-8000-000000000035", "update": {"cells": []}}
  ]'::jsonb) $$, '42501', null, 'a batch naming another DM''s region is refused');
select is((select cell_signature from public.location_map_regions where id = 'b4700000-0000-4000-8000-000000000030'),
  'sig-a', 'and the DM''s own region in that batch was not written either');

select throws_ok($$ select public.update_location_doors('[
    {"id": "b4700000-0000-4000-8000-0000000000ff", "update": {"label": "Ghost"}}
  ]'::jsonb) $$, '42501', null, 'a row that does not exist refuses the batch');

-- Empty patches must refuse the batch, including rows hidden by RLS or absent.
select throws_ok($$ select public.update_location_map_regions('[
    {"id": "b4700000-0000-4000-8000-000000000030", "update": {"cell_signature": "sig-empty"}},
    {"id": "b4700000-0000-4000-8000-000000000035", "update": {}}
  ]'::jsonb) $$, 'P0001', 'update_location_map_regions: empty patches are not allowed',
  'an empty patch for another DM''s region refuses the batch');
select is((select cell_signature from public.location_map_regions where id = 'b4700000-0000-4000-8000-000000000030'),
  'sig-a', 'an empty patch rolls back earlier writes in the batch');
select throws_ok($$ select public.update_location_doors('[
    {"id": "b4700000-0000-4000-8000-0000000000ff", "update": {}}
  ]'::jsonb) $$, 'P0001', 'update_location_doors: empty patches are not allowed',
  'an empty patch for a missing row is refused');
select throws_ok($$ select public.update_location_placements('[
    {"id": "b4700000-0000-4000-8000-000000000060", "update": {}}
  ]'::jsonb) $$, 'P0001', 'update_location_placements: empty patches are not allowed',
  'an empty patch for a writable row is also refused');
select throws_ok($$ select public.update_location_doors('[
    {"id": "not-a-uuid", "update": {}}
  ]'::jsonb) $$, 'P0001', 'update_location_doors: empty patches are not allowed',
  'an empty patch with a malformed id cannot silently succeed');

-- ── Only the table's update columns ──────────────────────────────────────────

select throws_ok($$ select public.update_location_map_regions('[
    {"id": "b4700000-0000-4000-8000-000000000030", "update": {"user_id": "b4700000-0000-4000-8000-000000000002"}}
  ]'::jsonb) $$, 'P0001', null, 'a column outside the update list is refused, not ignored');
select is((select user_id from public.location_map_regions where id = 'b4700000-0000-4000-8000-000000000030'),
  'b4700000-0000-4000-8000-000000000001'::uuid, 'and the owner is unchanged');

reset role;
select ok(not has_function_privilege('anon', 'public.update_location_map_regions(jsonb)', 'EXECUTE')
       and not has_function_privilege('anon', 'public.update_location_doors(jsonb)', 'EXECUTE')
       and not has_function_privilege('anon', 'public.update_location_placements(jsonb)', 'EXECUTE'),
  'anon cannot call the batch writes');

select * from finish();
rollback;
