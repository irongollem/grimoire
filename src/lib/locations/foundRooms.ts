// ── Found rooms: the drawing's rooms, live in the Zoning list (#1125, frames 18-19) ──
//
// "Rooms are found for you, live from the walls, and wait in the list marked 'found'. Most DMs only rename and
// bind them. Find again redraws only the rooms you never touched." A found room is not a row until the DM does
// something to it; until then it is a derived space (`deriveSpaces`) shown beside the real rows. The matching
// ladder is `matchSpace` from publish.ts, so the list and a publish agree on which row is which room.
//
// One difference from publish, on purpose: publish only reconciles BOUND rooms, because it creates the unbound
// ones itself. Here an unbound row still claims its room (a found room the DM reshaped but has not named yet, or
// one they traced by hand), otherwise the same room would be listed twice. `matchSpace` filters to bound rows, so
// an unbound row is lent a stand-in space id for the match; the name rung cannot see it, which is right, since
// an unbound row has no name but its label.

import type { DerivedSpace } from "@/cartographer/structure.types";
import { matchSpace } from "@/lib/locations/publish";
import type { GridPoint, LocationMapRegion, LocationMapRegionInsert, LocationMapRegionUpdate } from "@/types/locationMapRegion.types";

/** One line of the Zoning list. */
export type ZoningEntry =
  /** A real row. `space` is the room the drawing currently derives for it, when it still matches one. */
  | { kind: "region"; region: LocationMapRegion; space: DerivedSpace | null; found: boolean; changed: boolean }
  /** A derived room with no row yet: shown as found, written only when the DM touches it. */
  | { kind: "found"; space: DerivedSpace };

/** Whether a row already holds this outline: a row from before outlines (null) is behind, so Find again brings it up. */
function sameOutline(held: readonly GridPoint[] | null, outline: readonly GridPoint[]): boolean {
  return held !== null && held.length === outline.length && held.every((p, i) => p[0] === outline[i][0] && p[1] === outline[i][1]);
}

const STAND_IN = "unbound:";

function firstCell(cells: readonly string[]): [number, number] {
  const [x, y] = (cells[0] ?? "0,0").split(",").map(Number);
  return [x, y];
}

/** Reading order of a room's first cell (y, then x), the order publish plans its spaces in. */
function byFirstCell(a: readonly string[], b: readonly string[]): number {
  const [ax, ay] = firstCell(a);
  const [bx, by] = firstCell(b);
  return ay - by || ax - bx;
}

/**
 * Pair every derived space with the room row that claims it, one row per space, in publish's order so the first
 * space to claim a row keeps it. Rows left over are returned as `unmatched`.
 */
function pairSpaces(
  derived: readonly DerivedSpace[],
  regions: readonly LocationMapRegion[],
  spaceNames: ReadonlyMap<string, string>,
): { pairs: Map<string, LocationMapRegion>; unmatched: LocationMapRegion[] } {
  const originals = new Map(regions.map((r) => [r.id, r]));
  const pool = regions
    .filter((r) => r.region_role === "space")
    .map((r) => (r.space_location_id === null ? { ...r, space_location_id: `${STAND_IN}${r.id}` } : r));
  const pairs = new Map<string, LocationMapRegion>();
  for (const space of [...derived].sort((a, b) => byFirstCell(a.cells, b.cells))) {
    const match = matchSpace(space, pool, spaceNames);
    if (!match) continue;
    pool.splice(pool.indexOf(match.region), 1);
    pairs.set(space.key, originals.get(match.region.id)!);
  }
  return { pairs, unmatched: pool.map((r) => originals.get(r.id)!) };
}

/**
 * The one list the Zoning panel renders: room rows first, then found rooms (derived, no row yet), then the other
 * zone kinds. A row is `found` while it came from the walls (`derived_from === "floodfill"`) and still matches a
 * derived room; `changed` says those walls have moved since (a Find again would redraw it).
 */
export function zoningList(
  derived: readonly DerivedSpace[],
  regions: readonly LocationMapRegion[],
  spaceNames: ReadonlyMap<string, string>,
): ZoningEntry[] {
  const { pairs } = pairSpaces(derived, regions, spaceNames);
  const spaceOf = new Map<string, DerivedSpace>();
  for (const space of derived) {
    const region = pairs.get(space.key);
    if (region) spaceOf.set(region.id, space);
  }

  const entry = (region: LocationMapRegion): ZoningEntry => {
    const space = spaceOf.get(region.id) ?? null;
    const found = space !== null && region.derived_from === "floodfill";
    return { kind: "region", region, space, found, changed: found && (region.cell_signature !== space.signature || !sameOutline(region.vertices, space.outline)) };
  };

  const rooms = regions.filter((r) => r.region_role === "space").map(entry);
  const zones = regions.filter((r) => r.region_role !== "space").map(entry);
  const unclaimed = [...derived]
    .filter((s) => !pairs.has(s.key))
    .sort((a, b) => byFirstCell(a.cells, b.cells))
    .map((space): ZoningEntry => ({ kind: "found", space }));
  return [...rooms, ...unclaimed, ...zones];
}

/**
 * The row a found room becomes the moment the DM acts on it. Left as it is (no `edit`) it is still the walls'
 * room (`floodfill`) and Find again may redraw it. Given the DM's `edit` (a rename, a bind, a reshape) it is
 * stamped `dm`, which is what keeps Find again and Publish from ever overwriting it.
 */
export function materializeFound(
  space: DerivedSpace,
  siteId: string,
  edit?: Pick<LocationMapRegionInsert, "label" | "space_location_id" | "cells" | "vertices">,
): LocationMapRegionInsert {
  return {
    site_location_id: siteId,
    region_role: "space",
    derived_from: edit ? "dm" : "floodfill",
    cell_signature: space.signature,
    cells: space.cells,
    // A reshape that writes squares without an outline of its own leaves the walls' outline stale, so it drops it.
    vertices: edit && edit.cells !== undefined && edit.vertices === undefined ? null : space.outline,
    label: space.name,
    ...edit,
  };
}

/**
 * Find again: bring every room the DM never touched (`floodfill`) to the cells and outline its derived room has now. A `dm` row
 * is never in the result. Rooms that no longer match anything are left alone (nothing is deleted, as in publish).
 *
 * Against `planPublish` for the same inputs: publish also redraws `annotation` rows and only reconciles bound ones;
 * this redraws only `floodfill` rows, bound or not, because those are the ones the DM has not touched.
 */
export function findAgain(
  derived: readonly DerivedSpace[],
  regions: readonly LocationMapRegion[],
  spaceNames: ReadonlyMap<string, string>,
): { id: string; update: LocationMapRegionUpdate }[] {
  const { pairs } = pairSpaces(derived, regions, spaceNames);
  const updates: { id: string; update: LocationMapRegionUpdate }[] = [];
  for (const space of derived) {
    const region = pairs.get(space.key);
    if (!region || region.derived_from !== "floodfill" || (region.cell_signature === space.signature && sameOutline(region.vertices, space.outline))) continue;
    updates.push({ id: region.id, update: { cells: space.cells, cell_signature: space.signature, vertices: space.outline } });
  }
  return updates;
}
