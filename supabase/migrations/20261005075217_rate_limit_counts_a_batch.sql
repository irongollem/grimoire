-- A rate-limited action can be charged for several units at once (#972,
-- story 13).
--
-- `embed-content` is gaining a batch mode for a user's own rows (a bulk create
-- or a site publish embedding every room in one call instead of one call per
-- row). The `entity_embedding` limit counts embeddings, not requests, so a
-- batch of 40 must spend 40 of the day's allowance, and be refused whole if it
-- does not fit, rather than slipping through as one event.
--
-- `p_cost` defaults to 1, so every existing caller behaves exactly as before.
-- The argument list changes, so the function is dropped and recreated rather
-- than replaced (a replace would add an overload beside the old one). Grants
-- are restored as they were: service role only.

drop function public.check_rate_limit(uuid, text, integer, integer);

create function public.check_rate_limit(
  p_user_id uuid,
  p_action text,
  p_limit integer,
  p_window_seconds integer,
  p_cost integer default 1
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count integer;
begin
  if p_cost is null or p_cost < 1 then
    raise exception 'check_rate_limit: cost must be at least 1';
  end if;

  -- Serialize this user's checks for this action so concurrent requests can't
  -- both observe the same pre-insert count and slip past the limit.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_action, 0));

  select count(*) into v_count
    from rate_limit_events
   where user_id = p_user_id
     and action  = p_action
     and created_at > now() - make_interval(secs => p_window_seconds);

  if v_count + p_cost > p_limit then
    return false;
  end if;

  insert into rate_limit_events (user_id, action)
  select p_user_id, p_action from generate_series(1, p_cost);
  return true;
end;
$function$;

revoke execute on function public.check_rate_limit(uuid, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(uuid, text, integer, integer, integer) to service_role;
