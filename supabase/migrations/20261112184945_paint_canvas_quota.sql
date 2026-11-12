-- Canvases are a Pro limit (#1181, maintainer 12 Nov 2026): a free account keeps one picture with paint
-- layers (a "canvas"), Pro any number. A free user can paint with every tool, export the finished picture
-- and flatten a canvas into an ordinary picture to free the slot; nothing is ever deleted by the limit.
--
-- There is no canvas table. A painting is a `paint` step in a picture's recipe, and recipes live inside the
-- book: in an image node's `illuminate` attr in `scriptorium_chapters.content`, and in an art item's props in
-- `scriptorium_documents.page_furniture` (there as JSON text, so the step's quotes arrive escaped). A table
-- would need its own copy for demo campaigns, book import and export, and a cleanup when a picture is
-- deleted; counting the steps where they already live needs none of that.
--
-- One step per recipe, so counting `"type": "paint"` occurrences counts canvases. Saved versions must never
-- repeat that marker inside a recipe (they keep layers, not steps), or one canvas would count as several.
-- Demo copies are excluded, as for every other resource (#912).
--
-- The limit is the app's gate before a new canvas, not a trigger: a free user who wrote recipes straight into
-- a chapter over the API could hold more, and nothing here refuses or deletes one. That matches the rule that
-- the limit never takes a painting away, and costs nothing worth a trigger on every chapter save.
--
-- A chapter keeps a recipe as JSON (a node attr), so its count matches only the unescaped marker: text a user
-- types arrives escaped and cannot pass for a step. Page art keeps its recipe as JSON text, so there the
-- escaped marker is what to look for. A cheap `like` runs first so the pattern only reads rows that mention
-- paint at all.

update public.plans
   set quotas = quotas || '{"paint_canvases": 1}'::jsonb
 where id = 'free';

-- One count, called by both quota functions, so the two cannot drift. It takes the user id because a definer
-- calls it with auth.uid(); it lives in `private`, which the API does not publish, and only those definers
-- (running as their owner) may execute it.
create or replace function private.count_paint_canvases(p_user uuid)
 returns int
 language sql
 stable
 set search_path to ''
as $function$
  select (
    -- Page art: the recipe is JSON text inside a string, so its quotes are escaped.
    (select count(*)
       from public.scriptorium_documents d,
            regexp_matches(d.page_furniture::text, '\\"type\\": ?\\"paint\\"', 'g')
      where d.user_id = p_user and d.demo_source is null
        and d.page_furniture::text like '%paint%')
    -- Chapters: the recipe is a JSON object, so only the unescaped marker counts.
  + (select count(*)
       from public.scriptorium_chapters c
       join public.scriptorium_documents d on d.id = c.document_id,
            regexp_matches(c.content::text, '(?<!\\)"type": "paint"', 'g')
      where d.user_id = p_user and d.demo_source is null
        and c.content::text like '%paint%')
  )::int;
$function$;

revoke execute on function private.count_paint_canvases(uuid) from public, anon, authenticated;

create or replace function public.check_quota(resource_type text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
    'quests', 'factions', 'locations', 'deities', 'pantheons', 'puzzle_rooms',
    'paint_canvases'
  ) then
    raise exception 'invalid resource_type: %', resource_type;
  end if;

  -- Look up the user's plan quotas; default to free if no subscription row exists
  v_quotas := private.effective_quotas(auth.uid());

  -- Missing key in quotas JSONB = unlimited (pro plan has empty {})
  if not (v_quotas ? resource_type) then
    return jsonb_build_object('allowed', true, 'current', 0, 'limit', -1, 'unlimited', true);
  end if;

  v_limit := (v_quotas ->> resource_type)::int;

  if resource_type = 'paint_canvases' then
    -- Canvases have no table: they are counted where they live (see the header).
    v_current := private.count_paint_canvases(auth.uid());
  else
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

    execute format('select count(*) from %I where user_id = $1%s', resource_type, v_extra)
      into v_current using auth.uid();
  end if;

  return jsonb_build_object(
    'allowed',   v_current < v_limit,
    'current',   v_current,
    'limit',     v_limit,
    'unlimited', false
  );
end;
$function$;

create or replace function public.check_all_quotas()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
    'sounds', 'soundboard_pages', 'soundboard_playlists',
    'paint_canvases'
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
      if v_res = 'paint_canvases' then
        v_current := private.count_paint_canvases(auth.uid());
      else
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
      end if;
      v_result := v_result || jsonb_build_object(
        v_res, jsonb_build_object('allowed', v_current < v_limit, 'current', v_current, 'limit', v_limit, 'unlimited', false)
      );
    end if;
  end loop;

  return v_result;
end;
$function$;
