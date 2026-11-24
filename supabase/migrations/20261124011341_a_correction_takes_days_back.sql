-- A correction at the AI table can put the campaign's date back (#1021 row 23, "That's not what happened").
--
-- A correction is a step forward, not a rewind: the player says what happened instead and the Narrator repairs the
-- game with its tools. The date was the one thing out of reach ("Not possible yet: putting the campaign's date back"),
-- because the date only ever moved on (`advance_campaign_date`, 20261120215933; `private.calendar_add_days` refuses a
-- negative count). So a player who says "we never spent those three days in the swamp" kept the three days.
--
-- `private.calendar_sub_days` counts back on the campaign's own calendar: it steps into earlier years while the count
-- runs past the year's start, and then reads the month and day off the year's first day with `calendar_add_days`, so
-- every calendar shape (leap rules, intercalary days) is read by the one function that already knows them. A date that
-- lands on an intercalary day steps back off it, to the day before: forward arithmetic steps forward off one, and a
-- step back must not end up ahead of where it began.
--
-- `rewind_campaign_date` mirrors `advance_campaign_date`: security invoker, so the campaigns update policy decides who
-- may move time (the DM, never a player), 1 to 60 days, and an error rather than a quiet clamp. Consequences already
-- fired by the date stay fired: the Narrator repairs those with facts, as it repairs anything else a correction
-- undoes, and nothing due fires on a date moving backwards.

create or replace function private.calendar_sub_days(p_shape jsonb, p_year integer, p_month integer, p_day integer, p_days integer)
returns integer[]
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_months integer[];
  v_after integer[];
  v_leap_only boolean[];
  v_rule text := p_shape ->> 'leap_rule';
  v_leap_month integer := (p_shape ->> 'leap_month')::integer;
  v_n integer;
  v_year bigint := p_year;
  v_ord bigint;
  v_found integer[];
begin
  if p_shape is null or p_year is null or p_month is null or p_day is null or p_days is null or p_days < 0 then
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

  -- The day's place in its year, counted back, and into earlier years while it runs past the first day.
  v_ord := private.calendar_days_before_month(v_months, v_after, v_leap_only, v_leap_month,
             private.calendar_is_leap(v_rule, v_year), p_month) + p_day - p_days;
  while v_ord < 1 loop
    v_year := v_year - 1;
    v_ord := v_ord + private.calendar_days_before_month(v_months, v_after, v_leap_only, v_leap_month,
               private.calendar_is_leap(v_rule, v_year), v_n + 1);
  end loop;

  -- Read the date off the year's first day. An intercalary day is stepped off forwards by `calendar_add_days`, so a
  -- result that is not exactly that day means it landed on one: step back a day and read again.
  loop
    v_found := private.calendar_add_days(p_shape, v_year::integer, 1, 1, (v_ord - 1)::integer);
    if v_found is null then
      return null;
    end if;
    exit when private.calendar_days_before_month(v_months, v_after, v_leap_only, v_leap_month,
                private.calendar_is_leap(v_rule, v_found[1]), v_found[2]) + v_found[3] = v_ord
          and v_found[1] = v_year;
    v_ord := v_ord - 1;
    if v_ord < 1 then
      v_year := v_year - 1;
      v_ord := private.calendar_days_before_month(v_months, v_after, v_leap_only, v_leap_month,
                 private.calendar_is_leap(v_rule, v_year), v_n + 1);
    end if;
  end loop;
  return v_found;
end;
$function$;

-- Called by `rewind_campaign_date`, which runs as the caller: a signed-in caller needs it, an anonymous one never does.
revoke execute on function private.calendar_sub_days(jsonb, integer, integer, integer, integer) from public, anon;
grant execute on function private.calendar_sub_days(jsonb, integer, integer, integer, integer) to authenticated, service_role;

create or replace function public.rewind_campaign_date(p_campaign_id uuid, p_days integer)
returns table (year integer, month integer, day integer)
language plpgsql
set search_path = ''
as $function$
declare
  v_back integer[];
begin
  -- The correction's tool takes 1 to 60 days (`TAKE_DAYS_BACK_TOOL`); anything else is a caller bug, never a quiet clamp.
  if p_days is null or p_days < 1 or p_days > 60 then
    raise exception 'rewind_campaign_date: days must be between 1 and 60, got %', p_days using errcode = '22023';
  end if;

  select private.calendar_sub_days(
           private.calendar_shape(c.calendar_id, c.custom_calendar),
           c.current_year, c.current_month, c.current_day, p_days)
    into v_back
    from public.campaigns c
   where c.id = p_campaign_id;

  -- No row: the campaign does not exist or the caller cannot see it.
  if v_back is null then
    raise exception 'rewind_campaign_date: no campaign % for this caller', p_campaign_id using errcode = 'P0002';
  end if;

  update public.campaigns c
     set current_year = v_back[1], current_month = v_back[2], current_day = v_back[3]
   where c.id = p_campaign_id;

  -- The read passes the select policy; the write must pass the update policy too (a player may read, not move time).
  if not found then
    raise exception 'rewind_campaign_date: not allowed to move the date of campaign %', p_campaign_id using errcode = '42501';
  end if;

  return query select v_back[1], v_back[2], v_back[3];
end;
$function$;

revoke execute on function public.rewind_campaign_date(uuid, integer) from public, anon;
grant execute on function public.rewind_campaign_date(uuid, integer) to authenticated, service_role;
