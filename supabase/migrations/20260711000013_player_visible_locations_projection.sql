-- Migration: player_visible_locations_projection
-- #507 (part 5 — locations, the highest-value narrative leak: secret dungeons,
-- DM notes, unshared maps, and hidden map pins).
--
-- Two player SELECT policies on `locations` both hand players the FULL row via
-- the client's `select *` (useSharedLocations / useLocation), leaking columns and
-- sub-rows the UI never shows:
--   * locations_player_select  — gated on player_visible_to, but returns the
--     whole row: `description` even when is_description_shared=false, DM `notes`,
--     `map_url` regardless of is_map_shared, and EVERY `map_pins` entry including
--     `visible_to_players=false` (secret child-location names, ids, and map
--     coordinates — e.g. a hidden dungeon a player could read from devtools).
--   * locations_shared_map_campaign_member_select — grants ANY campaign member
--     the whole row as soon as is_map_shared=true (the battle-map read path),
--     with NO player_visible_to gate at all, so a shared battle map ships its DM
--     notes and secret pins to every member.
--
-- Fix: a SECURITY DEFINER projection that gates rows AND nulls/filters the
-- DM-only fields, replacing BOTH player policies so the base table is no longer
-- a devtools bypass (players read exclusively through the projection; the DM
-- keeps full access via "Users can read own locations").

-- ── 1. Projection function ────────────────────────────────────────────────────
-- p_campaign_id → the player's shared-location list (player_visible_to only).
-- p_location_id → one location (player_visible_to OR a shared map, so battle-map
--                 VTT reads keep working even when the map isn't in the player's
--                 player_visible_to). Column list matches the locations row type.
create or replace function get_player_visible_locations(
  p_campaign_id uuid default null,
  p_location_id uuid default null
)
returns setof locations
language sql stable security definer
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
    l.is_battle_map
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
    );
$$;

revoke all on function get_player_visible_locations(uuid, uuid) from public;
revoke execute on function get_player_visible_locations(uuid, uuid) from anon;
grant execute on function get_player_visible_locations(uuid, uuid) to authenticated;

-- ── 2. Close the base-table devtools bypass ───────────────────────────────────
-- Drop both player SELECT policies; players now read only through the projection.
-- The DM keeps full base-table access via "Users can read own locations".
drop policy if exists "locations_player_select" on locations;
drop policy if exists "locations_shared_map_campaign_member_select" on locations;
