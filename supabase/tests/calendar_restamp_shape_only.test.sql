-- #1086 / 20261021163240: a custom calendar's moons and seasons ride in
-- `campaigns.custom_calendar`, and editing them must not restamp the
-- campaign's waiting quest consequences. Changing a month length must.
--
-- The probe: a pending event's due date is overwritten by hand (a direct
-- update of due_on_* does not fire the stamp trigger, which watches only
-- after_days and fires_on_*). If the calendar trigger restamps, the hand-set
-- date is replaced by the computed one; if it does not, it survives.

begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

set local grimoire.bypass_quota = 'on';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('10860000-0000-4000-8000-100000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sky1086-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name, calendar_id, custom_calendar, current_year, current_month, current_day) values
  ('10860000-0000-4000-8000-200000000001', '10860000-0000-4000-8000-100000000001', 'Sky table', 'custom',
   '{"name": "Two moons", "epochName": "AY", "defaultYear": 1, "weekStyle": "weekly",
     "months": [{"name": "First", "days": 30}, {"name": "Second", "days": 30}, {"name": "Third", "days": 30}],
     "intercalaryDays": [], "leapYearRule": "none",
     "moons": [{"name": "Pale", "cycleDays": 28, "fullOn": {"year": 1, "month": 1, "day": 1}}],
     "seasons": [{"name": "Wet", "startsOn": {"month": 1, "day": 1}}]}'::jsonb,
   1, 1, 1);
insert into public.quests (id, user_id, campaign_id, title, status) values
  ('10860000-0000-4000-8000-300000000001', '10860000-0000-4000-8000-100000000001', '10860000-0000-4000-8000-200000000001', 'The tide', 'active');
insert into public.quest_beat_transitions (id, campaign_id, transition_kind, provenance, runtime_version) values
  ('10860000-0000-4000-8000-400000000001', '10860000-0000-4000-8000-200000000001', 'enter', '{}'::jsonb, 1);
insert into public.quest_consequence_events
  (id, campaign_id, quest_id, transition_id, action, action_payload, after_days, fires_on_year, fires_on_month, fires_on_day) values
  ('10860000-0000-4000-8000-500000000001', '10860000-0000-4000-8000-200000000001', '10860000-0000-4000-8000-300000000001', '10860000-0000-4000-8000-400000000001',
   'send_broadcast', '{"message": "The tide turns."}', 40, 1, 1, 1);

select is(
  (select array[due_on_year, due_on_month, due_on_day] from public.quest_consequence_events where id = '10860000-0000-4000-8000-500000000001'),
  array[1, 2, 11], 'forty days after 1 First, on thirty-day months, is 11 Second');

-- The probe: a due date the calendar trigger would overwrite if it ran.
update public.quest_consequence_events set due_on_year = 9, due_on_month = 9, due_on_day = 9
 where id = '10860000-0000-4000-8000-500000000001';

update public.campaigns
   set custom_calendar = jsonb_set(jsonb_set(custom_calendar, '{moons,0,name}', '"Silver"'), '{seasons,0,name}', '"Rains"')
 where id = '10860000-0000-4000-8000-200000000001';

select is(
  (select array[due_on_year, due_on_month, due_on_day] from public.quest_consequence_events where id = '10860000-0000-4000-8000-500000000001'),
  array[9, 9, 9], 'renaming a moon and a season does not restamp waiting consequences');

update public.campaigns
   set custom_calendar = jsonb_set(custom_calendar, '{months,0,days}', '20')
 where id = '10860000-0000-4000-8000-200000000001';

select is(
  (select array[due_on_year, due_on_month, due_on_day] from public.quest_consequence_events where id = '10860000-0000-4000-8000-500000000001'),
  array[1, 2, 21], 'shortening a month restamps: forty days after 1 First, a month of twenty, is 21 Second');

select * from finish();
rollback;
