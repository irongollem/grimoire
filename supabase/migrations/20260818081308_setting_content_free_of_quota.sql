-- Migration: setting_content_free_of_quota
-- Stop the setting content we ship from counting against a user's free-tier caps.

-- Content Grimoire provides is free content. That was already true for the two
-- resources that had somewhere to record it — `check_quota` excludes sounds with
-- a `library_id` and playlists with a `library_scene_slug` — but factions,
-- deities and pantheons had no such column, so everything "Populate Setting"
-- inserts counted fully against the user's own allowance.
--
-- The numbers make that a wall rather than a rounding error, and it is worst on
-- the Atlas. Against free caps of 5 factions, 5 deities, 3 pantheons and 10
-- locations, populating Faerûn inserts 15, 112, 13 and 35; "Populate Planes"
-- adds 20 more locations on top. Every one of the nine settings exceeds the
-- location cap on its own — Planescape 27, Spelljammer 12 at the low end — so
-- the Atlas button has never worked for a free user on any setting.
-- `enforce_quota` is a BEFORE INSERT trigger on all four tables, so pressing the
-- button we put on the page trips it almost immediately and returns a paywall
-- instead of the content.
--
-- `setting_source` holds the shipped source that produced the row rather than a
-- bare boolean, so the row says *which* book it came from and a later change to
-- that book can find its own rows. Values are setting keys ('faerun',
-- 'eberron', …) plus 'planar' for the twenty standard planes, which belong to no
-- single setting. Null means the user made it, which is what counts.
--
-- Deliberately NOT enforced as a foreign key or a check constraint against the
-- known setting keys: the settings live in `src/settings/*.ts`, not in the
-- database, so a constraint here would be a second copy of that list to keep in
-- step, and drift would fail an insert rather than merely mislabel a row.
--
-- And deliberately NOT write-guarded, which is the more interesting omission.
-- `setting_source` is an ordinary column on a table the user owns, so nothing
-- stops them PATCHing their own rows to a non-null value and exempting
-- themselves from three caps. That is a decision, not an oversight:
--
--   * It is the posture the two existing exemptions already have.
--     `soundboard_playlists.library_scene_slug` is unconstrained text with
--     UPDATE granted to `authenticated`, and `sounds.library_id` is FK'd to
--     `sound_library` — which reads tighter but is not, since any user can point
--     it at any real catalogue row. All three are equally settable.
--   * What it buys an attacker is unlimited rows in four of fifteen quota'd
--     resources, and not the ones that drive upgrades (campaigns 1, monsters 3,
--     scriptorium_documents 3). No data exposure and no cross-tenant reach: the
--     rows stay RLS-scoped to their own campaign either way. It is a
--     monetization gap, not an authorization hole.
--   * Closing it properly means the column becomes server-controlled — a
--     BEFORE INSERT OR UPDATE trigger forcing it null for non-service_role
--     callers, plus moving Populate Setting behind a SECURITY DEFINER RPC that
--     stamps it. That is a real change, it would have to cover the soundboard
--     pair to be coherent, and it is not worth it unless free-tier caps on
--     factions, deities, pantheons and locations turn out to be revenue-critical.
--
-- Revisit this line, not the column, if that last condition ever changes.

alter table public.factions  add column if not exists setting_source text;
alter table public.deities   add column if not exists setting_source text;
alter table public.pantheons add column if not exists setting_source text;
alter table public.locations add column if not exists setting_source text;

comment on column public.factions.setting_source is
  'Setting key that seeded this row via Populate Setting (null = user-created). Excluded from quota counts by check_quota.';
comment on column public.deities.setting_source is
  'Setting key that seeded this row via Populate Setting (null = user-created). Excluded from quota counts by check_quota.';
comment on column public.pantheons.setting_source is
  'Setting key that seeded this row via Populate Setting (null = user-created). Excluded from quota counts by check_quota.';
comment on column public.locations.setting_source is
  'Setting key, or ''planar'' for the standard planes, that seeded this row (null = user-created). Excluded from quota counts by check_quota.';

-- The count `check_quota` runs is `where user_id = $1` plus `v_extra`, so these
-- three tables now filter the same way sounds and playlists already do.
--
-- Recreated whole rather than patched: it is SECURITY DEFINER, and the parts
-- that must survive verbatim are the `private.is_app_admin()` short-circuit, the
-- `resource_type` allow-list (which is what stops the dynamic `format()` from
-- being pointed at an arbitrary table), `set search_path = public`, and the fact
-- that identity comes from `auth.uid()` and never from an argument.
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

  -- Curated content is free content and never counts against a cap. Each column
  -- differs because each table records provenance in its own way; the rule is
  -- the same one.
  if resource_type = 'sounds' then
    v_extra := ' and library_id is null';
  elsif resource_type = 'soundboard_playlists' then
    v_extra := ' and library_scene_slug is null';
  elsif resource_type in ('factions', 'deities', 'pantheons', 'locations') then
    v_extra := ' and setting_source is null';
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

-- `check_all_quotas` is the same rule written a second time, for the call shape
-- the UI uses to draw every counter and decide when to raise the paywall. The
-- soundboard doc says of these two functions: change both or neither — and it
-- says it because the exemption for curated sounds was once added to one of
-- them, leaving the trigger and the number on screen disagreeing about whether
-- a user was at their cap. Same trap, same two functions, so the same branch
-- goes in here.
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
        when v_res in ('factions', 'deities', 'pantheons', 'locations') then ' and setting_source is null'
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

-- Widening `locations` breaks `get_player_visible_locations`, which returns
-- `setof locations` by listing every column positionally so it can null the
-- DM-only ones. A new column on the table makes that list one short, and the
-- function then fails at call time with "return type mismatch" — the player
-- atlas, not the DM's. `supabase/tests/player_projections.test.sql` catches it,
-- which is how this was found rather than shipped.
--
-- `setting_source` passes straight through rather than being nulled like `notes`
-- and `audio_theme`: it is a setting key, not DM-private prose, and a player
-- reading 'faerun' off a location learns nothing they could not read off the
-- campaign. Nulling it would also make the projection disagree with the row it
-- claims to be.
create or replace function public.get_player_visible_locations(
  p_campaign_id uuid default null,
  p_location_id uuid default null
)
returns setof locations
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id,
    l.user_id,
    l.campaign_id,
    l.parent_id,
    l.name,
    l.location_type,
    case when l.is_description_shared then l.description else null::text end,  -- full description (player_summary is the always-shown one)
    null::text,                                                               -- notes (DM-only)
    l.tags,
    l.image_url,
    l.created_at,
    l.updated_at,
    case when l.is_map_shared then l.map_url else null::text end,             -- map_url gated by is_map_shared
    -- map_pins: keep only pins the DM marked visible_to_players
    coalesce((
      select jsonb_agg(pin)
      from jsonb_array_elements(coalesce(l.map_pins, '[]'::jsonb)) pin
      where coalesce((pin->>'visible_to_players')::boolean, false)
    ), '[]'::jsonb),
    l.is_map_shared,
    l.player_summary,
    l.is_description_shared,
    l.is_npcs_shared,
    l.player_visible_to,
    l.is_inventory_shared,
    l.npc_owner_id,
    l.related_location_ids,
    l.source_map_id,
    l.grid_calibration,
    l.is_battle_map,
    l.era_start,
    l.era_end,
    null::text,                                                               -- audio_theme (DM-only)
    l.ai_provenance,
    l.setting_source
  from locations l
  where l.campaign_id is not null
    and (p_campaign_id is null or l.campaign_id = p_campaign_id)
    and (p_location_id is null or l.id = p_location_id)
    -- must be a member of the campaign …
    and exists (
      select 1 from campaign_members cm
      where cm.user_id = (select auth.uid())
        and cm.campaign_id = l.campaign_id
    )
    -- … and either shared with this player, or (single-id mode) a shared map.
    and (
      exists (
        select 1 from campaign_members cm
        where cm.user_id = (select auth.uid())
          and cm.campaign_id = l.campaign_id
          and cm.party_member_id = any (l.player_visible_to)
      )
      or (p_location_id is not null and l.is_map_shared = true)
    )
$$;

-- Rows already inserted by Populate Setting are NOT backfilled here, on purpose.
-- The setting definitions live in TypeScript, so a SQL backfill would mean
-- copying several hundred names into this file as a literal — a second copy of
-- the source data, stale the moment a setting changes, and matched on a name the
-- user is free to have edited.
--
-- Instead `usePopulateFactions` / `usePopulateDeities` / `usePopulateLocations` /
-- `usePopulatePlanarLocations` stamp `setting_source` on the rows they *already*
-- match by name before deciding what to insert. Pressing the button again
-- therefore repairs an existing campaign, using the one copy of the setting data
-- that exists and the same matching rule that created the rows in the first
-- place.
