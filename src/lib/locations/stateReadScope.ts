import { isInteriorType } from "@/lib/locations/tiers";
import type { LocationType } from "@/types/location.types";

/**
 * The location ids one `location_state` read covers when a place's detail
 * pane is open: the place itself (its Progress toggles) plus its interior
 * spaces (the Rooms list's cleared/looted markers). Both panels ask for this
 * same set, so they share one query key and one request instead of reading the
 * table twice under two keys (#972, story 11).
 *
 * Door facts carry the site's id as their `location_id`, so they ride along in
 * the same rows; the location index ignores them.
 *
 * Empty while the children are still loading: a scope of the place alone would
 * be a different key, so the pane read the table once for the place and again
 * a moment later for the place and its rooms.
 */
export function stateReadScope(
  locationId: string,
  children: readonly { id: string; location_type: LocationType }[] | undefined,
): string[] {
  if (children === undefined) return [];
  return [locationId, ...children.filter((c) => isInteriorType(c.location_type)).map((c) => c.id)];
}
