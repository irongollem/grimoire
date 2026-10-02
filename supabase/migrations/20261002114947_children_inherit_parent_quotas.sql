-- #928: a young player inherits their parent's Pro limits.
--
-- A child account (#919) can never pay, so it sat on the free plan's quotas even
-- when the parent who manages it pays for Pro. The parent is already paying, so
-- their young players get the Pro LIMITS. Only the limits: nothing else follows.
-- AI, credits, bring-your-own-key and every other Pro feature still key off
-- public.is_user_pro(), which stays false for a child account, and this
-- migration does not touch it.
--
-- The rule, in one place (private.effective_quotas):
--   * A child inherits while (a) its link is active (adult_on > current_date,
--     exactly private.is_child_account), (b) public.is_user_pro(parent) holds (an
--     active or trialing pro or tester subscription, or an app admin), and (c) it
--     is among the parent's first five active children, by created_at and then
--     child_user_id.
--   * An inheriting child's quotas are the better of its own plan's and the pro
--     plan's, key by key. In plans.quotas a missing key means unlimited, so
--     "better" is: a key missing from either side is missing from the result,
--     otherwise the larger number.
--   * Everyone else gets what they got before: their own active plan's quotas,
--     or the free plan's when they have no active subscription.
--
-- Why five. The only abuse route is a subscriber minting child accounts for
-- adult friends. Such an account has no AI, no email and a password only the
-- "parent" can reset, so it is a poor gift, but a cap closes the route without
-- anyone having to argue about it. Five covers a family. When one of the five
-- turns adult (adult_on passes), the next in line moves into the five on its own,
-- because the rank is computed over active links only.
--
-- What it makes deliberate: a child's own plan still counts. An account on a
-- comped plan that later becomes a child account keeps its own quotas; being a
-- child never lowers anything, it only adds the parent's ceiling.
--
-- check_quota and check_all_quotas are the only two readers of plans.quotas.
-- They change in exactly one place: the lookup becomes
-- private.effective_quotas(auth.uid()). Everything else, including SECURITY
-- DEFINER and the search_path, is as it was.

-- Is this child inside its parent's first five active children? Total: false for
-- a non-child, a NULL id, or a link that has lapsed.
create or replace function private.child_ranks_within_parent_cap(p_child_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select ranked.rn <= 5
      from (
        select c.child_user_id,
               row_number() over (order by c.created_at, c.child_user_id) as rn
          from public.child_accounts c
         where c.parent_user_id = (
                 select a.parent_user_id
                   from public.child_accounts a
                  where a.child_user_id = p_child_user_id
                    and a.adult_on > current_date
               )
           and c.adult_on > current_date
      ) ranked
      where ranked.child_user_id = p_child_user_id
    ),
    false
  );
$$;

-- The quotas a user is actually held to. NULL returns the free plan's.
create or replace function private.effective_quotas(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_own    jsonb;
  v_pro    jsonb;
  v_parent uuid;
begin
  select p.quotas
    into v_own
    from public.user_subscriptions s
    join public.plans p on p.id = s.plan_id
   where s.user_id = p_user_id
     and s.status in ('active', 'trialing');

  if not found then
    select quotas into v_own from public.plans where id = 'free';
  end if;

  v_parent := private.parent_of_child(p_user_id);

  if v_parent is null
     or not coalesce(public.is_user_pro(v_parent), false)
     or not private.child_ranks_within_parent_cap(p_user_id) then
    return v_own;
  end if;

  select quotas into v_pro from public.plans where id = 'pro';

  -- No pro plan to inherit from. Without this the merge below would find no
  -- key on both sides and answer '{}', which reads as unlimited.
  if v_pro is null then
    return v_own;
  end if;

  -- Key by key. A key missing from either side is unlimited there, so it stays
  -- missing; otherwise the larger limit wins.
  return coalesce(
    (
      select jsonb_object_agg(o.key, to_jsonb(greatest(o.value::int, (v_pro ->> o.key)::int)))
        from jsonb_each_text(v_own) o
       where v_pro ? o.key
    ),
    '{}'::jsonb
  );
end;
$$;

-- Internal. The two definer callers below run as the function owner, who keeps
-- EXECUTE regardless of these revokes, so no client grant is needed.
revoke execute on function private.effective_quotas(uuid) from public, anon, authenticated;
revoke execute on function private.child_ranks_within_parent_cap(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_quota(resource_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Curated content is free content and never counts against a cap. Each column
  -- differs because each table records provenance in its own way; the rule is
  -- the same one.
  if resource_type = 'sounds' then
    v_extra := ' and library_id is null';
  elsif resource_type = 'soundboard_playlists' then
    v_extra := ' and library_scene_slug is null';
  elsif resource_type in ('factions', 'deities', 'pantheons', 'locations') then
    v_extra := ' and setting_source is null';
  elsif resource_type = 'campaigns' then
    -- An archived campaign does not occupy a slot (#812). Every string the UI
    -- shows already promised this: the downgrade picker says "the rest will be
    -- archived and can be restored by upgrading", and DefaultLayout decides
    -- whether to show it by counting only NON-archived campaigns. This function
    -- counted all of them, so a free DM who went through the picker was left
    -- holding one active campaign while being told they were at their limit of
    -- one, with no remaining action that could change the number.
    v_extra := ' and is_archived = false';
  end if;

  -- The demo campaign and everything copied into it are free too (#912).
  v_extra := v_extra || ' and demo_source is null';

  -- Look up the user's plan quotas; default to free if no subscription row exists
  v_quotas := private.effective_quotas(auth.uid());

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
$function$;

CREATE OR REPLACE FUNCTION public.check_all_quotas()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_quotas := private.effective_quotas(auth.uid());

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
        when v_res in ('factions', 'deities', 'pantheons', 'locations') then ' and setting_source is null'
        when v_res = 'campaigns' then ' and is_archived = false'
        else ''
      end;
      v_extra := v_extra || ' and demo_source is null';
      execute format('select count(*) from %I where user_id = $1%s', v_res, v_extra)
        into v_current using auth.uid();
      v_result := v_result || jsonb_build_object(
        v_res, jsonb_build_object('allowed', v_current < v_limit, 'current', v_current, 'limit', v_limit, 'unlimited', false)
      );
    end if;
  end loop;

  return v_result;
end;
$function$;

