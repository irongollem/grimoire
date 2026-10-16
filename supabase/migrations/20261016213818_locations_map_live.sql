-- Migration: locations_map_live
-- A published site carries a live-layer snapshot beside its picture (#1073, story 1).
--
-- During play the battle map shows the baked picture of a site's Cartographer map. Living maps (#1073) draw over it,
-- from the map's own data: water that moves, lights (and later darkness and vision). Players cannot read `dungeon_maps`
-- (its select policy admits the owner and campaign DMs only), and widening that would hand them everything the DM drew,
-- hidden or not. So the Cartographer writes what the live layer needs at publish time, next to `map_layer_url`: cell
-- groups and light sources in the published image's own cells, the same space as the fog mask and the tokens, with the
-- motion overlays resolved to absolute URLs so play needs no access to the tile packs either. The snapshot is exactly
-- as current as the picture, and travels to players under the same `is_map_shared` gate.
--
-- `get_player_visible_locations` returns `setof locations`, so the new column is appended to its projection (the select
-- list is positional). No index: the column is read with its row, never searched.

alter table public.locations add column map_live jsonb;

comment on column public.locations.map_live is
  'Live-layer snapshot written by the Cartographer at publish (#1073): water and outer cell groups with their motion overlays, and light sources, in the published image''s cells. Null for a site with no published drawing.';

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
    case when l.is_map_shared then l.map_live else null::jsonb end            -- map_live (#1073): the live layer's snapshot, likewise
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
