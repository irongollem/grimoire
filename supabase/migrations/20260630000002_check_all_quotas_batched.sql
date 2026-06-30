-- Migration: check_all_quotas_batched
-- One RPC that returns every resource's quota in a single round-trip, so pages
-- needing the whole picture (e.g. the billing downgrade-impact panel) make one
-- call instead of one per resource. Mirrors check_quota's logic, looped.

create or replace function "public"."check_all_quotas"() returns "jsonb"
    language "plpgsql" security definer
    set "search_path" to 'public'
    as $_$
declare
  v_quotas  jsonb;
  v_result  jsonb := '{}'::jsonb;
  v_res     text;
  v_limit   int;
  v_current int;
  -- Keep this list in sync with check_quota's resource_type allowlist.
  v_resources text[] := array[
    'campaigns', 'npcs', 'monsters', 'encounters', 'scriptorium_documents', 'notes',
    'quests', 'factions', 'locations', 'deities', 'pantheons', 'puzzle_rooms',
    'sounds', 'soundboard_pages', 'soundboard_playlists'
  ];
begin
  -- App admins are always unlimited — short-circuit before any counting
  if (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' then
    foreach v_res in array v_resources loop
      v_result := v_result || jsonb_build_object(
        v_res, jsonb_build_object('allowed', true, 'current', 0, 'limit', -1, 'unlimited', true)
      );
    end loop;
    return v_result;
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

  foreach v_res in array v_resources loop
    -- Missing key in quotas JSONB = unlimited (pro plan has empty {})
    if not (v_quotas ? v_res) then
      v_result := v_result || jsonb_build_object(
        v_res, jsonb_build_object('allowed', true, 'current', 0, 'limit', -1, 'unlimited', true)
      );
    else
      v_limit := (v_quotas ->> v_res)::int;
      execute format('select count(*) from %I where user_id = $1', v_res)
        into v_current using auth.uid();
      v_result := v_result || jsonb_build_object(
        v_res, jsonb_build_object('allowed', v_current < v_limit, 'current', v_current, 'limit', v_limit, 'unlimited', false)
      );
    end if;
  end loop;

  return v_result;
end;
$_$;

-- Login-only RPC: keep it off the anon surface, grant to signed-in users + service role.
revoke execute on function "public"."check_all_quotas"() from public, anon;
grant execute on function "public"."check_all_quotas"() to authenticated, service_role;
