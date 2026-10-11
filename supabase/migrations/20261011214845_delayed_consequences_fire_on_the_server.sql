-- #1016: a delayed quest consequence fires on the server, on the date change,
-- the same way an overdue objective fails.
--
-- Until now a `quest_consequence_events` row with `after_days > 0` waited for
-- the DM shell: `useDueConsequences` watched the campaign's today, added
-- `after_days` to `fires_on` with the campaign's CalendarAdapter, and called
-- `perform_quest_consequence` once per due row. So nothing fired unless a DM
-- had the app open, two open tabs raced each other, a failure partway left the
-- rest waiting, and a late firing was stamped with whatever day the DM next
-- looked. Overdue objectives (`campaigns_fail_overdue_objectives`, #1011) never
-- had any of those problems because they were already a trigger.
--
-- The issue proposed storing the due date and having the client pass it in,
-- since the client holds the calendar. That does not reach every writer: the
-- rows are written by `private.apply_quest_consequences`, which eight server
-- paths call, one of them the date-change trigger itself (an objective that
-- fails overdue can fire a rule with a delay), and no client is present there.
-- So the server does the calendar arithmetic. That is not a per-calendar port:
-- a calendar here is plain data (`SettingCalendarDef`: month lengths,
-- intercalary days, one of three leap rules), custom calendars are already
-- stored as that JSON on `campaigns.custom_calendar`, and Gregorian differs
-- only in folding its leap day into February. One generic walk over that data
-- mirrors `addDays` in `src/lib/calendar/dayMath.ts`.
--
-- The due date is stored (`due_on_*`), stamped when the row is written and
-- restamped if the campaign changes calendar, so firing is the same tuple
-- comparison `fail_overdue_objectives` makes, and the dashboard's "Quest
-- consequences due" widget reads the date the engine will use instead of
-- computing its own.
--
-- The built-in shapes in `private.calendar_shape` are a copy of the TS
-- registry (`src/settings/index.ts`). `supabase/tests/calendar_day_math.test.sql`
-- holds the function equal to a list, and `src/settings/calendarShapeMirror.test.ts`
-- holds that list equal to the registry, so neither side can change alone.

-- ── Calendar shapes ─────────────────────────────────────────────────────────

-- The campaign's calendar as the arithmetic needs it:
--   {"months": [days, ...], "intercalary": [{"after": m, "leap_only": b}, ...],
--    "leap_rule": "none" | "every4" | "gregorian", "leap_month": m | null}
-- Resolves ids the way `getCalendarAdapter` does: 'custom' with a definition
-- reads it, anything else unknown (or 'custom' with none) is Faerûn. A custom
-- definition too malformed to read returns null, which leaves the due date
-- unplaceable, as the client's adapter would have.
create function private.calendar_shape(p_calendar_id text, p_custom jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_calendar_id = 'custom' and p_custom is not null then
    -- Sequential checks: an OR is not guaranteed to short-circuit, and
    -- jsonb_array_elements raises on anything but an array.
    if jsonb_typeof(p_custom -> 'months') is distinct from 'array'
       or jsonb_array_length(p_custom -> 'months') = 0 then
      return null;
    end if;
    if exists (select 1 from jsonb_array_elements(p_custom -> 'months') m
                where jsonb_typeof(m -> 'days') is distinct from 'number') then
      return null;
    end if;
    if p_custom ? 'intercalaryDays' then
      if jsonb_typeof(p_custom -> 'intercalaryDays') is distinct from 'array' then
        return null;
      end if;
      if exists (select 1 from jsonb_array_elements(p_custom -> 'intercalaryDays') d
                  where jsonb_typeof(d -> 'afterMonth') is distinct from 'number') then
        return null;
      end if;
    end if;

    return jsonb_build_object(
      'months', (select jsonb_agg((m -> 'days')::integer order by i)
                   from jsonb_array_elements(p_custom -> 'months') with ordinality t(m, i)),
      'intercalary', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'after', (d -> 'afterMonth')::integer,
                 'leap_only', coalesce(d -> 'isLeapOnly' = 'true'::jsonb, false)) order by i)
          from jsonb_array_elements(coalesce(p_custom -> 'intercalaryDays', '[]'::jsonb)) with ordinality t(d, i)
      ), '[]'::jsonb),
      -- calendarDefToAdapter: anything but every4 or gregorian never leaps.
      'leap_rule', case when p_custom ->> 'leapYearRule' in ('every4', 'gregorian')
                        then p_custom ->> 'leapYearRule' else 'none' end,
      'leap_month', null
    );
  end if;

  return case p_calendar_id
    when 'eberron' then '{"months": [28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], "intercalary": [], "leap_rule": "none", "leap_month": null}'
    when 'greyhawk' then '{"months": [28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], "intercalary": [{"after": 12, "leap_only": false}, {"after": 3, "leap_only": false}, {"after": 6, "leap_only": false}, {"after": 9, "leap_only": false}], "leap_rule": "none", "leap_month": null}'
    when 'dragonlance' then '{"months": [28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], "intercalary": [], "leap_rule": "none", "leap_month": null}'
    when 'ravenloft' then '{"months": [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], "intercalary": [{"after": 6, "leap_only": false}, {"after": 12, "leap_only": false}], "leap_rule": "none", "leap_month": null}'
    when 'planescape' then '{"months": [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], "intercalary": [{"after": 3, "leap_only": false}, {"after": 6, "leap_only": false}, {"after": 9, "leap_only": false}, {"after": 12, "leap_only": false}], "leap_rule": "none", "leap_month": null}'
    when 'spelljammer' then '{"months": [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], "intercalary": [{"after": 3, "leap_only": false}, {"after": 6, "leap_only": false}, {"after": 9, "leap_only": false}], "leap_rule": "none", "leap_month": null}'
    when 'darksun' then '{"months": [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], "intercalary": [{"after": 4, "leap_only": false}, {"after": 8, "leap_only": false}, {"after": 11, "leap_only": false}], "leap_rule": "none", "leap_month": null}'
    when 'mystara' then '{"months": [28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], "intercalary": [{"after": 2, "leap_only": false}, {"after": 6, "leap_only": false}, {"after": 9, "leap_only": false}, {"after": 12, "leap_only": false}], "leap_rule": "none", "leap_month": null}'
    when 'gregorian' then '{"months": [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], "intercalary": [], "leap_rule": "gregorian", "leap_month": 2}'
    else '{"months": [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], "intercalary": [{"after": 1, "leap_only": false}, {"after": 4, "leap_only": false}, {"after": 7, "leap_only": false}, {"after": 7, "leap_only": true}, {"after": 9, "leap_only": false}, {"after": 11, "leap_only": false}], "leap_rule": "every4", "leap_month": null}'
  end::jsonb;
end
$$;

create function private.calendar_is_leap(p_rule text, p_year bigint)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_rule
    when 'every4' then p_year % 4 = 0
    when 'gregorian' then p_year % 4 = 0 and (p_year % 100 <> 0 or p_year % 400 = 0)
    else false
  end
$$;

-- Days in the year before day 1 of `p_month` (pass month count + 1 for the
-- whole year): the earlier months, a folded-in leap day (Gregorian's 29th of
-- February), and every intercalary day that exists this year and sits after
-- one of those months. An intercalary day naming a month the calendar does not
-- have is never counted, as `buildYearIndex` never reaches it.
create function private.calendar_days_before_month(
  p_months integer[], p_after integer[], p_leap_only boolean[],
  p_leap_month integer, p_leap boolean, p_month integer
)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select coalesce((select sum(p_months[m]) from generate_series(1, p_month - 1) m), 0)
       + case when p_leap and p_leap_month between 1 and p_month - 1 then 1 else 0 end
       + (select count(*) from generate_series(1, coalesce(cardinality(p_after), 0)) i
           where p_after[i] between 1 and least(p_month - 1, cardinality(p_months))
             and (not p_leap_only[i] or p_leap))
$$;

-- `p_days` in-world days after (year, month, day), as {year, month, day}: the
-- port of `addDays` in src/lib/calendar/dayMath.ts. Intercalary days count as
-- elapsed days, and a result that lands on one rolls forward to the next dated
-- day, because a stored date has no way to name a festival.
--
-- Where `addDays` returns its input unchanged for a date it cannot place, this
-- returns null: the stored due date is then unplaceable, and an unplaceable
-- date never fires, which is what the client's `isOnOrBefore` concluded from it.
-- Whole leap cycles (4 or 400 years) are skipped in one step, so a DM typing a
-- huge delay costs a division rather than a walk through every year.
create function private.calendar_add_days(
  p_shape jsonb, p_year integer, p_month integer, p_day integer, p_days integer
)
returns integer[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_months integer[];
  v_after integer[];
  v_leap_only boolean[];
  v_rule text := p_shape ->> 'leap_rule';
  v_leap_month integer := (p_shape ->> 'leap_month')::integer;
  v_n integer;
  v_cycle integer;
  v_cycle_days bigint := 0;
  v_year bigint := p_year;
  v_ord bigint;
  v_len bigint;
  v_start bigint;
  v_leap boolean;
  v_k bigint;
begin
  if p_shape is null or p_year is null or p_month is null or p_day is null
     or p_days is null or p_days < 0 then
    return null;
  end if;

  select array_agg(m::integer order by i) into v_months
    from jsonb_array_elements_text(p_shape -> 'months') with ordinality t(m, i);
  select coalesce(array_agg((d ->> 'after')::integer order by i), '{}'),
         coalesce(array_agg((d ->> 'leap_only')::boolean order by i), '{}')
    into v_after, v_leap_only
    from jsonb_array_elements(p_shape -> 'intercalary') with ordinality t(d, i);
  v_n := coalesce(cardinality(v_months), 0);
  if v_n = 0 or p_month < 1 or p_month > v_n then
    return null;
  end if;

  v_ord := private.calendar_days_before_month(v_months, v_after, v_leap_only, v_leap_month,
             private.calendar_is_leap(v_rule, v_year), p_month) + p_day + p_days;

  v_cycle := case v_rule when 'every4' then 4 when 'gregorian' then 400 else 1 end;
  for i in 0 .. v_cycle - 1 loop
    v_cycle_days := v_cycle_days + private.calendar_days_before_month(v_months, v_after, v_leap_only,
                      v_leap_month, private.calendar_is_leap(v_rule, v_year + i), v_n + 1);
  end loop;
  if v_cycle_days <= 0 or v_ord < 1 then
    return null;
  end if;
  if v_ord > v_cycle_days then
    v_k := (v_ord - 1) / v_cycle_days;
    v_year := v_year + v_k * v_cycle;
    v_ord := v_ord - v_k * v_cycle_days;
  end if;

  -- Fewer than one cycle left, and the cycle's years sum to at least v_ord.
  loop
    v_len := private.calendar_days_before_month(v_months, v_after, v_leap_only, v_leap_month,
               private.calendar_is_leap(v_rule, v_year), v_n + 1);
    exit when v_ord <= v_len;
    v_ord := v_ord - v_len;
    v_year := v_year + 1;
  end loop;

  -- Roll forward off an intercalary day; a year is finite, so this ends.
  for guard in 0 .. v_len loop
    v_leap := private.calendar_is_leap(v_rule, v_year);
    for m in 1 .. v_n loop
      v_start := private.calendar_days_before_month(v_months, v_after, v_leap_only, v_leap_month, v_leap, m);
      if v_ord > v_start
         -- Parenthesised: an IF condition otherwise ends at the CASE's own THEN.
         and v_ord <= v_start + v_months[m] + (case when v_leap and m = v_leap_month then 1 else 0 end) then
        return array[v_year, m, v_ord - v_start]::integer[];
      end if;
    end loop;
    v_ord := v_ord + 1;
    v_len := private.calendar_days_before_month(v_months, v_after, v_leap_only, v_leap_month, v_leap, v_n + 1);
    if v_ord > v_len then
      v_ord := v_ord - v_len;
      v_year := v_year + 1;
    end if;
  end loop;
  return null;
end
$$;

-- `fires_on + after_days` on the campaign's own calendar.
create function private.consequence_due_on(
  p_campaign_id uuid, p_year integer, p_month integer, p_day integer, p_after_days integer
)
returns integer[]
language sql
stable
set search_path = ''
as $$
  select private.calendar_add_days(
           private.calendar_shape(c.calendar_id, c.custom_calendar),
           p_year, p_month, p_day, p_after_days)
    from public.campaigns c
   where c.id = p_campaign_id
$$;

-- ── The due date, stored ────────────────────────────────────────────────────

alter table public.quest_consequence_events
  add column due_on_year integer,
  add column due_on_month integer,
  add column due_on_day integer;

comment on column public.quest_consequence_events.due_on_year is
  'The in-world day this event is due: fires_on + after_days on the campaign''s calendar, stamped on write by '
  'quest_consequence_events_due_on and restamped when the campaign changes calendar. Null when the calendar '
  'cannot place it, which never fires. A pending, unheld row fires when campaigns.current_* reaches it '
  '(campaigns_fire_due_consequences, #1016).';

update public.quest_consequence_events e
   set due_on_year = d.due[1], due_on_month = d.due[2], due_on_day = d.due[3]
  from (select x.id, private.consequence_due_on(x.campaign_id, x.fires_on_year, x.fires_on_month, x.fires_on_day, x.after_days) as due
          from public.quest_consequence_events x) d
 where e.id = d.id;

create function private.stamp_consequence_due_on()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_due integer[];
begin
  v_due := private.consequence_due_on(new.campaign_id, new.fires_on_year, new.fires_on_month, new.fires_on_day, new.after_days);
  new.due_on_year := v_due[1];
  new.due_on_month := v_due[2];
  new.due_on_day := v_due[3];
  return new;
end
$$;

create trigger quest_consequence_events_due_on
  before insert or update of after_days, fires_on_year, fires_on_month, fires_on_day
  on public.quest_consequence_events
  for each row execute procedure private.stamp_consequence_due_on();

-- ── Firing ──────────────────────────────────────────────────────────────────

-- Every pending, unheld, un-undone delayed event due on or before the given
-- day, in log order, through the same internals the DM's Fire button uses. A
-- held payoff fires only from that button, whatever delay it also carries.
-- Each is stamped with its own due day rather than the day the calendar landed
-- on: a jump of a tenday performs "three days later, the bridge collapses" on
-- the third day, and its calendar event is dated there.
--
-- An error (a payload the action cannot perform) aborts the date change with
-- it, as one does a beat advance or an overdue objective's cascade: the DM sees
-- it, and no row is left half-applied behind a date that moved on.
create function private.fire_due_consequences(p_campaign_id uuid, p_year integer, p_month integer, p_day integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ev record;
begin
  for v_ev in
    select e.id, e.due_on_year, e.due_on_month, e.due_on_day
      from public.quest_consequence_events e
     where e.campaign_id = p_campaign_id
       and e.performed_at is null
       and e.undone_at is null
       and e.held_at is null
       and e.after_days > 0
       and e.due_on_year is not null
       and (e.due_on_year, e.due_on_month, e.due_on_day) <= (p_year, p_month, p_day)
     order by e.seq
  loop
    perform private.perform_quest_consequence(v_ev.id, v_ev.due_on_year, v_ev.due_on_month, v_ev.due_on_day);
  end loop;
end
$$;

revoke execute on function private.fire_due_consequences(uuid, integer, integer, integer) from public, anon, authenticated;

create function private.fire_due_consequences_on_date_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.fire_due_consequences(new.id, new.current_year, new.current_month, new.current_day);
  return null;
end
$$;

-- Sorts after campaigns_fail_overdue_objectives, so a delay an overdue
-- objective's rule just wrote is already on the log (and, being delayed, not
-- yet due).
create trigger campaigns_fire_due_consequences
  after update of current_year, current_month, current_day on public.campaigns
  for each row
  when ((old.current_year, old.current_month, old.current_day)
        is distinct from (new.current_year, new.current_month, new.current_day))
  execute procedure private.fire_due_consequences_on_date_change();

-- A pending row's due date was computed on the calendar the campaign had when
-- it was written. The client always read it on the current one, so a calendar
-- switch restamps what is still waiting, then fires anything that is now due.
-- Named to sort before campaigns_fire_due_consequences, so one update that
-- changes both the calendar and the date fires on the new calendar's dates.
create function private.restamp_consequence_due_on()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.quest_consequence_events e
     set due_on_year = d.due[1], due_on_month = d.due[2], due_on_day = d.due[3]
    from (select x.id, private.consequence_due_on(x.campaign_id, x.fires_on_year, x.fires_on_month, x.fires_on_day, x.after_days) as due
            from public.quest_consequence_events x
           where x.campaign_id = new.id and x.performed_at is null and x.undone_at is null) d
   where e.id = d.id;
  perform private.fire_due_consequences(new.id, new.current_year, new.current_month, new.current_day);
  return null;
end
$$;

create trigger campaigns_calendar_restamps_due_consequences
  after update of calendar_id, custom_calendar on public.campaigns
  for each row
  when (old.calendar_id is distinct from new.calendar_id or old.custom_calendar is distinct from new.custom_calendar)
  execute procedure private.restamp_consequence_due_on();

revoke execute on function private.stamp_consequence_due_on() from public, anon, authenticated;
revoke execute on function private.fire_due_consequences_on_date_change() from public, anon, authenticated;
revoke execute on function private.restamp_consequence_due_on() from public, anon, authenticated;

-- Anything already due when this lands fires now, instead of waiting for the
-- next date change (the shell used to catch these on its first look).
do $$
declare
  v_c record;
begin
  for v_c in
    select c.id, c.current_year, c.current_month, c.current_day
      from public.campaigns c
     where exists (select 1 from public.quest_consequence_events e
                    where e.campaign_id = c.id and e.performed_at is null and e.undone_at is null
                      and e.held_at is null and e.after_days > 0)
  loop
    perform private.fire_due_consequences(v_c.id, v_c.current_year, v_c.current_month, v_c.current_day);
  end loop;
end
$$;
