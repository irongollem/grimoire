-- Migration: recreate_player_visible_locations_after_era_bounds
-- get_player_visible_locations enumerates the locations row positionally, and two
-- later migrations widened the table without recreating it: 20260726000001
-- (era_start/era_end) and 20260728000001 (audio_theme). SQL function bodies only
-- validate on execution, so every player-portal locations read has failed with
-- `42P13 return type mismatch` since the era columns landed — the same failure
-- mode 20260724000005 fixed for monsters/items, caught this time by the pgTAP
-- guard (supabase/tests/player_projections.test.sql) instead of production
-- reports. Recreate with the full current row: era bounds pass through (shared
-- worldbuilding chronology), audio_theme is nulled (DM-only soundboard wiring,
-- like notes and lair_location_id before it).

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
    l.is_battle_map,
    l.era_start,
    l.era_end,
    null::text                                                                -- audio_theme (DM-only)
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
