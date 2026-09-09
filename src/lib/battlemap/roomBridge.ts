// The bridge between a room traced on a site's published plan and the battle
// map that plan becomes at combat's cell scale (epic #868, frame 13 "When
// the plan is a battle map"). A room's traced cells live in the
// Cartographer's own coordinate space — the same space `location_map_regions
// .cells` and `grid_calibration.origin_cell_x/y` share. The battle map's
// tokens and fog mask live in *image*-cell space instead: cell (0,0) is the
// image's own top-left corner, offset from the map-cell grid by the bake
// padding (see `origin_cell_x/y`'s docstring in `location.types.ts`). The two
// converters below are the one place that offset is ever applied, so a
// mismatch here would silently misplace every token seeded into a room.
//
// Kept side-effect-free, same convention as `battleMapGeometry.ts` and
// `fogMask.ts` — the Vue views own reactivity and persistence, this module
// only computes.

import { cellKey, parseCellKey, type CellKey } from "@/types/dungeonMap.types";
import type { GridCalibration, Location } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import type { RunCombatant } from "@/types/encounter.types";

function originOf(calibration: GridCalibration): { x: number; y: number } {
  return { x: calibration.origin_cell_x ?? 0, y: calibration.origin_cell_y ?? 0 };
}

/** A region cell (Cartographer / map-cell space) → the battle map's own
 *  image-cell space, where token positions and the fog mask live. */
export function regionCellToBattleCell(cell: CellKey, calibration: GridCalibration): CellKey {
  const [x, y] = parseCellKey(cell);
  const origin = originOf(calibration);
  return cellKey(x - origin.x, y - origin.y);
}

/** The exact inverse of `regionCellToBattleCell`. */
export function battleCellToRegionCell(cell: CellKey, calibration: GridCalibration): CellKey {
  const [x, y] = parseCellKey(cell);
  const origin = originOf(calibration);
  return cellKey(x + origin.x, y + origin.y);
}

// ── Which map an encounter opens on ─────────────────────────────────────────

export interface BattleSurface {
  /** The location whose `map_url` / `grid_calibration` the battle map draws. */
  mapLocation: Location;
  /** The room this encounter is anchored to, when `mapLocation` is that
   *  room's *parent* site rather than a map of the room's own. Null when the
   *  encounter's own location is what's on screen — there is nothing to
   *  focus, the whole map is the surface ("as today"). */
  focusRoomId: string | null;
  /** The room's traced cells, converted to battle-cell space. Empty when
   *  there is no focus room. */
  focusCells: CellKey[];
  calibration: GridCalibration;
}

/**
 * Resolves which map a running encounter's battle view draws, and — when
 * that map belongs to a parent site rather than the encounter's own
 * location — which cells are the focused room. A room without a map of its
 * own is not a second surface: it is the site's plan, already grid-
 * calibrated by the publish, read at its own cells.
 */
export function resolveBattleSurface(params: {
  encounterLocation: Location | null | undefined;
  parent: Location | null | undefined;
  regions: LocationMapRegion[];
}): BattleSurface | null {
  const { encounterLocation, parent, regions } = params;
  if (!encounterLocation) return null;

  // A location with its own calibrated map behaves exactly as before a room
  // could be a battle-map anchor — including a room that happens to carry a
  // scanned map of its own rather than living on its site's plan.
  if (encounterLocation.map_url && encounterLocation.grid_calibration) {
    return {
      mapLocation: encounterLocation,
      focusRoomId: null,
      focusCells: [],
      calibration: encounterLocation.grid_calibration,
    };
  }

  // A room with no map of its own opens on its site's plan, focused on the
  // cells the DM traced for it.
  if (encounterLocation.location_type === "room" && parent?.map_url && parent.grid_calibration) {
    const calibration = parent.grid_calibration;
    const region = regions.find(
      (r) => r.region_role === "space" && r.space_location_id === encounterLocation.id,
    );
    const focusCells = (region?.cells ?? []).map((c) => regionCellToBattleCell(c, calibration));
    return { mapLocation: parent, focusRoomId: encounterLocation.id, focusCells, calibration };
  }

  return null;
}

// ── Seeding party tokens into the room they already occupy ─────────────────

/**
 * Places every unpositioned player-type combatant (party members and
 * companions alike — "party tokens", frame 13) on a free cell inside
 * `focusCells`, row-major, footprint-aware, never overlapping. A combatant
 * that already has a position is left untouched, which is what makes this
 * safe to call every time the battle map mounts while live rather than only
 * once: re-seeding after the DM has dragged tokens around is a no-op for
 * them. Returns a new array — the caller (Pinia store state) owns identity.
 */
export function seedTokenPositions(
  combatants: RunCombatant[],
  focusCells: CellKey[],
  opts: { footprintOf: (c: RunCombatant) => number },
): RunCombatant[] {
  if (focusCells.length === 0) return combatants;

  const cells = focusCells.map((k) => parseCellKey(k)).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const available = new Set<CellKey>(focusCells);
  const occupied = new Set<CellKey>();

  function fits(x: number, y: number, size: number): boolean {
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const key = cellKey(x + dx, y + dy);
        if (!available.has(key) || occupied.has(key)) return false;
      }
    }
    return true;
  }

  function claim(x: number, y: number, size: number): void {
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        occupied.add(cellKey(x + dx, y + dy));
      }
    }
  }

  return combatants.map((c) => {
    if (c.type !== "player" || c.position) return c;
    const size = Math.max(1, opts.footprintOf(c));
    const spot = cells.find(([x, y]) => fits(x, y, size));
    if (!spot) return c; // room too small to fit this one — leave unplaced
    claim(spot[0], spot[1], size);
    return { ...c, position: { x: spot[0], y: spot[1] } };
  });
}

// ── Fog: entering combat starts revealed where the party is standing ───────

/** The room's own cells, revealed by default — "you are standing in it". */
export function seedFogMask(focusCells: CellKey[]): Set<CellKey> {
  return new Set(focusCells);
}

// ── Leaving combat: which rooms did the party actually see? ────────────────

/**
 * Rooms whose traced region is at least half revealed by the encounter's fog
 * mask (both compared in battle-cell space — `calibration` converts each
 * region's own cells once per call). Frame 16: "leaving asserts explored —
 * rooms the DM revealed get an `explored` event." Never the reverse.
 */
export function roomsRevealedInCombat(
  revealedCells: Set<string>,
  regions: LocationMapRegion[],
  calibration: GridCalibration,
): string[] {
  const revealed: string[] = [];
  for (const region of regions) {
    if (region.region_role !== "space" || !region.space_location_id) continue;
    if (region.cells.length === 0) continue;
    let hits = 0;
    for (const cell of region.cells) {
      if (revealedCells.has(regionCellToBattleCell(cell, calibration))) hits++;
    }
    if (hits / region.cells.length >= 0.5) revealed.push(region.space_location_id);
  }
  return revealed;
}
