-- Site map stack (epic #884, wave 1, S1).
--
-- A site's map used to be one column, `map_url`, that held three different
-- things: a scan the DM uploaded, the Cartographer's bake of a drawing, or an
-- AI-styled render of that drawing. Epic #884 makes the map a stack of
-- independently-empty layers, bottom up: Picture (`map_url`, a picture the DM
-- supplied or the styler produced) → Drawing (`map_layer_url`, a transparent
-- bake of the `dungeon_maps` row in `source_map_id`) → Plan (regions, doors,
-- placements — unchanged) → Tokens → Fog (played, never stored here).
--
-- Two calibrations, not one, because two images need two: `grid_calibration`
-- keeps describing the Picture, as its comment always said; the Drawing's
-- calibration is deterministic from its bake and lives in
-- `map_layer_calibration`, written by Publish. `lib/locations/mapStack.ts`
-- picks the frame's calibration (Drawing's, else Picture's, else a synthetic
-- one from `plan_size`) so no consumer reads either column directly.
--
-- `plan_size` is the schematic case: a site with a Plan and nothing beneath it
-- — a blank grid of cols × rows cells that regions are traced straight onto.

alter table locations
  add column map_layer_url text null,
  add column map_layer_calibration jsonb null,
  add column plan_size jsonb null
    constraint locations_plan_size_shape check (
      plan_size is null
      or (
        jsonb_typeof(plan_size -> 'cols') = 'number'
        and jsonb_typeof(plan_size -> 'rows') = 'number'
        and (plan_size ->> 'cols')::int between 1 and 400
        and (plan_size ->> 'rows')::int between 1 and 400
      )
    );

comment on column locations.map_layer_url is
  'The Drawing layer: a transparent WebP bake of the dungeon_maps row in source_map_id, re-baked on every save of the drawing. Null when the site has no drawing. Epic #884.';
comment on column locations.map_layer_calibration is
  'GridCalibration of map_layer_url, computed by Publish from the bake''s own padding — never eyeballed. Null iff map_layer_url is null.';
comment on column locations.plan_size is
  '{cols, rows} for a site whose Plan is traced on a blank grid with no Picture and no Drawing beneath it. Null otherwise.';
comment on column locations.map_url is
  'The Picture layer: a scan, a photo, or the AI styler''s render of the Drawing. Since epic #884 never a Cartographer bake — those live in map_layer_url.';

-- Every publish wrote map_url together with map_published_rev, and nothing else
-- ever set map_published_rev, so that column is exactly "the picture is a
-- bake". An AI-styled save set source_map_id but never map_published_rev, so
-- those rows are (correctly) left as Pictures. The moved bakes are opaque; a
-- site's next drawing save replaces each with a transparent one.
update locations
   set map_layer_url         = map_url,
       map_layer_calibration = grid_calibration,
       map_url               = null,
       grid_calibration      = null
 where map_published_rev is not null
   and map_url is not null;

-- ── get_player_visible_locations, the seventh recreation ────────────────────
--
-- `returns setof locations` lists every column positionally so it can null the
-- DM-only ones; `locations` just gained three columns, so without this the
-- function fails at call time with "Final statement returns too few columns".
--
-- Two things change in the projection besides the three new columns:
--
-- 1. The Picture goes to players whole when the map is shared. The previous
--    recreation withheld `map_url` from a site with traced spaces — frame 16's
--    "one honest limit", a signed URL shows the whole floor to anyone who
--    fetches it. The maintainer ruled on 14 Sep 2026 (epic #884, decision 7)
--    that it does not matter: "it's a game, not a hospital or a bank". Unexplored
--    *structure* is still withheld — rooms, doors, lock notes never reach the
--    client — because get_player_visible_site_state composes the plan from
--    cells; only the pictures beneath it are merely covered by fog.
-- 2. The Drawing (`map_layer_url` + `map_layer_calibration`) and a blank grid
--    (`plan_size`) ship under the same `is_map_shared` gate as the Picture.
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
    case when l.is_map_shared then l.plan_size else null::jsonb end
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
$$;
