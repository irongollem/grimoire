-- A moving map stays on the DM's device (#1125 decision 6).
--
-- The maintainer's answer to the size question (31 Oct 2026): keep a small format on R2 and play big videos from
-- local files. So an animated GIF, animated WebP, APNG, WebM or MP4 is never uploaded: the browser copies it into its
-- private file system on the DM's device, keyed by the place's id, and only a WebP still goes to R2 as the Picture
-- (`map_url`). `map_motion` says that the Picture moves and what to ask for on a device that lacks the file:
-- `{ kind: "video" | "animated", file_name, mime, bytes, width, height }`. It is the DM's alone: players see the
-- still, so their projection returns null for it.

alter table public.locations add column map_motion jsonb null
  constraint locations_map_motion_shape check (
    map_motion is null or (
      jsonb_typeof(map_motion) = 'object'
      and map_motion ->> 'kind' in ('video', 'animated')
      and jsonb_typeof(map_motion -> 'file_name') = 'string'
      and jsonb_typeof(map_motion -> 'mime') = 'string'
      and jsonb_typeof(map_motion -> 'bytes') = 'number'
      and jsonb_typeof(map_motion -> 'width') = 'number'
      and jsonb_typeof(map_motion -> 'height') = 'number'
    )
  );

comment on column public.locations.map_motion is
  'A moving Picture (#1125): the file lives on the DM''s device, map_url is its still. { kind, file_name, mime, bytes, width, height }.';

-- get_player_visible_locations returns setof locations positionally, so it gains the new column at the end.
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
    case when l.is_map_shared then l.map_layer_stand_live_url else null::text end, -- map_layer_stand_live_url (#1073): the same, less what sways
    l.climate,                                                                -- climate (#1086): the weather a player sees comes from it
    l.terrain,                                                                -- terrain (#1086): which weather hazards apply there
    null::jsonb                                                               -- map_motion (#1125): a moving map plays only on the DM's own device
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
