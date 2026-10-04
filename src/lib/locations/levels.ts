import { childrenOf } from "./tree";
import type { AtlasIndex } from "./tree";
import type { LocationSummary } from "@/types/location.types";

/** A child that its DM has assigned as one of the parent's floors. */
function isLevelChild(child: LocationSummary): boolean {
  return child.is_level === true;
}

export interface LevelsInfo {
  /** The site whose levels these are — always the top of the list. */
  container: LocationSummary;
  /** `[container, ...container's is_level children]`, in sibling order. */
  levels: LocationSummary[];
}

/**
 * The levels of a site, viewed from either end of the relationship.
 *
 * A level is `child.is_level === true` and nothing else (migration
 * `20260928195128`). It used to be read off the tree — every nested site,
 * later "corrected" by guessing from the parent's own plan (a nested site
 * the plan drew as a space was "not a level") and then from type (a store,
 * tavern or inn was "never a level"). Both guesses broke: frame 06 itself
 * enters a level by clicking its polygon on the floor above, so "drawn on
 * the parent" cannot mean "not a level"; and a department store's own
 * floors are stores. The maintainer, 28 Sep 2026: "shouldn't levels just be
 * formally assigned as such rather than drawing arbitrary conclusions?" So
 * neither type nor plan decides — the DM says it, with the `is_level` flag
 * (guarded by `guard_location_room_parent`), and nothing infers it.
 *
 * `levelsOf` reads that flag from either end of the relationship — S is 1,
 * A is 2, B is 3, whether the DM is looking at S, A, or B — so the list is
 * always anchored on the container (S), never on whichever end is currently
 * being looked at: from S's own page the container IS `location`; from A's
 * or B's page the container is `location.parent_id`, resolved and re-listed
 * the identical way. Either direction produces the same `[container,
 * ...levels]` array, so `levelOrdinal` returns the same number for the same
 * location regardless of which level the reader started from.
 * A flagged level stays in its parent's list even when it has levels of its own.
 *
 * Returns `null` when `location` has no place in a level list at all: it
 * has no `is_level` children of its own AND it is not itself flagged
 * `is_level` with a resolvable parent. A room is never a level — the guard
 * refuses `is_level` on anything that isn't site-tier.
 */
export function levelsOf(index: AtlasIndex, location: LocationSummary): LevelsInfo | null {
  if (location.is_level && location.parent_id) {
    const parent = index.byId.get(location.parent_id);
    if (parent) {
      const siblingLevels = childrenOf(index, parent.id).filter(isLevelChild);
      return { container: parent, levels: [parent, ...siblingLevels] };
    }
  }

  const ownLevelChildren = childrenOf(index, location.id).filter(isLevelChild);
  if (ownLevelChildren.length > 0) {
    return { container: location, levels: [location, ...ownLevelChildren] };
  }
  return null;
}

/** 1-based position of `id` within `levels`, or `null` if it isn't in the list. */
export function levelOrdinal(levels: readonly LocationSummary[], id: string): number | null {
  const idx = levels.findIndex((l) => l.id === id);
  return idx === -1 ? null : idx + 1;
}
