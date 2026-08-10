begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('68900000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'overview-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name) values ('68900000-0000-4000-8000-000000000010', '68900000-0000-4000-8000-000000000001', 'Overview invariant');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values ('68900000-0000-4000-8000-000000000010', '68900000-0000-4000-8000-000000000001', 'dm', 'DM') on conflict (campaign_id, user_id) do update set role = excluded.role;
insert into public.quests (id, user_id, campaign_id, title, summary) values ('68900000-0000-4000-8000-000000000020', '68900000-0000-4000-8000-000000000001', '68900000-0000-4000-8000-000000000010', 'Quest', 'A summary');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('68900000-0000-4000-8000-000000000030', '68900000-0000-4000-8000-000000000020', '68900000-0000-4000-8000-000000000010', 'Authored beat');

-- Creation is the only path that mints an overview beat, so the rest of the
-- suite is meaningless if the insert trigger ever stops firing.
select is(
  (select count(*)::integer from public.quest_beats where quest_id = '68900000-0000-4000-8000-000000000020' and is_overview),
  1,
  'creating a quest mints exactly one overview beat'
);
select is(
  (select kind from public.quest_beats where quest_id = '68900000-0000-4000-8000-000000000020' and is_overview),
  'overview',
  'the minted overview beat carries the overview kind'
);

-- Nothing recreates it, so removal must be refused for every caller — including
-- the table owner, which is what a future RPC or a hand-run statement gets.
select throws_ok(
  $$ delete from public.quest_beats where quest_id = '68900000-0000-4000-8000-000000000020' and is_overview $$,
  '23514',
  'The quest overview beat cannot be removed while its quest exists',
  'the overview beat cannot be deleted while its quest exists'
);
select throws_ok(
  $$ update public.quest_beats set kind = 'archived' where quest_id = '68900000-0000-4000-8000-000000000020' and is_overview $$,
  '23514',
  'The quest overview beat cannot be archived or demoted',
  'the overview beat cannot be archived out of existence'
);
select throws_ok(
  $$ update public.quest_beats set is_overview = false where quest_id = '68900000-0000-4000-8000-000000000020' and is_overview $$,
  '23514',
  'The quest overview beat cannot be archived or demoted',
  'the overview beat cannot be demoted to an ordinary beat'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '68900000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- The client hides Delete on the overview beat; this is the same rule one layer
-- down, where a direct RPC call lands.
select throws_ok(
  $$ select public.archive_quest_beat((select id from public.quest_beats where quest_id = '68900000-0000-4000-8000-000000000020' and is_overview)) $$,
  '23514',
  'The quest overview beat cannot be archived or demoted',
  'the archive RPC cannot archive the overview beat'
);
select lives_ok(
  $$ select public.archive_quest_beat('68900000-0000-4000-8000-000000000030') $$,
  'ordinary beats still archive normally'
);

reset role;

-- Deleting the quest must still work: the guard has to read as "not while the
-- quest exists", not "never", or every quest becomes undeletable.
select lives_ok(
  $$ delete from public.quests where id = '68900000-0000-4000-8000-000000000020' $$,
  'deleting a quest still cascades its overview beat away'
);

select * from finish();
rollback;
