-- #1016: a delayed quest consequence fires on the server when the date
-- reaches it, whoever moves the date.
--
-- Cover for migration 20261011214845. Until then `useDueConsequences` fired
-- these from the DM's open app shell; now the due date is stamped on the
-- event row (`due_on_*`) and `campaigns_fire_due_consequences` performs every
-- pending, unheld, un-undone row due on or before the new today, the same way
-- `campaigns_fail_overdue_objectives` fails an overdue objective
-- (quest_model_gaps_1011.test.sql). The first date move here is a plain
-- `update campaigns` with no session at all, which is the acceptance: no DM
-- client needs to be open.

begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

set local grimoire.bypass_quota = 'on';

-- ── Fixture ─────────────────────────────────────────────────────────────────
-- u1 DM of c1 (Faerûn, today 28 Hammer 1495), one quest, one transition, and
-- events written straight onto the log as apply_quest_consequences would:
--   E1 broadcast      +5   due 2 Alturiak (Midwinter elapses)
--   E2 calendar event +2   due 30 Hammer
--   E3 broadcast      +1   held: fires only from the Fire button
--   E4 broadcast      +1   undone
--   E5 broadcast      +40  due 7 Ches (restamped on a calendar switch)
--   E6 broadcast      +1   fires_on a month Harptos does not have: unplaceable
--   E7 broadcast      +1   in another campaign

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('10160000-0000-4000-8000-100000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'due1016-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10160000-0000-4000-8000-100000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'due1016-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name, calendar_id, current_year, current_month, current_day) values
  ('10160000-0000-4000-8000-200000000001', '10160000-0000-4000-8000-100000000001', 'Due table', 'faerun', 1495, 1, 28),
  ('10160000-0000-4000-8000-200000000002', '10160000-0000-4000-8000-100000000002', 'Other table', 'faerun', 1495, 1, 28);
insert into public.quests (id, user_id, campaign_id, title, status) values
  ('10160000-0000-4000-8000-300000000001', '10160000-0000-4000-8000-100000000001', '10160000-0000-4000-8000-200000000001', 'The bridge', 'active'),
  ('10160000-0000-4000-8000-300000000002', '10160000-0000-4000-8000-100000000002', '10160000-0000-4000-8000-200000000002', 'Elsewhere', 'active');
insert into public.quest_beat_transitions (id, campaign_id, transition_kind, provenance, runtime_version) values
  ('10160000-0000-4000-8000-400000000001', '10160000-0000-4000-8000-200000000001', 'enter', '{}'::jsonb, 1),
  ('10160000-0000-4000-8000-400000000002', '10160000-0000-4000-8000-200000000002', 'enter', '{}'::jsonb, 1);
insert into public.quest_consequence_events
  (id, campaign_id, quest_id, transition_id, action, action_payload, after_days, fires_on_year, fires_on_month, fires_on_day, held_at, undone_at) values
  ('10160000-0000-4000-8000-500000000001', '10160000-0000-4000-8000-200000000001', '10160000-0000-4000-8000-300000000001', '10160000-0000-4000-8000-400000000001',
   'send_broadcast', '{"message": "The bridge collapses."}', 5, 1495, 1, 28, null, null),
  ('10160000-0000-4000-8000-500000000002', '10160000-0000-4000-8000-200000000001', '10160000-0000-4000-8000-300000000001', '10160000-0000-4000-8000-400000000001',
   'create_calendar_event', '{"title": "Rivermeet", "event_type": "quest"}', 2, 1495, 1, 28, null, null),
  ('10160000-0000-4000-8000-500000000003', '10160000-0000-4000-8000-200000000001', '10160000-0000-4000-8000-300000000001', '10160000-0000-4000-8000-400000000001',
   'send_broadcast', '{"message": "Held."}', 1, 1495, 1, 28, now(), null),
  ('10160000-0000-4000-8000-500000000004', '10160000-0000-4000-8000-200000000001', '10160000-0000-4000-8000-300000000001', '10160000-0000-4000-8000-400000000001',
   'send_broadcast', '{"message": "Undone."}', 1, 1495, 1, 28, null, now()),
  ('10160000-0000-4000-8000-500000000005', '10160000-0000-4000-8000-200000000001', '10160000-0000-4000-8000-300000000001', '10160000-0000-4000-8000-400000000001',
   'send_broadcast', '{"message": "Later."}', 40, 1495, 1, 28, null, null),
  ('10160000-0000-4000-8000-500000000006', '10160000-0000-4000-8000-200000000001', '10160000-0000-4000-8000-300000000001', '10160000-0000-4000-8000-400000000001',
   'send_broadcast', '{"message": "Nowhen."}', 1, 1495, 13, 1, null, null),
  ('10160000-0000-4000-8000-500000000007', '10160000-0000-4000-8000-200000000002', '10160000-0000-4000-8000-300000000002', '10160000-0000-4000-8000-400000000002',
   'send_broadcast', '{"message": "Not yours."}', 1, 1495, 1, 28, null, null);

-- ── The due date is stamped on write ────────────────────────────────────────

select has_column('public', 'quest_consequence_events', 'due_on_year', 'an event carries its own due date');

select is(
  (select array[due_on_year, due_on_month, due_on_day] from public.quest_consequence_events where id = '10160000-0000-4000-8000-500000000001'),
  array[1495, 2, 2], 'the due date is fires_on + after_days on the campaign''s calendar, Midwinter included');

select is(
  (select array[due_on_year, due_on_month, due_on_day] from public.quest_consequence_events where id = '10160000-0000-4000-8000-500000000006'),
  array[null, null, null]::integer[], 'a fires_on the calendar cannot place leaves the due date empty');

update public.quest_consequence_events set after_days = 3 where id = '10160000-0000-4000-8000-500000000002';
select is(
  (select array[due_on_year, due_on_month, due_on_day] from public.quest_consequence_events where id = '10160000-0000-4000-8000-500000000002'),
  array[1495, 2, 1], 'changing the delay restamps the due date (and a day on Midwinter rolls to the next)');
update public.quest_consequence_events set after_days = 2 where id = '10160000-0000-4000-8000-500000000002';

-- ── Moving the date fires what is due, with no session open ─────────────────

select lives_ok($q$
  update public.campaigns set current_day = 29 where id = '10160000-0000-4000-8000-200000000001'
$q$, 'the date moves a day with nobody signed in');

select is(
  (select performed_at from public.quest_consequence_events where id = '10160000-0000-4000-8000-500000000002'),
  null, 'nothing fires before its due day');

select lives_ok($q$
  update public.campaigns set current_day = 30 where id = '10160000-0000-4000-8000-200000000001'
$q$, 'the date reaches 30 Hammer');

select isnt(
  (select performed_at from public.quest_consequence_events where id = '10160000-0000-4000-8000-500000000002'),
  null, 'an event fires on its due day');

select is(
  (select array[harptos_year, harptos_month, harptos_day] from public.calendar_events
    where id = (select calendar_event_id from public.quest_consequence_events where id = '10160000-0000-4000-8000-500000000002')),
  array[1495, 1, 30], 'and what it does reaches the world');

select is(
  (select performed_at from public.quest_consequence_events where id = '10160000-0000-4000-8000-500000000001'),
  null, 'a later event waits');

select lives_ok($q$
  update public.campaigns set current_month = 2, current_day = 10 where id = '10160000-0000-4000-8000-200000000001'
$q$, 'the date jumps past 2 Alturiak');

select is(
  (select array[performed_on_year, performed_on_month, performed_on_day] from public.quest_consequence_events where id = '10160000-0000-4000-8000-500000000001'),
  array[1495, 2, 2], 'a jump performs the event on its own due day, not the day the calendar landed on');

select is(
  (select count(*)::integer from public.campaign_messages
    where campaign_id = '10160000-0000-4000-8000-200000000001' and message = 'The bridge collapses.'),
  1, 'the broadcast is sent once');

select is(
  (select count(*)::integer from public.quest_consequence_events
    where id in ('10160000-0000-4000-8000-500000000003', '10160000-0000-4000-8000-500000000004', '10160000-0000-4000-8000-500000000006')
      and performed_at is not null),
  0, 'a held, an undone and an unplaceable event never fire on a date');

select is(
  (select performed_at from public.quest_consequence_events where id = '10160000-0000-4000-8000-500000000005'),
  null, 'an event forty days out is still waiting');

select is(
  (select performed_at from public.quest_consequence_events where id = '10160000-0000-4000-8000-500000000007'),
  null, 'another campaign''s due event is untouched by this campaign''s date');

-- ── A second move does not repeat anything ──────────────────────────────────

select lives_ok($q$
  update public.campaigns set current_day = 11 where id = '10160000-0000-4000-8000-200000000001'
$q$, 'the date moves again');

select is(
  (select count(*)::integer from public.campaign_messages
    where campaign_id = '10160000-0000-4000-8000-200000000001' and message = 'The bridge collapses.'),
  1, 'a performed event is not performed twice');

-- ── A calendar switch restamps what is waiting ──────────────────────────────

select is(
  (select array[due_on_year, due_on_month, due_on_day] from public.quest_consequence_events where id = '10160000-0000-4000-8000-500000000005'),
  array[1495, 3, 7], 'forty days on Harptos crosses Midwinter');

update public.campaigns set calendar_id = 'eberron' where id = '10160000-0000-4000-8000-200000000001';

select is(
  (select array[due_on_year, due_on_month, due_on_day] from public.quest_consequence_events where id = '10160000-0000-4000-8000-500000000005'),
  array[1495, 3, 12], 'on Eberron''s 28-day months the same wait ends on 12 Therendor');

select is(
  (select array[due_on_year, due_on_month, due_on_day] from public.quest_consequence_events where id = '10160000-0000-4000-8000-500000000001'),
  array[1495, 2, 2], 'a performed event keeps the due date it fired on');

-- ── The DM moving the date through the API fires it the same way ───────────

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10160000-0000-4000-8000-100000000001', true);

select lives_ok($q$
  update public.campaigns set current_month = 3, current_day = 12 where id = '10160000-0000-4000-8000-200000000001'
$q$, 'the DM moves the date to 12 Therendor');

reset role;

select isnt(
  (select performed_at from public.quest_consequence_events where id = '10160000-0000-4000-8000-500000000005'),
  null, 'the event fires under the DM''s own update');

-- ── Nobody can call the firing directly ─────────────────────────────────────

set local role authenticated;
select throws_ok(
  $q$select private.fire_due_consequences('10160000-0000-4000-8000-200000000002', 9999, 1, 1)$q$,
  '42501', null, 'a signed-in user cannot fire another campaign''s consequences by calling the function');
reset role;

select * from finish();
rollback;
