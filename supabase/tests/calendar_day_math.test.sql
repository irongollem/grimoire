-- #1016: the server's copy of in-world day arithmetic.
--
-- Cover for migration 20261011214845. A delayed quest consequence is due on
-- `fires_on + after_days` on the campaign's calendar, and the server now
-- computes that itself (private.calendar_add_days over private.calendar_shape),
-- so the built-in calendar shapes exist twice: in the TS registry
-- (src/settings/index.ts) and in calendar_shape. The expected_calendar_shapes
-- list below is held equal to the function here and to the registry by
-- src/settings/calendarShapeMirror.test.ts, which parses this block. Edit the
-- block, the function and the registry together.
--
-- The arithmetic itself mirrors addDays in src/lib/calendar/dayMath.ts; the
-- cases below are the ones that went wrong in the client before #766
-- (intercalary days, Harptos's leap-only Shieldmeet, Gregorian's folded-in
-- 29th of February) plus what only the server has to say (a malformed custom
-- calendar, an unplaceable date, a delay of millions of days).

begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

create temp table expected_calendar_shapes (calendar_id text primary key, shape jsonb not null);

insert into expected_calendar_shapes (calendar_id, shape) values
  ('faerun', '{"months": [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], "intercalary": [{"after": 1, "leap_only": false}, {"after": 4, "leap_only": false}, {"after": 7, "leap_only": false}, {"after": 7, "leap_only": true}, {"after": 9, "leap_only": false}, {"after": 11, "leap_only": false}], "leap_rule": "every4", "leap_month": null}'),
  ('eberron', '{"months": [28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], "intercalary": [], "leap_rule": "none", "leap_month": null}'),
  ('greyhawk', '{"months": [28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], "intercalary": [{"after": 12, "leap_only": false}, {"after": 3, "leap_only": false}, {"after": 6, "leap_only": false}, {"after": 9, "leap_only": false}], "leap_rule": "none", "leap_month": null}'),
  ('dragonlance', '{"months": [28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], "intercalary": [], "leap_rule": "none", "leap_month": null}'),
  ('ravenloft', '{"months": [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], "intercalary": [{"after": 6, "leap_only": false}, {"after": 12, "leap_only": false}], "leap_rule": "none", "leap_month": null}'),
  ('planescape', '{"months": [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], "intercalary": [{"after": 3, "leap_only": false}, {"after": 6, "leap_only": false}, {"after": 9, "leap_only": false}, {"after": 12, "leap_only": false}], "leap_rule": "none", "leap_month": null}'),
  ('spelljammer', '{"months": [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], "intercalary": [{"after": 3, "leap_only": false}, {"after": 6, "leap_only": false}, {"after": 9, "leap_only": false}], "leap_rule": "none", "leap_month": null}'),
  ('darksun', '{"months": [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], "intercalary": [{"after": 4, "leap_only": false}, {"after": 8, "leap_only": false}, {"after": 11, "leap_only": false}], "leap_rule": "none", "leap_month": null}'),
  ('mystara', '{"months": [28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], "intercalary": [{"after": 2, "leap_only": false}, {"after": 6, "leap_only": false}, {"after": 9, "leap_only": false}, {"after": 12, "leap_only": false}], "leap_rule": "none", "leap_month": null}'),
  ('gregorian', '{"months": [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], "intercalary": [], "leap_rule": "gregorian", "leap_month": 2}');

-- ── Shapes ──────────────────────────────────────────────────────────────────

select is(
  (select count(*)::integer from expected_calendar_shapes
    where private.calendar_shape(calendar_id, null) is distinct from shape),
  0, 'calendar_shape gives every built-in calendar the shape the TS registry has');

select is(private.calendar_shape('no-such-calendar', null),
  (select shape from expected_calendar_shapes where calendar_id = 'faerun'),
  'an unknown calendar id falls back to Faerûn, as getCalendarAdapter does');

select is(private.calendar_shape('custom', null),
  (select shape from expected_calendar_shapes where calendar_id = 'faerun'),
  'custom with no stored definition falls back to Faerûn too');

select is(
  private.calendar_shape('custom', '{"name": "Tides", "months": [{"name": "Ebb", "days": 10}, {"name": "Flow", "days": 12}], "intercalaryDays": [{"name": "Slack", "afterMonth": 1, "description": "", "isLeapOnly": true}], "leapYearRule": "every4"}'),
  '{"months": [10, 12], "intercalary": [{"after": 1, "leap_only": true}], "leap_rule": "every4", "leap_month": null}'::jsonb,
  'a custom calendar is read from the campaign''s stored definition');

select is(
  private.calendar_shape('custom', '{"months": [{"days": 10}], "leapYearRule": "every7"}') ->> 'leap_rule',
  'none', 'a leap rule calendarDefToAdapter does not know never leaps');

select is(private.calendar_shape('custom', '{"months": "twelve"}'), null,
  'a custom definition without a month list is unreadable');
select is(private.calendar_shape('custom', '{"months": [{"days": "thirty"}]}'), null,
  'a month without a numeric length is unreadable');
select is(private.calendar_shape('custom', '{"months": []}'), null,
  'a calendar with no months is unreadable');
select is(private.calendar_shape('custom', '{"months": [{"days": 30}], "intercalaryDays": [{"name": "x"}]}'), null,
  'an intercalary day that names no month is unreadable');

-- ── Arithmetic ──────────────────────────────────────────────────────────────

select is(private.calendar_add_days(private.calendar_shape('faerun', null), 1495, 1, 28, 0),
  array[1495, 1, 28], 'zero days is the same day');
select is(private.calendar_add_days(private.calendar_shape('faerun', null), 1495, 1, 28, 5),
  array[1495, 2, 2], 'Midwinter counts as an elapsed day');
select is(private.calendar_add_days(private.calendar_shape('faerun', null), 1495, 1, 30, 1),
  array[1495, 2, 1], 'a day landing on Midwinter rolls forward to the next dated day');
select is(private.calendar_add_days(private.calendar_shape('faerun', null), 1496, 7, 30, 3),
  array[1496, 8, 1], 'in a Harptos leap year Midsummer and Shieldmeet both elapse');
select is(private.calendar_add_days(private.calendar_shape('faerun', null), 1495, 7, 30, 3),
  array[1495, 8, 2], 'outside one, only Midsummer does');
select is(private.calendar_add_days(private.calendar_shape('faerun', null), 1495, 12, 30, 1),
  array[1496, 1, 1], 'the year turns over');
select is(private.calendar_add_days(private.calendar_shape('greyhawk', null), 1, 12, 28, 1),
  array[2, 1, 1], 'an intercalary week after the last month sits at the end of the year');
select is(private.calendar_add_days(private.calendar_shape('gregorian', null), 2024, 2, 28, 1),
  array[2024, 2, 29], 'Gregorian February has a 29th in a leap year');
select is(private.calendar_add_days(private.calendar_shape('gregorian', null), 1900, 2, 28, 1),
  array[1900, 3, 1], 'but not in a century year that is not divisible by 400');
select is(private.calendar_add_days(private.calendar_shape('gregorian', null), 2000, 1, 1, 146097),
  array[2400, 1, 1], 'a whole 400-year Gregorian cycle is 146097 days');
select is(private.calendar_add_days(private.calendar_shape('eberron', null), 998, 1, 1, 2000000000),
  array[5953378, 12, 13], 'a delay of two billion days is a division, not a walk');
select is(private.calendar_add_days(private.calendar_shape('faerun', null), 1495, 13, 1, 1), null,
  'a month the calendar does not have cannot be placed');
select is(private.calendar_add_days(private.calendar_shape('faerun', null), null, 1, 1, 1), null,
  'a date with no year cannot be placed');
select is(private.calendar_add_days(null, 1495, 1, 1, 1), null,
  'an unreadable calendar places nothing');
select is(
  private.calendar_add_days(private.calendar_shape('custom', '{"months": [{"days": 10}, {"days": 12}], "intercalaryDays": [{"afterMonth": 1, "isLeapOnly": true}], "leapYearRule": "every4"}'), 4, 1, 10, 2),
  array[4, 2, 1], 'a custom calendar''s leap-only day elapses in its leap year');

select * from finish();
rollback;
