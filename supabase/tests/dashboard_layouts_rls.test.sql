begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

-- ── Shape ────────────────────────────────────────────────────────────────────

select has_table('public', 'dashboard_layouts', 'a saved dashboard arrangement is a row, not a browser profile');
select col_is_pk('public', 'dashboard_layouts', array['user_id', 'campaign_id', 'surface'],
  'one layout per user, campaign and surface');

-- ── Fixture ──────────────────────────────────────────────────────────────────
-- One owner and one other user, two campaigns owned by the same DM. There is
-- no campaign_members row for either user on either campaign: this table's
-- whole security story is "own row", not campaign membership, so the RLS
-- boundary tests below must hold with no membership fixture backing them.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('76200000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue762-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('76200000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue762-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values
  ('76200000-0000-4000-8000-000000000010', '76200000-0000-4000-8000-000000000001', 'Layout campaign'),
  ('76200000-0000-4000-8000-000000000011', '76200000-0000-4000-8000-000000000001', 'Second layout campaign');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── A user's own row: insert, read, update ──────────────────────────────────

select set_config('request.jwt.claim.sub', '76200000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$ insert into public.dashboard_layouts (user_id, campaign_id, surface, layout)
     values ('76200000-0000-4000-8000-000000000001', '76200000-0000-4000-8000-000000000010', 'prep',
       '{"widgets":[{"key":"pinned-notes","id":"pinned-notes","width":"full"}],"known":["pinned-notes"]}'::jsonb) $$,
  'a user creates their own layout');

select is(
  (select layout from public.dashboard_layouts
   where user_id = '76200000-0000-4000-8000-000000000001'
     and campaign_id = '76200000-0000-4000-8000-000000000010' and surface = 'prep'),
  '{"widgets":[{"key":"pinned-notes","id":"pinned-notes","width":"full"}],"known":["pinned-notes"]}'::jsonb,
  'a user reads their own layout back');

select lives_ok(
  $$ update public.dashboard_layouts
     set layout = '{"widgets":[{"key":"pinned-notes","id":"pinned-notes","width":"full"},{"key":"quests","id":"quests","width":"cell"}],"known":["pinned-notes","quests"]}'::jsonb
     where user_id = '76200000-0000-4000-8000-000000000001'
       and campaign_id = '76200000-0000-4000-8000-000000000010' and surface = 'prep' $$,
  'a user updates their own layout');

-- ── Another user's hands ─────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '76200000-0000-4000-8000-000000000002', true);

select is(
  (select count(*) from public.dashboard_layouts where user_id = '76200000-0000-4000-8000-000000000001'),
  0::bigint,
  'a second user cannot see the first user''s row');

update public.dashboard_layouts set layout = '{"tampered":true}'::jsonb
where user_id = '76200000-0000-4000-8000-000000000001'
  and campaign_id = '76200000-0000-4000-8000-000000000010' and surface = 'prep';

select set_config('request.jwt.claim.sub', '76200000-0000-4000-8000-000000000001', true);
select is(
  (select layout from public.dashboard_layouts
   where user_id = '76200000-0000-4000-8000-000000000001'
     and campaign_id = '76200000-0000-4000-8000-000000000010' and surface = 'prep'),
  '{"widgets":[{"key":"pinned-notes","id":"pinned-notes","width":"full"},{"key":"quests","id":"quests","width":"cell"}],"known":["pinned-notes","quests"]}'::jsonb,
  'a second user cannot update the first user''s row (0-row update)');

select set_config('request.jwt.claim.sub', '76200000-0000-4000-8000-000000000002', true);
delete from public.dashboard_layouts
where user_id = '76200000-0000-4000-8000-000000000001'
  and campaign_id = '76200000-0000-4000-8000-000000000010' and surface = 'prep';

select set_config('request.jwt.claim.sub', '76200000-0000-4000-8000-000000000001', true);
select is(
  (select count(*) from public.dashboard_layouts
   where user_id = '76200000-0000-4000-8000-000000000001'
     and campaign_id = '76200000-0000-4000-8000-000000000010' and surface = 'prep'),
  1::bigint,
  'a second user cannot delete the first user''s row');

-- ── The surface check ────────────────────────────────────────────────────────

select throws_ok(
  $$ insert into public.dashboard_layouts (user_id, campaign_id, surface, layout)
     values ('76200000-0000-4000-8000-000000000001', '76200000-0000-4000-8000-000000000010', 'arrange', '{}'::jsonb) $$,
  '23514', null,
  'the surface check rejects a value outside prep/session');

-- ── Upsert stays a single row, and the trigger actually moves updated_at ────
-- updated_at is backdated on the *insert*, not via a later update, because the
-- trigger overwrites whatever an UPDATE statement tries to put there — the
-- only way to get an old, known value on the row is to never let the trigger
-- see it. now() is also the transaction's fixed clock (this whole file is one
-- transaction), so comparing two post-update timestamps would prove nothing;
-- comparing against a deliberately stale insert-time value does.

select lives_ok(
  $$ insert into public.dashboard_layouts (user_id, campaign_id, surface, layout, updated_at)
     values ('76200000-0000-4000-8000-000000000001', '76200000-0000-4000-8000-000000000010', 'session',
       '{"widgets":[{"key":"quests","id":"quests","width":"cell"}],"known":["quests"]}'::jsonb,
       timestamptz '2020-01-01 00:00:00+00') $$,
  'a user creates a session-surface layout with a known-old updated_at');

select lives_ok(
  $$ insert into public.dashboard_layouts (user_id, campaign_id, surface, layout)
     values ('76200000-0000-4000-8000-000000000001', '76200000-0000-4000-8000-000000000010', 'session',
       '{"widgets":[{"key":"quests","id":"quests","width":"full"}],"known":["quests"]}'::jsonb)
     on conflict (user_id, campaign_id, surface) do update set layout = excluded.layout $$,
  'upserting the same key updates in place rather than inserting a duplicate');

select is(
  (select count(*) from public.dashboard_layouts
   where user_id = '76200000-0000-4000-8000-000000000001'
     and campaign_id = '76200000-0000-4000-8000-000000000010' and surface = 'session'),
  1::bigint,
  'the primary key keeps the upsert to a single row');

select is(
  (select layout from public.dashboard_layouts
   where user_id = '76200000-0000-4000-8000-000000000001'
     and campaign_id = '76200000-0000-4000-8000-000000000010' and surface = 'session'),
  '{"widgets":[{"key":"quests","id":"quests","width":"full"}],"known":["quests"]}'::jsonb,
  'the upsert overwrote the previous layout in place');

select isnt(
  (select updated_at from public.dashboard_layouts
   where user_id = '76200000-0000-4000-8000-000000000001'
     and campaign_id = '76200000-0000-4000-8000-000000000010' and surface = 'session'),
  timestamptz '2020-01-01 00:00:00+00',
  'the updated_at trigger moved the timestamp when the upsert touched the row');

-- ── Deleting the campaign cascades away the layout ──────────────────────────

insert into public.dashboard_layouts (user_id, campaign_id, surface, layout)
values ('76200000-0000-4000-8000-000000000001', '76200000-0000-4000-8000-000000000011', 'prep', '{"widgets":[]}'::jsonb);

reset role;
delete from public.campaigns where id = '76200000-0000-4000-8000-000000000011';

select is(
  (select count(*) from public.dashboard_layouts where campaign_id = '76200000-0000-4000-8000-000000000011'),
  0::bigint,
  'deleting the campaign cascades away its dashboard layout');

select * from finish();
rollback;
