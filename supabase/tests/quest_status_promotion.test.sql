begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

-- Two things called themselves "active" and never met: the DM-curated kanban
-- lane and the live runtime cursor. A DM could be mid-session in a quest that
-- still sat in the Rumor lane and was absent from the dashboard entirely.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('75600000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue756-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('75600000-0000-4000-8000-000000000010', '75600000-0000-4000-8000-000000000001', 'Promotion campaign');
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('75600000-0000-4000-8000-000000000010', '75600000-0000-4000-8000-000000000001', 'dm', 'DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.quests (id, user_id, campaign_id, title, status) values
  ('75600000-0000-4000-8000-000000000020', '75600000-0000-4000-8000-000000000001', '75600000-0000-4000-8000-000000000010', 'Rumoured', 'rumor'),
  ('75600000-0000-4000-8000-000000000021', '75600000-0000-4000-8000-000000000001', '75600000-0000-4000-8000-000000000010', 'Unknown', 'undiscovered'),
  ('75600000-0000-4000-8000-000000000022', '75600000-0000-4000-8000-000000000001', '75600000-0000-4000-8000-000000000010', 'Finished', 'completed'),
  ('75600000-0000-4000-8000-000000000023', '75600000-0000-4000-8000-000000000001', '75600000-0000-4000-8000-000000000010', 'Lost', 'failed');

insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('75600000-0000-4000-8000-000000000030', '75600000-0000-4000-8000-000000000020', '75600000-0000-4000-8000-000000000010', 'Rumour beat'),
  ('75600000-0000-4000-8000-000000000031', '75600000-0000-4000-8000-000000000021', '75600000-0000-4000-8000-000000000010', 'Unknown beat'),
  ('75600000-0000-4000-8000-000000000032', '75600000-0000-4000-8000-000000000022', '75600000-0000-4000-8000-000000000010', 'Callback beat'),
  ('75600000-0000-4000-8000-000000000033', '75600000-0000-4000-8000-000000000023', '75600000-0000-4000-8000-000000000010', 'Flashback beat');

set local role authenticated;
select set_config('request.jwt.claim.sub', '75600000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── The ratchet turns one way ───────────────────────────────────────────────

select lives_ok($$ select public.transition_quest_runtime(
  '75600000-0000-4000-8000-000000000010', '75600000-0000-4000-8000-000000000020', 'start', 0,
  '75600000-0000-4000-8000-000000000030') $$, 'a rumoured quest can be entered');
select is((select status::text from public.quests where id = '75600000-0000-4000-8000-000000000020'),
  'active', 'arriving in a rumoured quest promotes it to the Active lane');

select lives_ok($$ select public.transition_quest_runtime(
  '75600000-0000-4000-8000-000000000010', '75600000-0000-4000-8000-000000000021', 'start', 0,
  '75600000-0000-4000-8000-000000000031') $$, 'an undiscovered quest can be entered');
select is((select status::text from public.quests where id = '75600000-0000-4000-8000-000000000021'),
  'active', 'arriving in an undiscovered quest promotes it too');

-- A callback, a revisit or a flashback must not silently reopen a verdict the
-- DM already delivered. This is the half of the rule that is easy to omit.
select lives_ok($$ select public.transition_quest_runtime(
  '75600000-0000-4000-8000-000000000010', '75600000-0000-4000-8000-000000000022', 'start', 0,
  '75600000-0000-4000-8000-000000000032') $$, 'a completed quest can still be revisited');
select is((select status::text from public.quests where id = '75600000-0000-4000-8000-000000000022'),
  'completed', 'revisiting a completed quest never reopens it');

select lives_ok($$ select public.transition_quest_runtime(
  '75600000-0000-4000-8000-000000000010', '75600000-0000-4000-8000-000000000023', 'start', 0,
  '75600000-0000-4000-8000-000000000033') $$, 'a failed quest can still be revisited');
select is((select status::text from public.quests where id = '75600000-0000-4000-8000-000000000023'),
  'failed', 'revisiting a failed quest never reopens it');

-- Ending a chain nulls its cursor. The party did play the quest, so it stays in
-- the Active lane until the DM says otherwise — nothing here ever demotes.
select is(
  (select status::text from public.quests where id = '75600000-0000-4000-8000-000000000020'
    and exists (select 1 from public.transition_quest_runtime(
      '75600000-0000-4000-8000-000000000010', '75600000-0000-4000-8000-000000000020', 'end', 1) t(x))),
  'active', 'ending a chain leaves its quest active rather than demoting it');

select * from finish();
rollback;
