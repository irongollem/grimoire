-- Migration: locations_map_stand_live_layer
-- The standing layer without the props that sway, for the battle map while it animates them (#1073, story 7).
--
-- A tree, a fern or a mushroom marked to sway (`library_dressing.sway`, a pack's manifest `sway`) is drawn by the
-- battle map's live layer, turned back and forth over the grid. Its still copy must not show under the moving one, so
-- the Cartographer also publishes the standing layer with those props left out, in `map_layer_stand_live_url`. Only
-- the battle map reads it, and only while its live layer runs: with reduced motion, and on every other surface (the
-- Atlas, the player's site map), the full `map_layer_stand_url` keeps every prop still in place. Null when nothing on
-- the map sways, or for a site published before this.
--
-- `get_player_visible_locations` returns `setof locations`, so the column is appended to its projection, under the same
-- `is_map_shared` gate as the rest of the map.

alter table public.locations add column map_layer_stand_live_url text;

comment on column public.locations.map_layer_stand_live_url is
  'The standing layer of the published Drawing without the props that sway (#1073): the battle map shows it under its live layer, which draws those props moving. Null when nothing sways.';

create or replace function public.get_player_visible_locations(p_campaign_id uuid default null::uuid, p_location_id uuid default null::uuid)
 returns setof locations
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    l.id,
    l.user_id,
    l.campaign_id,
    l.parent_id,
    l.name,
    l.location_type,
    case when l.is_description_shared then private.withhold_secret_blocks(l.description) else null::text end,
    null::text,                                                               -- notes (DM-only)
    l.tags,
    l.image_url,
    l.created_at,
    l.updated_at,
    case when l.is_map_shared then l.map_url else null::text end,
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
    l.setting_source,
    l.sort_order,
    null::integer,                                                            -- map_published_rev (DM tooling)
    case when l.is_map_shared then l.map_layer_url else null::text end,
    case when l.is_map_shared then l.map_layer_calibration else null::jsonb end,
    case when l.is_map_shared then l.plan_size else null::jsonb end,
    null::text,                                                               -- demo_source (#912): a quota marker, nothing for players
    l.is_level,                                                               -- which nested sites are floors: structure, like parent_id
    case when l.is_map_shared then l.map_scale else null::jsonb end,          -- map_scale (#932): travels with the map
    case when l.is_map_shared then l.map_live else null::jsonb end,           -- map_live (#1073): the live layer's snapshot, likewise
    case when l.is_map_shared then l.map_layer_stand_url else null::text end,      -- map_layer_stand_url (#1073): the Drawing's standing layer
    case when l.is_map_shared then l.map_layer_stand_live_url else null::text end  -- map_layer_stand_live_url (#1073): the same, less what sways
  from locations l
  where l.campaign_id is not null
    and (p_campaign_id is null or l.campaign_id = p_campaign_id)
    and (p_location_id is null or l.id = p_location_id)
    and exists (
      select 1 from campaign_members cm
      where cm.user_id = (select auth.uid())
        and cm.campaign_id = l.campaign_id
    )
    and (
      exists (
        select 1 from campaign_members cm
        where cm.user_id = (select auth.uid())
          and cm.campaign_id = l.campaign_id
          and cm.party_member_id = any (l.player_visible_to)
      )
      or (p_location_id is not null and l.is_map_shared = true)
    )
$function$;

revoke execute on function public.get_player_visible_locations(uuid, uuid) from public, anon;
grant execute on function public.get_player_visible_locations(uuid, uuid) to authenticated, service_role;
