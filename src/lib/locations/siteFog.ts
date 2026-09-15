// The DM's own translucent site-fog hint (epic #884, wave 4, S12).
//
// A player's plan (`usePlayerVisibleSiteState` + `PlayerSitePlan.vue`) is
// built from `get_player_visible_site_state`, which withholds every
// unexplored room's geometry entirely — the RPC's whole point. The DM
// authored that geometry, so there is nothing to withhold from them; what
// they want instead is "a hint, never a wall" (the maintainer's words) —
// every room's shape stays visible, with only the explored/unexplored
// distinction drawn as fog.
//
// `PlayerSitePlan.vue` already draws exactly that distinction (explored:
// solid floor; glimpsed: a dashed footprint, never a blank void) — this
// module's whole job is reshaping the DM's own full site data into that same
// `PlayerSitePlan` document shape so the component can be reused unchanged,
// with `opaque: false`, rather than inventing a second renderer. An
// unexplored room becomes a "glimpsed" entry here (a dashed footprint) even
// though it was never literally glimpsed by a party member — the visual
// language ("a hint, not a wall") is exactly what "glimpsed" already draws.

import type { PlayerSitePlan, PlayerSitePlanGlimpse, PlayerSitePlanSpace } from "@/composables/locations/usePlayerVisibleSiteState";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

export interface DmFogRoom {
  id: string;
  name: string;
}

/**
 * Builds the DM's fog-hint document from the same `regions`/room data the
 * real map already has — no RPC, no withholding. `isExplored`/`isCleared`/
 * `isLooted` are callbacks rather than a pre-built map so a caller can hand
 * in whatever room-state lookup it already has (`useLocationStateForRooms`'s
 * `stateOf`, in `SiteRunSurface`) without this module knowing its shape.
 */
export function buildDmFogPlan(
  regions: readonly LocationMapRegion[],
  rooms: readonly DmFogRoom[],
  isExplored: (roomId: string) => boolean,
  isCleared: (roomId: string) => boolean,
  isLooted: (roomId: string) => boolean,
): PlayerSitePlan {
  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  const spaces: PlayerSitePlanSpace[] = [];
  const glimpsed: PlayerSitePlanGlimpse[] = [];

  for (const region of regions) {
    if (region.region_role !== "space" || !region.space_location_id) continue;
    const room = roomsById.get(region.space_location_id);
    if (!room) continue;
    if (isExplored(room.id)) {
      spaces.push({
        space_location_id: room.id,
        name: room.name,
        cells: region.cells,
        label: region.label,
        sort_order: region.sort_order,
        is_cleared: isCleared(room.id),
        is_looted: isLooted(room.id),
      });
    } else {
      glimpsed.push({ cells: region.cells });
    }
  }

  // Doors and zones stay off this hint — the real map beside it already
  // draws them, and this panel's own job is only "explored vs not".
  return { spaces, glimpsed, ways: [], zones: [] };
}
