import { hasAnyMapLayer, type MapStackSource } from "@/lib/locations/mapStack";
import type { Location } from "@/types/location.types";

/** The fields `hasAnyMapLayer` reads: whether a place has a picture, a drawing or a blank grid. */
export type MapLayerFields = MapStackSource;

export type PlaceForMap = Pick<Location, "id" | "parent_id"> & MapLayerFields;

/** How many places above the story's place are searched for a map. A deeper tree is a mistake in the data, not a map. */
export const MAX_ANCESTOR_STEPS = 6;

/**
 * The place whose map the story's place is on: the place itself when it has a map layer, else the nearest ancestor
 * that has one. Null when none does within the step limit, or the parent chain loops back on itself.
 */
export function siteOf(placeId: string | null, byId: ReadonlyMap<string, PlaceForMap>): string | null {
  let id = placeId;
  for (let step = 0; step <= MAX_ANCESTOR_STEPS && id !== null; step++) {
    // A parent loop ends at the step limit, so it cannot hang.
    const place = byId.get(id);
    if (!place) return null;
    if (hasAnyMapLayer(place)) return place.id;
    id = place.parent_id;
  }
  return null;
}

/**
 * The room to hand to the story when a room on the map is chosen, or null when nothing should happen: a turn is being
 * answered, nothing was chosen, it is the room the party is already in, or the doors do not lead there. A null
 * `reachable` makes no claim about the doors (a site with none drawn), so every room may be chosen.
 */
export function goTarget(input: {
  busy: boolean;
  currentRoomId: string | null;
  clickedRoomId: string | null;
  reachable: ReadonlySet<string> | null;
}): string | null {
  const { busy, currentRoomId, clickedRoomId, reachable } = input;
  if (busy || clickedRoomId === null) return null;
  if (clickedRoomId === currentRoomId) return null;
  if (reachable !== null && !reachable.has(clickedRoomId)) return null;
  return clickedRoomId;
}
