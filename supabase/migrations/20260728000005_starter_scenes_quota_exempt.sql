-- Migration: starter_scenes_quota_exempt
-- Mark playlists that came from a curated starter scene, and keep them off the
-- free tier's 3-playlist cap for the same reason catalogue sounds are off the
-- 20-sound cap: content we ship is not content the DM has to pay for room to keep.

-- Which curated scene this playlist was built from, e.g. "tavern" or "storm".
-- Null for every playlist a DM built themselves, which is the normal case.
--
-- Kept as a slug rather than a foreign key: the scene templates are versioned
-- source (`src/data/starterScenes.ts`), not rows, because a curated scene is a
-- recipe — layer volumes, generator intervals, pan spread — that we want to
-- review in a diff rather than edit in a table.
alter table "public"."soundboard_playlists"
  add column if not exists "library_scene_slug" text;

create index if not exists "soundboard_playlists_library_scene_idx"
  on "public"."soundboard_playlists" ("library_scene_slug")
  where "library_scene_slug" is not null;

-- ── Quota: starter scenes do not count ────────────────────────────────────
--
-- Free tier allows 3 playlists. Shipping seven starter scenes that consume it
-- would hand a DM a library and take away the room to use it.
--
-- Same shape as the `sounds` exemption added in 20260728000004 — both
-- functions count via dynamic SQL over an allowlist, so the rule is a
-- predicate appended per resource. The two must stay in sync.

create or replace function "public"."check_quota"("resource_type" "text") returns "jsonb"
    language "plpgsql" security definer
    set "search_path" to 'public'
    as $_$
declare
  v_quotas  jsonb;
  v_limit   int;
  v_current int;
  v_extra   text := '';
begin
  -- App admins are always unlimited — short-circuit before any DB work
  if (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' then
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
$_$;

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
  v_extra   text;
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
$_$;
