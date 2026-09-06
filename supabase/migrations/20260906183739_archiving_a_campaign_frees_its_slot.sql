-- Archiving a campaign frees its slot. Story #812.
--
-- `check_quota('campaigns')` counted every campaign a user owns, archived or
-- not. The client believed the opposite, everywhere: the downgrade picker's own
-- copy says *"Select which campaign to keep — the rest will be archived and can
-- be restored by upgrading"*, and `DefaultLayout.showDowngradePicker` decides
-- whether to appear by counting only non-archived campaigns.
--
-- So a free DM with three campaigns was shown the picker, kept one, and had two
-- archived — after which the picker correctly stopped appearing (1 active) while
-- the quota still read 3. The account was told it was at its limit of one while
-- displaying exactly one active campaign, with no remaining action that could
-- move the number. The only ways out were upgrading or deleting outright, which
-- is precisely what archiving was offered to avoid.
--
-- Fixed in the direction the product already describes, using the `v_extra`
-- mechanism that already exempts library and setting-provided content from a
-- user's quota. `campaigns` is the only quota'd table with an `is_archived`
-- column, so this is a one-resource question rather than a policy sweep.
--
-- **Both functions, deliberately.** `check_quota` answers for one resource and
-- `check_all_quotas` for all of them, and they carry the same exemption list —
-- the sibling even says "Same exemptions as check_quota". Fixing one would let
-- the two disagree about the same fact, which is the shape this codebase keeps
-- having to unpick.
--
-- Not yet live: production has 0 archived campaigns across 8. The trap arms the
-- first time a free DM goes through the downgrade picker.

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
        when v_res in ('factions', 'deities', 'pantheons', 'locations') then ' and setting_source is null'
        when v_res = 'campaigns' then ' and is_archived = false'
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
$function$;
