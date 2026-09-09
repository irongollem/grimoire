// The reverse of `location_placements` (#868, S8, frame 11): given the rows
// that place one entity, resolve each into the site/room/cell triple the
// Dungeon Craft grid's "Placed in" line reads. "The column just reads
// `location_placements` backwards, and `source_cell_key` is what lets a row
// say *which square* rather than only which room."

import type { CellKey } from "@/types/dungeonMap.types";
import type { LocationPlacementWithLocation } from "@/composables/locations/useLocationPlacements";
import type { Location } from "@/types/location.types";

export interface PlacedInRoom {
  key: string;
  /** The room's own direct parent — frame 11's example names one level up
   *  ("Ashmouth Undercroft · Nave of Ash"), not a walk to the campaign root. */
  siteName: string | null;
  roomName: string;
  cell: CellKey | null;
}

/** `locationsById` needs every location in the campaign (`useAllLocations`),
 *  not just the placed rooms — it's how a room's own parent resolves to a
 *  name. */
/** A puzzle anchored straight to a room (`PuzzleRoom.location_id`, no
 *  `dungeon_feature_id`) has no `location_placements` row and so no cell of
 *  its own — the puzzle sheet's own anchor picker sets a room, not a square.
 *  Reuses the same "room's own parent is the site" rule as
 *  `resolvePlacedInRooms`, for a caller that has a bare location id instead
 *  of a placement row (`DungeonCraftPuzzlesTab`). */
export function directRoomPlacement(locationId: string, locationsById: ReadonlyMap<string, Location>): PlacedInRoom {
  const room = locationsById.get(locationId);
  const site = room?.parent_id ? locationsById.get(room.parent_id) : undefined;
  return { key: locationId, siteName: site?.name ?? null, roomName: room?.name ?? "???", cell: null };
}

export function resolvePlacedInRooms(
  placements: readonly LocationPlacementWithLocation[],
  locationsById: ReadonlyMap<string, Location>,
): PlacedInRoom[] {
  return placements.map((placement) => {
    const room = locationsById.get(placement.location_id);
    const site = room?.parent_id ? locationsById.get(room.parent_id) : undefined;
    return {
      key: placement.id,
      siteName: site?.name ?? null,
      roomName: room?.name ?? placement.location?.name ?? "???",
      cell: placement.source_cell_key,
    };
  });
}
