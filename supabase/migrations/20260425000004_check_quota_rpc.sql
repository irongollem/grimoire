-- Migration: check_quota_rpc
-- Central quota enforcement function. Called by useQuota composable before every create flow.
-- Admin bypass first, then plan lookup, then dynamic row count vs quota limit.

create or replace function public.check_quota(resource_type text)
returns jsonb
language plpgsql security definer
set search_path = public as $$
declare
  v_quotas  jsonb;
  v_limit   int;
  v_current int;
begin
  -- App admins are always unlimited — short-circuit before any DB work
  if (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' then
    return jsonb_build_object('allowed', true, 'current', 0, 'limit', -1, 'unlimited', true);
  end if;

  -- Validate resource_type to prevent arbitrary table scanning via dynamic SQL
  if resource_type not in (
    'campaigns', 'npcs', 'monsters', 'encounters', 'scriptorium_documents', 'notes'
  ) then
    raise exception 'invalid resource_type: %', resource_type;
  end if;

  -- Look up the user's plan quotas; default to free if no subscription row exists
  select p.quotas
    into v_quotas
    from user_subscriptions s
    join plans p on p.id = s.plan_id
   where s.user_id = auth.uid()
     and s.status in ('active', 'trialing');

  if not found then
    select quotas into v_quotas from plans where id = 'free';
  end if;

  -- Missing key in quotas JSONB = unlimited (pro plan has empty {})
  if not (v_quotas ? resource_type) then
    return jsonb_build_object('allowed', true, 'current', 0, 'limit', -1, 'unlimited', true);
  end if;

  v_limit := (v_quotas ->> resource_type)::int;

  -- Count the user's current rows in the relevant table
  execute format('select count(*) from %I where user_id = $1', resource_type)
    into v_current using auth.uid();

  return jsonb_build_object(
    'allowed',   v_current < v_limit,
    'current',   v_current,
    'limit',     v_limit,
    'unlimited', false
  );
end;
$$;
