-- Migration: map_scale
-- A place's map learns how far apart two points on it are (#932, story 5).
--
-- `grid_calibration` already says how many 5-ft squares span a battle map, but
-- a world, region or city map is measured in miles or kilometres, and nothing
-- recorded that. The DM marks two points on the picture and types the distance
-- between them; the Atlas's measuring tool turns any route drawn on the map
-- into a distance and a travel time at 5e pace from that one pair.
--
-- Shape: { "unit": "mi" | "km", "distance": <positive number>,
--          "a": { "x": 0..1, "y": 0..1 }, "b": { "x": 0..1, "y": 0..1 } }
-- The points are fractions of the image's natural width and height, the same
-- frame `map_pins` uses, so the scale survives the image being displayed at any
-- size. Distance per natural pixel is derived at read time from the image's
-- natural size; storing the points (not a derived ratio) keeps the calibration
-- editable and correct if the picture is replaced with a higher resolution copy
-- of the same map.
--
-- The CHECK holds the shape so a malformed value cannot reach the measuring
-- maths. `null` means the map has no scale, and the tool asks for one.

alter table public.locations
  add column map_scale jsonb;

alter table public.locations
  add constraint locations_map_scale_shape_check check (
    map_scale is null
    or (
      jsonb_typeof(map_scale) = 'object'
      and map_scale->>'unit' in ('mi', 'km')
      and jsonb_typeof(map_scale->'distance') = 'number'
      and (map_scale->>'distance')::numeric > 0
      and jsonb_typeof(map_scale->'a'->'x') = 'number'
      and jsonb_typeof(map_scale->'a'->'y') = 'number'
      and jsonb_typeof(map_scale->'b'->'x') = 'number'
      and jsonb_typeof(map_scale->'b'->'y') = 'number'
      and (map_scale->'a'->>'x')::numeric between 0 and 1
      and (map_scale->'a'->>'y')::numeric between 0 and 1
      and (map_scale->'b'->>'x')::numeric between 0 and 1
      and (map_scale->'b'->>'y')::numeric between 0 and 1
      -- Two distinct points, or the scale divides by zero.
      and (map_scale->'a') <> (map_scale->'b')
    )
  );

comment on column public.locations.map_scale is
  'Distance scale of the place''s map: two image-fraction points and the distance between them in mi or km (#932).';

-- `get_player_visible_locations` returns `setof locations` with a positional
-- column list, so the new column is appended in the same position here. The
-- scale is a property of the map, so it travels with the map like
-- `map_layer_calibration` does: only once the map itself is shared.
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
    case when l.is_description_shared then l.description else null::text end,
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
    case when l.is_map_shared then l.map_scale else null::jsonb end           -- map_scale (#932): travels with the map
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
