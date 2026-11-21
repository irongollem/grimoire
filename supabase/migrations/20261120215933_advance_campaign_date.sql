-- The server moves a campaign's date itself (#1021 rows 7 and 8).
--
-- The AI table's Narrator passes days (`pass_days`). Until now the server only told the browser, which wrote
-- `campaigns.current_*` through `useSetCampaignToday`, so a table with no browser open could not move time. This
-- function lets the turn write it, on the campaign's own calendar (`private.calendar_add_days` over
-- `private.calendar_shape`, the same arithmetic the due-date stamps use), and the existing trigger
-- `campaigns_fire_due_consequences` fires whatever falls due on the way, as it does for the Calendar page's write.
--
-- SECURITY INVOKER on purpose: the caller's own row-level security decides who may move the date
-- (`campaigns_update`: the owner or a DM of the campaign), so this is not a definer and is not on the definer
-- registry. A caller the policy refuses updates no row, and that is refused here with an error rather than a
-- silent nothing.

create function public.advance_campaign_date(p_campaign_id uuid, p_days integer)
returns table (year integer, month integer, day integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_next integer[];
begin
  -- The Narrator's tool takes 1 to 60 days (`PASS_DAYS_TOOL`); anything else is a caller bug, never a quiet clamp.
  if p_days is null or p_days < 1 or p_days > 60 then
    raise exception 'advance_campaign_date: days must be between 1 and 60, got %', p_days using errcode = '22023';
  end if;

  select private.calendar_add_days(
           private.calendar_shape(c.calendar_id, c.custom_calendar),
           c.current_year, c.current_month, c.current_day, p_days)
    into v_next
    from public.campaigns c
   where c.id = p_campaign_id;

  -- No row: the campaign does not exist or the caller cannot see it (every campaign has a date: the columns are not null).
  if v_next is null then
    raise exception 'advance_campaign_date: no campaign % for this caller', p_campaign_id using errcode = 'P0002';
  end if;

  update public.campaigns c
     set current_year = v_next[1], current_month = v_next[2], current_day = v_next[3]
   where c.id = p_campaign_id;

  -- The read above passes the select policy; the write must pass the update policy too (a player may read, not move time).
  if not found then
    raise exception 'advance_campaign_date: not allowed to move the date of campaign %', p_campaign_id using errcode = '42501';
  end if;

  return query select v_next[1], v_next[2], v_next[3];
end;
$$;

revoke execute on function public.advance_campaign_date(uuid, integer) from public, anon;
grant execute on function public.advance_campaign_date(uuid, integer) to authenticated, service_role;

comment on function public.advance_campaign_date(uuid, integer) is
  'Moves the campaign''s date forward by 1 to 60 days on its own calendar (#1021). Security invoker: the campaigns '
  'update policy decides who may. Fires due consequences through the campaigns trigger.';
