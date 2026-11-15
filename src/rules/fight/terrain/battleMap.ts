// The battle map of a fight as the rules see it: which walls and closed doors block, which squares are solid rock,
// which are difficult ground. Pure and edge-importable (relative `.ts` imports only).
//
// It is assembled by the very functions the Play screen uses (`resolveBattleSurface` for which map, `terrainZonesOf`
// for which zones, `occludersOf` for walls and doors), so a fight in a room on the server sees exactly the walls,
// doors and difficult squares the DM's screen does. Nothing here is a second reading of the map.

import { gridFromRatio } from "../../../lib/battlemap/imageGrid.ts";
import { NO_OCCLUDERS, occludersOf, type Occluders } from "../../../lib/battlemap/occlusion.ts";
import { resolveBattleSurface, type PlanRegion, type SurfaceLocation } from "../../../lib/battlemap/roomBridge.ts";
import { terrainZonesOf } from "../../../lib/battlemap/terrainZones.ts";
import { edgeExits, entranceExits, type ExitRegion, type MapExit } from "../../../lib/battlemap/mapExits.ts";
import type { GridCalibration } from "../../../types/location.types.ts";
import type { MapLive, MapLiveDoorState } from "../../../types/mapLive.types.ts";
import { coverCells, type ReachBounds, type ReachInput } from "./reach.ts";
import type { Cell } from "../../../lib/battlemap/movement.ts";

export interface FightMapInput {
  /** The place the encounter is anchored to. */
  encounterLocation: SurfaceLocation | null;
  /** Its parent, when it is an interior space (a room) that may live on its site's plan. */
  parent: SurfaceLocation | null;
  /** The regions of the encounter's site (`useLocationBattleSurface`'s `siteId`: the parent of an interior, else the place). */
  regions: readonly (PlanRegion & ExitRegion)[];
  /** `map_memory.door_states` of the map place: what the DM opened or shut in play. */
  doorStates: readonly MapLiveDoorState[];
  /** `map_memory.seen` of the map place, decoded: the cells (`"x,y"`) the party has seen. Proof that those rows exist. */
  seen: ReadonlySet<string>;
}

export interface FightMap {
  /** The place whose map the fight is on: the room's parent site when the room has no map of its own. */
  mapLocationId: string;
  /** Walls and the doors that are not open, plus solid cells, in image cells. */
  occluders: Occluders;
  /** Cells (`"x,y"`, image cells) with a movement cost above 1, from the zones the fight crosses. */
  difficult: ReadonlySet<string>;
  /** Solid rock cells (`"x,y"`). */
  solid: ReadonlySet<string>;
  calibration: GridCalibration;
  /** The cells the map has, inclusive (see `boundsOf`). When `rowsKnown` is false `maxY` is only what is known to exist. */
  bounds: ReachBounds;
  /**
   * Whether the picture's height is known (`calibration.image_height_over_width`). When it is not, `bounds.maxY` is the
   * deepest row known to be on the map and `reachTerrainOf` adds the rows the creatures stand on.
   */
  rowsKnown: boolean;
  /**
   * The ways off the map (#1203), in battle cells: every Entrance zone square of the map's place, plus, for open
   * country (a `wilds`), every cell on the border of the bounds. Solid rock and cells outside the bounds are not
   * exits. Empty for a map with neither (a sealed dungeon level): a creature there has no way off.
   */
  exits: readonly MapExit[];
}

/**
 * Where the map ends. Columns are always known: `ceil(cells_per_image_width)`. Rows follow the picture's shape when the
 * calibration records it (`ceil(cells_per_image_width * image_height_over_width)`, the arithmetic of `imageGrid`).
 *
 * When it does not (a map nobody has opened since the shape was recorded), the rows are the ones KNOWN to be on the
 * map and nothing more: the deepest of the cells the party has seen, the walls and doors, the solid cells and the
 * difficult cells (the creatures' own are added by `reachTerrainOf`). That is deliberately conservative: a creature
 * may be offered less room than the picture has, never a square off it. It heals when the DM next opens the map,
 * which writes the shape.
 */
function boundsOf(
  calibration: GridCalibration,
  known: { seen: ReadonlySet<string>; solid: ReadonlySet<string>; difficult: ReadonlySet<string>; entrances: ReadonlySet<string>; live: MapLive | null },
): { bounds: ReachBounds; rowsKnown: boolean } {
  const maxX = Math.ceil(calibration.cells_per_image_width) - 1;
  const grid = gridFromRatio(calibration.cells_per_image_width, calibration.image_height_over_width);
  if (grid !== null) return { bounds: { minX: 0, minY: 0, maxX, maxY: grid.rows - 1 }, rowsKnown: true };
  let maxY = -1;
  const ofKey = (key: string) => Number(key.slice(key.indexOf(",") + 1));
  for (const set of [known.seen, known.solid, known.difficult, known.entrances]) for (const key of set) maxY = Math.max(maxY, ofKey(key));
  // A point on a line between two rows proves the row above it; a point inside a row proves that row.
  const ofPoint = (y: number) => Math.ceil(y) - 1;
  for (const w of known.live?.walls ?? []) maxY = Math.max(maxY, ofPoint(w.a[1]), ofPoint(w.b[1]));
  for (const d of known.live?.doors ?? []) maxY = Math.max(maxY, ofPoint(d.a[1]), ofPoint(d.b[1]));
  return { bounds: { minX: 0, minY: 0, maxX, maxY }, rowsKnown: false };
}

/**
 * The fight's map, or null when it has none the rules can use: no place, no calibrated map, or a map whose live
 * snapshot is of an older version (`currentVersionOf`): that site has walls the rules cannot read, and treating it
 * as open ground would walk creatures through all of them until it is published again.
 *
 * A calibrated map with NO snapshot at all is a different thing and is a map: a picture with a grid and nothing
 * drawn over it. It has no walls, as on the Play screen, so everything on it is open ground.
 */
export function fightMapOf(input: FightMapInput): FightMap | null {
  const surface = resolveBattleSurface({
    encounterLocation: input.encounterLocation,
    parent: input.parent,
    regions: input.regions,
  });
  if (surface === null) return null;
  if (surface.live === null && surface.mapLocation.map_live !== null) return null;
  const occluders = surface.live === null ? NO_OCCLUDERS : occludersOf(surface.live, input.doorStates);
  const difficult = new Set(terrainZonesOf(input.regions, surface).flatMap((z) => z.battleCells));
  // An Entrance zone is on the map by definition, so it proves the rows it lies on when the picture's height is unknown.
  const entrances = entranceExits(input.regions, surface.calibration);
  const { bounds, rowsKnown } = boundsOf(surface.calibration, {
    seen: input.seen, solid: occluders.solid, difficult, entrances: new Set(entrances.map((e) => e.cell)), live: surface.live,
  });
  const openCountry = surface.mapLocation.location_type === "wilds";
  const inside = (cell: string) => {
    const [x, y] = cell.split(",").map(Number);
    return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
  };
  const exits = [...entrances, ...(openCountry ? edgeExits(bounds, rowsKnown) : [])].filter((e) => inside(e.cell) && !occluders.solid.has(e.cell));
  return {
    mapLocationId: surface.mapLocation.id,
    occluders,
    difficult,
    solid: occluders.solid,
    calibration: surface.calibration,
    bounds,
    rowsKnown,
    exits,
  };
}

/**
 * The terrain `reachable` takes: the same walls and closed doors, solid rock and difficult squares, and where the map
 * ends. `standing` are the creatures on the board: when the picture's height is not known they are rows that exist.
 */
export function reachTerrainOf(map: FightMap, standing: readonly { anchor: Cell; footprint: number }[] = []): ReachInput["terrain"] {
  let { bounds } = map;
  if (!map.rowsKnown) {
    const deepest = Math.max(bounds.maxY, ...standing.flatMap((s) => coverCells(s.anchor, s.footprint).map((c) => c.y)));
    bounds = { ...bounds, maxY: deepest };
  }
  return { difficult: map.difficult, blocking: map.occluders.segments, solid: map.solid, bounds };
}
