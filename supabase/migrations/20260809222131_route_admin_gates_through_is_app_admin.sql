-- Migration: route_admin_gates_through_is_app_admin
--
-- Closes #640, which was reported as a tidiness issue -- get_admin_users()
-- duplicating the admin JWT check inline rather than calling
-- private.is_app_admin() -- and described the duplicate as "same logic today".
--
-- It is not the same logic today, and has not been since 20260809144926. That
-- migration made the helper total (`coalesce(..., false)`) precisely because a
-- non-admin's JWT has an `app_metadata` object with no `role` key, so the raw
-- comparison yields NULL rather than false. The inline copies did not follow,
-- and the negated ones are therefore the very NULL bypass 20260809144926 was
-- written to close, still open:
--
--   if (auth.jwt() -> 'app_metadata' ->> 'role') <> 'admin' then
--     raise exception 'Access denied';   -- NULL <> 'admin' is NULL, so
--   end if;                              -- `if NULL then` never fires
--
-- Verified against production before writing this: for a JWT carrying
-- app_metadata without a `role` key, that predicate is NULL while
-- private.is_app_admin() correctly answers false. Two SECURITY DEFINER
-- functions still gate on that shape, and both are EXECUTE-able by
-- `authenticated`:
--
--   * get_admin_users              -- every account's email, display name,
--                                     plan, credit balance, suspension and ban
--                                     state, to any logged-in user. This is the
--                                     same class of leak as get_user_ledger in
--                                     20260809144926, and it survived that fix
--                                     only because it never called the helper.
--   * get_credit_calibration_hints -- 30 days of aggregate per-generation cost
--                                     and pricing-calibration data.
--
-- So #640's "drift risk on the function that exposes every user's email" had
-- already become the drift.
--
-- THE FIX, in three widening rings:
--
--   1. The two negated guards above -- an authorization fix, not a refactor.
--   2. The two affirmative inline copies (check_quota, check_all_quotas). These
--      are correct today: used affirmatively, NULL denies exactly as false does,
--      so an ordinary user simply misses the admin-unlimited short-circuit and
--      falls through to normal quota accounting. They are converted anyway,
--      because "correct only in the affirmative direction" is exactly the state
--      that let this bug sit unnoticed in the helper for months.
--   3. The 18 RLS policies still comparing the claim inline. Same reasoning as
--      ring 2 -- all affirmative, all NULL-safe, all converted. 61 policies
--      already call the helper; these 18 were simply written before
--      20260629000002 relocated it.
--
-- Afterwards, exactly one place in the database reads
-- `auth.jwt() -> 'app_metadata' ->> 'role'` for an authorization decision:
-- private.is_app_admin() itself. (consume_app_invite still *writes*
-- raw_app_meta_data to grant the role -- that is the grant, not a gate.)
--
-- Regression cover lives in supabase/tests/admin_authorization_guards.test.sql,
-- alongside the 20260809144926 cases, and is written against the outcome
-- ("does the guard refuse?") rather than the body.

-- ── Ring 1: the two negated guards (authorization fix) ───────────────────────

-- Body restated verbatim from the live definition (20260628000003, which added
-- suspended_at/banned); only the guard changes. `create or replace` keeps the
-- existing ACL and the return type is unchanged.
create or replace function public.get_admin_users()
returns table (
  user_id      uuid,
  email        text,
  display_name text,
  created_at   timestamptz,
  plan_id      text,
  status       text,
  ai_credits   bigint,
  suspended_at timestamptz,
  banned       boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_app_admin() then
    raise exception 'Access denied';
  end if;

  return query
  select
    u.id                                          as user_id,
    u.email::text                                 as email,
    (u.raw_user_meta_data ->> 'display_name')     as display_name,
    u.created_at                                  as created_at,
    coalesce(s.plan_id, 'free')                   as plan_id,
    coalesce(s.status,  'active')                 as status,
    coalesce(b.balance, 0)::bigint                as ai_credits,
    s.suspended_at                                as suspended_at,
    (u.banned_until is not null and u.banned_until > now()) as banned
  from auth.users u
  left join user_subscriptions s on s.user_id = u.id
  left join ai_credit_balance   b on b.user_id = u.id
  order by u.created_at desc;
end;
$$;

-- Body restated verbatim from the live definition (20260508000001, as amended by
-- the credit-pack pricing work); only the guard changes.
create or replace function public.get_credit_calibration_hints()
returns table (
  generation_type      text,
  current_cost         integer,
  avg_actual_usd_cents numeric,
  sample_size          bigint,
  suggested_cost       integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min_samples    constant int     := 20;
  v_threshold      constant numeric := 0.20;
  v_cents_per_credit numeric;
begin
  if not private.is_app_admin() then
    raise exception 'Admin only';
  end if;

  -- Derive cents-per-credit from the cheapest pack for the buyer
  -- (fewest credits per euro = worst deal = highest cost per credit = conservative baseline)
  -- Prefer stripe_unit_amount (authoritative); fall back to eur_display * 100.
  select
    case
      when stripe_unit_amount is not null then stripe_unit_amount::numeric / credits
      else eur_display * 100.0 / credits
    end
  into v_cents_per_credit
  from credit_pack_config
  where credits > 0 and (stripe_unit_amount is not null or eur_display > 0)
  order by
    case
      when stripe_unit_amount is not null then stripe_unit_amount::numeric / credits
      else eur_display * 100.0 / credits
    end desc  -- highest price per credit = worst deal for buyer
  limit 1;

  return query
  select
    agg.generation_type,
    cc.credit_cost::int                                         as current_cost,
    round(agg.avg_cents, 4)                                     as avg_actual_usd_cents,
    agg.sample_size,
    case
      when v_cents_per_credit is not null and agg.sample_size >= v_min_samples then
        greatest(1, round(agg.avg_cents / v_cents_per_credit))::int
      else null
    end                                                         as suggested_cost
  from (
    select
      l.reason                            as generation_type,
      avg(g.estimated_cost_usd_cents)     as avg_cents,
      count(*)                            as sample_size
    from ai_credit_ledger l
    join ai_generation_costs g on g.id = l.id
    where
      l.created_at >= now() - interval '30 days'
      and g.estimated_cost_usd_cents is not null
      and exists (
        select 1 from ai_generation_credit_costs cc2
        where cc2.generation_type = l.reason
      )
    group by l.reason
  ) agg
  join ai_generation_credit_costs cc on cc.generation_type = agg.generation_type
  order by agg.generation_type;
end;
$$;

-- ── Ring 2: the affirmative inline copies in the quota functions ─────────────
-- Behaviour-preserving. Bodies restated verbatim from the live definitions
-- (20260630000001 / 20260630000002 as amended by the soundboard work); only the
-- admin short-circuit changes.

create or replace function public.check_quota(resource_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quotas  jsonb;
  v_limit   int;
  v_current int;
  v_extra   text := '';
begin
  -- App admins are always unlimited — short-circuit before any DB work
  if private.is_app_admin() then
    return jsonb_build_object('allowed', true, 'current', 0, 'limit', -1, 'unlimited', true);
  end if;

  -- Validate resource_type to prevent arbitrary table scanning via dynamic SQL
  if resource_type not in (
    'campaigns', 'npcs', 'monsters', 'encounters', 'scriptorium_documents', 'notes',
    'sounds', 'soundboard_pages', 'soundboard_playlists',
    'quests', 'factions', 'locations', 'deities', 'pantheons', 'puzzle_rooms'
  ) then
    raise exception 'invalid resource_type: %', resource_type;
  end if;

  -- Curated content is free content and never counts against a cap.
  if resource_type = 'sounds' then
    v_extra := ' and library_id is null';
  elsif resource_type = 'soundboard_playlists' then
    v_extra := ' and library_scene_slug is null';
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

  execute format('select count(*) from %I where user_id = $1%s', resource_type, v_extra)
    into v_current using auth.uid();

  return jsonb_build_object(
    'allowed',   v_current < v_limit,
    'current',   v_current,
    'limit',     v_limit,
    'unlimited', false
  );
end;
$$;

create or replace function public.check_all_quotas()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quotas  jsonb;
  v_result  jsonb := '{}'::jsonb;
  v_res     text;
  v_limit   int;
  v_current int;
  v_extra   text;
  -- Keep this list in sync with check_quota's resource_type allowlist.
  v_resources text[] := array[
    'campaigns', 'npcs', 'monsters', 'encounters', 'scriptorium_documents', 'notes',
    'quests', 'factions', 'locations', 'deities', 'pantheons', 'puzzle_rooms',
    'sounds', 'soundboard_pages', 'soundboard_playlists'
  ];
begin
  -- App admins are always unlimited — short-circuit before any counting
  if private.is_app_admin() then
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
      -- Same exemptions as check_quota.
      v_extra := case
        when v_res = 'sounds' then ' and library_id is null'
        when v_res = 'soundboard_playlists' then ' and library_scene_slug is null'
        else ''
      end;
      execute format('select count(*) from %I where user_id = $1%s', v_res, v_extra)
        into v_current using auth.uid();
      v_result := v_result || jsonb_build_object(
        v_res, jsonb_build_object('allowed', v_current < v_limit, 'current', v_current, 'limit', v_limit, 'unlimited', false)
      );
    end if;
  end loop;

  return v_result;
end;
$$;

-- ── Ring 3: the 18 RLS policies still comparing the claim inline ─────────────
-- `alter policy` rather than drop/create so the policy keeps its name, command
-- and roles, and so a typo in a table or policy name fails the migration rather
-- than silently leaving a table unprotected. Bare `private.is_app_admin()`
-- matches the 61 policies that already call it (20260629000002 onward); the
-- helper is STABLE, and it is not an `auth.*` call, so it does not attract the
-- auth_rls_initplan advisor the way the inline `(select auth.jwt())` did.

alter policy "ai_credit_ledger_admin_select"    on public.ai_credit_ledger          using (private.is_app_admin());
alter policy "ai_generation_credit_costs_update" on public.ai_generation_credit_costs using (private.is_app_admin());

alter policy "ai_model_pricing_admin_delete"    on public.ai_model_pricing using (private.is_app_admin());
alter policy "ai_model_pricing_admin_insert"    on public.ai_model_pricing with check (private.is_app_admin());
alter policy "ai_model_pricing_admin_update"    on public.ai_model_pricing using (private.is_app_admin());

alter policy "ai_system_prompts_delete"         on public.ai_system_prompts using (private.is_app_admin());
alter policy "ai_system_prompts_insert"         on public.ai_system_prompts with check (private.is_app_admin());
alter policy "ai_system_prompts_update"         on public.ai_system_prompts using (private.is_app_admin());

alter policy "credit_pack_config_update"        on public.credit_pack_config using (private.is_app_admin());
alter policy "plans_update_admin"               on public.plans              using (private.is_app_admin());

alter policy "platform_api_keys_select"         on public.platform_api_keys using (private.is_app_admin());
alter policy "platform_api_keys_insert"         on public.platform_api_keys with check (private.is_app_admin());
alter policy "platform_api_keys_update"         on public.platform_api_keys using (private.is_app_admin());
alter policy "platform_api_keys_delete"         on public.platform_api_keys using (private.is_app_admin());

alter policy "provider_config_insert"           on public.provider_config with check (private.is_app_admin());
alter policy "provider_config_update"           on public.provider_config using (private.is_app_admin());
alter policy "provider_config_delete"           on public.provider_config using (private.is_app_admin());

alter policy "user_subscriptions_select_admin"  on public.user_subscriptions using (private.is_app_admin());
