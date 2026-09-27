import { isSiteType } from "./tiers";
import { childrenOf } from "./tree";
import type { AtlasIndex } from "./tree";
import type { Location } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

/** Which children a site's own map draws as spaces, by site id. */
export type DrawnOnPlan = (siteId: string) => ReadonlySet<string>;

const NOTHING_DRAWN: ReadonlySet<string> = new Set();
/** For a caller with no plans to consult (a test, a site with no map). */
export const NO_PLANS: DrawnOnPlan = () => NOTHING_DRAWN;

/**
 * The children a site's plan draws: every space region with cells, by the
 * place it is bound to. A nested site among them is a place on that floor
 * (a shop off a lane, a shrine in a hall), not a floor of its own.
 */
export function drawnSpaceIds(regions: readonly LocationMapRegion[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const region of regions) {
    if (region.region_role === "space" && region.space_location_id && region.cells.length > 0) ids.add(region.space_location_id);
  }
  return ids;
}

export interface LevelsInfo {
  /** The site whose levels these are — always the top of the list. */
  container: Location;
  /** `[container, ...container's site-typed children]`, in sibling order. */
  levels: Location[];
}

/**
 * The levels of a site, viewed from either end of the relationship.
 *
 * A "level" is a site-typed child of a site — S contains A and B, so S/A/B
 * are S's three levels. The list is always anchored on the container (S),
 * never on whichever end is currently being looked at, so the numbering
 * a DM sees does not depend on which page they opened: from S's own page
 * the container IS `location`; from A's or B's page the container is
 * `location.parent_id`, resolved and re-listed the identical way. Either
 * direction produces the same `[container, ...children]` array, so
 * `levelOrdinal` returns the same number for the same location regardless
 * of which level the reader started from.
 *
 * Returns `null` when `location` has no place in a level list at all: it has
 * no site-typed children of its own AND either it is not itself a site type,
 * or its parent isn't one either. A room is never a level (even one filed
 * directly under a site with other levels) — only site-typed places are.
 *
 * Nor is a nested site the parent's own map draws as a space (`drawnOn`,
 * from `drawnSpaceIds`): a shop off the Crook is a place on the Well's first
 * floor, not the Well's fourth. A level is never drawn on the floor above
 * it, so that is the line. Required rather than defaulted, so no surface can
 * count levels without it and disagree with the others (27 Sep 2026: the
 * Well listed Fondant's Window as level 4).
 */
export function levelsOf(index: AtlasIndex, location: Location, drawnOn: DrawnOnPlan): LevelsInfo | null {
  const ownDrawn = drawnOn(location.id);
  const ownSiteChildren = childrenOf(index, location.id)
    .filter((c) => isSiteType(c.location_type) && !ownDrawn.has(c.id));
  if (ownSiteChildren.length > 0) {
    return { container: location, levels: [location, ...ownSiteChildren] };
  }

  if (!isSiteType(location.location_type) || !location.parent_id) return null;
  const parent = index.byId.get(location.parent_id);
  if (!parent || !isSiteType(parent.location_type)) return null;
  // Drawn on the parent's own map: a place on that floor, so not a level.
  const parentDrawn = drawnOn(parent.id);
  if (parentDrawn.has(location.id)) return null;

  const siblingSites = childrenOf(index, parent.id)
    .filter((c) => isSiteType(c.location_type) && !parentDrawn.has(c.id));
  return { container: parent, levels: [parent, ...siblingSites] };
}

/** 1-based position of `id` within `levels`, or `null` if it isn't in the list. */
export function levelOrdinal(levels: readonly Location[], id: string): number | null {
  const idx = levels.findIndex((l) => l.id === id);
  return idx === -1 ? null : idx + 1;
}
