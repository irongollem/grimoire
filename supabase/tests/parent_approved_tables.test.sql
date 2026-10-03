-- #927 stories 1-2 (20260929211745_parent_approved_tables): a join that
-- involves a young player waits for each parent it concerns.
--
-- Exercised as each caller through the same RPCs the browser and the
-- child-account edge function call, because every rule here is one a caller
-- could try to skip.

begin;

create extension if not exists pgtap with schema extensions;
select plan(52);

-- ── Fixture ──────────────────────────────────────────────────────────────────
-- Paula has two children, Kit (who runs a campaign) and Sid. Quinn is Jo's
-- parent. Ada is an adult stranger with a campaign of her own.
--   1 Paula  2 Kit  3 Sid  4 Quinn  5 Jo  6 Ada

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('92800000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'tables-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 6) as n;

insert into public.child_accounts (child_user_id, parent_user_id, login_name, adult_on, consent_version)
values
  ('92800000-0000-4000-8000-000000000002', '92800000-0000-4000-8000-000000000001', 'pgtap-kit', current_date + 400, '2026-09-28'),
  ('92800000-0000-4000-8000-000000000003', '92800000-0000-4000-8000-000000000001', 'pgtap-sid', current_date + 400, '2026-09-28'),
  ('92800000-0000-4000-8000-000000000005', '92800000-0000-4000-8000-000000000004', 'pgtap-jo', current_date + 400, '2026-09-28');

-- c1 Kit's table, c2 Ada's table, c3 Paula's table.
insert into public.campaigns (id, user_id, name) values
  ('92800000-0000-4000-8000-0000000000c1', '92800000-0000-4000-8000-000000000002', 'Kit''s table'),
  ('92800000-0000-4000-8000-0000000000c2', '92800000-0000-4000-8000-000000000006', 'Ada''s table'),
  ('92800000-0000-4000-8000-0000000000c3', '92800000-0000-4000-8000-000000000001', 'Paula''s table');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('92800000-0000-4000-8000-0000000000c1', '92800000-0000-4000-8000-000000000002', 'dm', 'Kit'),
  ('92800000-0000-4000-8000-0000000000c2', '92800000-0000-4000-8000-000000000006', 'dm', 'Ada'),
  ('92800000-0000-4000-8000-0000000000c3', '92800000-0000-4000-8000-000000000001', 'dm', 'Paula')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.campaign_invites (campaign_id, token, role, created_by) values
  ('92800000-0000-4000-8000-0000000000c1', '92800000-0000-4000-8000-0000000000a1', 'player', '92800000-0000-4000-8000-000000000002'),
  ('92800000-0000-4000-8000-0000000000c2', '92800000-0000-4000-8000-0000000000a2', 'player', '92800000-0000-4000-8000-000000000006'),
  ('92800000-0000-4000-8000-0000000000c3', '92800000-0000-4000-8000-0000000000a3', 'player', '92800000-0000-4000-8000-000000000001');

-- Jo's character, and a single-use invite to Ada's table.
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, ruleset)
values ('92800000-0000-4000-8000-0000000000e1', '92800000-0000-4000-8000-000000000005', '92800000-0000-4000-8000-000000000005', null, 'Jo''s ranger', '2014');
insert into public.campaign_invites (campaign_id, token, role, created_by, max_uses) values
  ('92800000-0000-4000-8000-0000000000c2', '92800000-0000-4000-8000-0000000000a4', 'player', '92800000-0000-4000-8000-000000000006', 1);

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"92800000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

-- Definer, so a test can name a request or a membership whatever role it is
-- running as; the assertions, not these lookups, are what RLS is checked by.
create function pg_temp.is_member(p_campaign text, p_user int) returns boolean language sql security definer as $$
  select exists (select 1 from public.campaign_members
                  where campaign_id = ('92800000-0000-4000-8000-0000000000' || p_campaign)::uuid
                    and user_id = ('92800000-0000-4000-8000-00000000000' || p_user)::uuid);
$$;

create function pg_temp.request_for(p_campaign text, p_user int) returns uuid language sql security definer as $$
  select id from public.campaign_join_requests
   where campaign_id = ('92800000-0000-4000-8000-0000000000' || p_campaign)::uuid
     and user_id = ('92800000-0000-4000-8000-00000000000' || p_user)::uuid;
$$;

set local role authenticated;

-- ── Joining: who needs asking ───────────────────────────────────────────────

select pg_temp.as_user(5);
select is(public.join_campaign_via_invite('92800000-0000-4000-8000-0000000000a1') ->> 'status', 'pending',
  'a child joining another family''s child''s table waits');
select is(public.join_campaign_via_invite('92800000-0000-4000-8000-0000000000a2') ->> 'status', 'pending',
  'a child joining an adult''s table waits');

select pg_temp.as_user(6);
select is(public.join_campaign_via_invite('92800000-0000-4000-8000-0000000000a1') ->> 'status', 'pending',
  'an adult joining a child''s table waits');

select pg_temp.as_user(1);
select is((select count(*)::int from public.campaign_join_requests), 2,
  'the DM''s parent sees the requests waiting on them without being at the table');
select is(public.join_campaign_via_invite('92800000-0000-4000-8000-0000000000a1') ->> 'status', 'joined',
  'the DM''s own parent joins their child''s table at once');

select pg_temp.as_user(2);
select is(public.join_campaign_via_invite('92800000-0000-4000-8000-0000000000a3') ->> 'status', 'joined',
  'a child joins their own parent''s table at once');

select pg_temp.as_user(3);
select is(public.join_campaign_via_invite('92800000-0000-4000-8000-0000000000a1') ->> 'status', 'pending',
  'a sibling joining their sibling''s table waits for their shared parent');

reset role;

select ok(not pg_temp.is_member('c1', 5) and not pg_temp.is_member('c1', 6) and not pg_temp.is_member('c2', 5),
  'a pending joiner holds no membership, so no campaign policy lets them in');

select is(
  (select array[joiner_parent_id, dm_parent_id] from public.campaign_join_requests where id = pg_temp.request_for('c1', 5)),
  array['92800000-0000-4000-8000-000000000004', '92800000-0000-4000-8000-000000000001']::uuid[],
  'Jo at Kit''s table needs Quinn (Jo''s parent) and Paula (Kit''s parent)');
select is(
  (select array[joiner_parent_id, dm_parent_id] from public.campaign_join_requests where id = pg_temp.request_for('c2', 5)),
  array['92800000-0000-4000-8000-000000000004', null]::uuid[],
  'Jo at Ada''s table needs only Quinn');
select is(
  (select array[joiner_parent_id, dm_parent_id] from public.campaign_join_requests where id = pg_temp.request_for('c1', 6)),
  array[null, '92800000-0000-4000-8000-000000000001']::uuid[],
  'Ada at Kit''s table needs only Paula');

select is(
  (select use_count from public.campaign_invites where token = '92800000-0000-4000-8000-0000000000a1'),
  4, 'each request or join on Kit''s invite counts one use');

set local role authenticated;
select pg_temp.as_user(5);
select is(
  (public.join_campaign_via_invite('92800000-0000-4000-8000-0000000000a1') ->> 'request_id')::uuid,
  pg_temp.request_for('c1', 5),
  'opening the link again returns the same request rather than a second one');
reset role;
select is(
  (select use_count from public.campaign_invites where token = '92800000-0000-4000-8000-0000000000a1'),
  4, 'and uses nothing more');

-- ── Who can see a request ───────────────────────────────────────────────────

set local role authenticated;
select pg_temp.as_user(5);
select is((select count(*)::int from public.campaign_join_requests), 2, 'the joiner sees their own requests');
select pg_temp.as_user(1);
select is((select count(*)::int from public.campaign_join_requests), 3,
  'Paula sees the three waiting on her (Jo, Ada and Sid at Kit''s table)');
select pg_temp.as_user(6);
select is((select count(*)::int from public.campaign_join_requests), 1, 'Ada sees only her own');
select pg_temp.as_user(2);
select is((select count(*)::int from public.campaign_join_requests), 0,
  'the child DM does not decide, so sees none');

select throws_ok(
  $$ insert into public.campaign_join_requests (campaign_id, user_id, role, display_name, dm_parent_id)
     values ('92800000-0000-4000-8000-0000000000c1', '92800000-0000-4000-8000-000000000002', 'player', 'x', '92800000-0000-4000-8000-000000000002') $$,
  '42501', null, 'nobody writes a request directly');

-- ── Deciding ────────────────────────────────────────────────────────────────

select pg_temp.as_user(6);
select throws_ok(
  format($$ select public.decide_campaign_join_request(%L, true) $$, pg_temp.request_for('c1', 5)),
  'P0001', 'Not authorized', 'a stranger cannot approve');

select pg_temp.as_user(2);
select throws_ok(
  format($$ select public.decide_campaign_join_request(%L, true) $$, pg_temp.request_for('c1', 6)),
  'P0001', 'Not authorized', 'nor can the child DM approve their own table');

select pg_temp.as_user(4);
select is(public.decide_campaign_join_request(pg_temp.request_for('c1', 5), true), 'pending',
  'one parent''s yes leaves the request waiting on the other');
select pg_temp.as_user(1);
select is(public.decide_campaign_join_request(pg_temp.request_for('c1', 5), true), 'joined',
  'the second yes admits the joiner');

select pg_temp.as_user(1);
select is(public.decide_campaign_join_request(pg_temp.request_for('c1', 3), true), 'joined',
  'siblings: their shared parent''s one yes covers both sides');

select pg_temp.as_user(1);
select is(public.decide_campaign_join_request(pg_temp.request_for('c1', 6), false), 'declined',
  'a parent can say no');

reset role;
select is(
  (select use_count from public.campaign_invites where token = '92800000-0000-4000-8000-0000000000a1'),
  3, 'a no gives the declined request''s seat back to the invite');
select ok(pg_temp.is_member('c1', 5) and pg_temp.is_member('c1', 3), 'the approved joiners are at the table');
select ok(not pg_temp.is_member('c1', 6), 'the declined one is not');
select is(
  (select count(*)::int from public.campaign_join_requests where campaign_id = '92800000-0000-4000-8000-0000000000c1'),
  0, 'decided requests are gone');

-- ── Bringing a character ────────────────────────────────────────────────────

set local role authenticated;
select pg_temp.as_user(5);
select is(
  (public.join_campaign_via_invite('92800000-0000-4000-8000-0000000000a2', '92800000-0000-4000-8000-0000000000e1') ->> 'request_id')::uuid,
  pg_temp.request_for('c2', 5),
  'choosing a character on a second visit updates the same request');
select pg_temp.as_user(4);
select is(public.decide_campaign_join_request(pg_temp.request_for('c2', 5), true), 'joined',
  'a parent''s yes admits a joiner who brings a character (the yes-sayer owns no character)');
reset role;
select ok(
  (select m.party_member_id = '92800000-0000-4000-8000-0000000000e1'
     from public.campaign_members m
    where m.campaign_id = '92800000-0000-4000-8000-0000000000c2' and m.user_id = '92800000-0000-4000-8000-000000000005')
  and (select campaign_id = '92800000-0000-4000-8000-0000000000c2' from public.party_members where id = '92800000-0000-4000-8000-0000000000e1'),
  'and the character came with them');

set local role authenticated;
select pg_temp.as_user(5);
select throws_ok(
  $$ select public.join_campaign_via_invite('92800000-0000-4000-8000-0000000000ff', '92800000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Invalid or expired invite token',
  'a dead link says so, whatever the chosen character''s state');
reset role;

-- ── No seat without the flow ────────────────────────────────────────────────
-- A DM used to be able to write member rows from the browser, which skipped
-- every approval above.

set local role authenticated;
select pg_temp.as_user(6);
select throws_ok(
  $$ insert into public.campaign_members (campaign_id, user_id, role, display_name)
     values ('92800000-0000-4000-8000-0000000000c2', '92800000-0000-4000-8000-000000000005', 'player', 'Jo') $$,
  '42501', null, 'a DM cannot seat someone by writing a member row');
select throws_ok(
  $$ update public.campaign_members set user_id = '92800000-0000-4000-8000-000000000005'
      where campaign_id = '92800000-0000-4000-8000-0000000000c2' and user_id = '92800000-0000-4000-8000-000000000006' $$,
  'P0001', 'A membership cannot be moved to another person or campaign',
  'nor by moving an existing row to another account');
select lives_ok(
  $$ update public.campaign_members set display_name = 'Ada the DM'
      where campaign_id = '92800000-0000-4000-8000-0000000000c2' and user_id = '92800000-0000-4000-8000-000000000006' $$,
  'a DM still edits the rest of a member row');
reset role;

-- ── A parent joining their child for them ───────────────────────────────────

delete from public.campaign_members where campaign_id = '92800000-0000-4000-8000-0000000000c1' and user_id = '92800000-0000-4000-8000-000000000005';

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.join_campaign_for_child('92800000-0000-4000-8000-0000000000a1', '92800000-0000-4000-8000-000000000005', '92800000-0000-4000-8000-000000000004') ->> 'status',
  'pending', 'a parent adding their child to another child''s table still waits for the DM''s parent');
select ok(
  (select joiner_parent_approved_at is not null and dm_parent_approved_at is null
     from public.campaign_join_requests where id = pg_temp.request_for('c1', 5)),
  'but their own side is already approved');
select throws_ok(
  $$ select public.join_campaign_for_child('92800000-0000-4000-8000-0000000000a1', '92800000-0000-4000-8000-000000000005', '92800000-0000-4000-8000-000000000001') $$,
  'P0001', 'Not this child''s parent', 'only the child''s own parent can act for them');

-- ── Removing ────────────────────────────────────────────────────────────────

set local role authenticated;
select pg_temp.as_user(6);
select throws_ok(
  $$ select public.remove_from_family_campaign('92800000-0000-4000-8000-0000000000c1', '92800000-0000-4000-8000-000000000003') $$,
  'P0001', 'Not authorized', 'a stranger cannot remove anyone');

select pg_temp.as_user(1);
select throws_ok(
  $$ select public.remove_from_family_campaign('92800000-0000-4000-8000-0000000000c1', '92800000-0000-4000-8000-000000000002') $$,
  'P0001', 'The campaign''s owner cannot be removed', 'nor is the campaign''s owner ever removed this way');
select lives_ok(
  $$ select public.remove_from_family_campaign('92800000-0000-4000-8000-0000000000c1', '92800000-0000-4000-8000-000000000003') $$,
  'a parent can take a member out of a table their child runs');
select pg_temp.as_user(4);
select lives_ok(
  $$ select public.remove_from_family_campaign('92800000-0000-4000-8000-0000000000c1', '92800000-0000-4000-8000-000000000005') $$,
  'and a parent can take their own child out of any table (a no-op when they are not there)');

-- ── The Family page's read ──────────────────────────────────────────────────

select pg_temp.as_user(1);
select is(jsonb_array_length(public.get_family_campaigns() -> 'children'), 2, 'Paula sees her two children');
select is(
  (select jsonb_array_length(c -> 'campaigns') from jsonb_array_elements(public.get_family_campaigns() -> 'children') c
    where c ->> 'child_user_id' = '92800000-0000-4000-8000-000000000002'),
  2, 'Kit is at two tables: their own, and Paula''s');
select is(
  (select r ->> 'kind' from jsonb_array_elements(public.get_family_campaigns() -> 'requests') r),
  'joining_child_campaign', 'and the one request waiting on her is Jo, at Kit''s table');

select pg_temp.as_user(6);
select is(public.get_family_campaigns(), '{"children": [], "requests": []}'::jsonb,
  'someone with no children sees nothing');

reset role;

-- ── A single-use link, and coming of age while waiting ──────────────────────

set local role authenticated;
select pg_temp.as_user(3);
select is(public.join_campaign_via_invite('92800000-0000-4000-8000-0000000000a4') ->> 'status', 'pending',
  'Sid asks for Ada''s table on a single-use link');
select is(
  (public.join_campaign_via_invite('92800000-0000-4000-8000-0000000000a4') ->> 'request_id')::uuid,
  pg_temp.request_for('c2', 3),
  'reopening it shows the same waiting request, not a dead link, though the request took the one seat');
reset role;

update public.child_accounts set adult_on = current_date
 where child_user_id = '92800000-0000-4000-8000-000000000003';

set local role authenticated;
select pg_temp.as_user(3);
select is(public.join_campaign_via_invite('92800000-0000-4000-8000-0000000000a4') ->> 'status', 'joined',
  'once Sid comes of age nobody''s yes is owed, so reopening the link lets them in');
reset role;
select ok(pg_temp.is_member('c2', 3) and pg_temp.request_for('c2', 3) is null,
  'and the request is gone');

-- ── Grants ───────────────────────────────────────────────────────────────────

select ok(
  not has_function_privilege('anon', 'public.decide_campaign_join_request(uuid, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.remove_from_family_campaign(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.get_family_campaigns()', 'execute')
  and not has_function_privilege('anon', 'public.join_campaign_via_invite(uuid, uuid)', 'execute'),
  'anon can call none of them');

select * from finish();
rollback;
