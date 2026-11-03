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
import type { GridCalibration, Location, MapMotion } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import { combatantFootprint } from "@/lib/battlemap/tokenFootprint";
import { createOccupancy, startOffsets } from "@/lib/battlemap/occupancy";
import { currentMapLive } from "@/lib/battlemap/liveLayer";
import type { MapLive } from "@/types/mapLive.types";
import type { RunCombatant } from "@/types/encounter.types";
import { buildMapStack, type MapStackSource } from "@/lib/locations/mapStack";
import { isInteriorType } from "@/lib/locations/tiers";

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

/** What a battle map draws, as `BattleMapStack` takes it: the DM's `BattleSurface` is one, and the player's view
 *  builds one from its own projection. */
export type BattleMapLayers = Pick<BattleSurface, "imageUrl" | "standUrl" | "standLiveUrl" | "live" | "picture" | "motion">;

export interface BattleSurface {
  /** The location whose map stack (`lib/locations/mapStack.ts`) the battle
   *  map draws — `imageUrl` + `calibration` below are already resolved from
   *  it, so a caller never needs to re-read `mapLocation.map_url` /
   *  `grid_calibration` directly (#884: that would only ever see the
   *  Picture, never a Drawing). */
  mapLocation: Location;
  /** The room this encounter is anchored to, when `mapLocation` is that
   *  room's *parent* site rather than a map of the room's own. Null when the
   *  encounter's own location is what's on screen — there is nothing to
   *  focus, the whole map is the surface ("as today"). */
  focusRoomId: string | null;
  /** The room's traced cells, converted to battle-cell space. Empty when
   *  there is no focus room. */
  focusCells: CellKey[];
  /** The frame's calibration — `mapLocation`'s Drawing if it has one, else
   *  its Picture (#884: `primaryImage`'s calibration). */
  calibration: GridCalibration;
  /** The map image the battle view actually draws — the site's Drawing when
   *  it has one, else its Picture (#884: `primaryImage`'s url). */
  imageUrl: string;
  /** The live-layer snapshot (#1073): walls, doors and lights in the image cells of `imageUrl`. It applies when the
   *  Drawing is what is drawn, and also when the place has no Drawing at all and still carries a snapshot (an import
   *  writes walls, doors and lights straight into a Picture's cells, #1125). Null when there is none. */
  live: MapLive | null;
  /** The site's Picture drawn UNDER its Drawing (#1125 decision 8), so a fight shows the scan through the transparent
   *  bake. Set only when there is a Drawing and both layers are calibrated: the battle map measures the image, then
   *  places it with `placeCalibrated(drawingCalibration, calibration, ...)`, because the Picture's natural size is
   *  not known here. Null otherwise (a Picture with no Drawing is `imageUrl` itself). */
  picture: { url: string; calibration: GridCalibration; drawingCalibration: GridCalibration } | null;
  /** The Picture moves (#1125 decision 6): the file lives on the DM's device under `key` (the map location's id),
   *  `still` is `map_url`. Null for a still Picture, and always null on a player's surface. */
  motion: { key: string; kind: MapMotion["kind"]; still: string; fileName: string; bytes: number } | null;
  /** The Drawing's standing half (#1073), drawn over the grid. Set only when `imageUrl` IS the site's Drawing, for
   *  the same reason as `live`: a hand-calibrated Picture has no standing layer. Null for a drawing published
   *  before the split. */
  standUrl: string | null;
  /** The standing half without the props that sway (#1073), shown in place of `standUrl` while the top live layer
   *  animates. Set under the same rule as `standUrl`; null when nothing sways. */
  standLiveUrl: string | null;
}

// The surface is the Drawing, or (no Drawing) the Picture; either way the snapshot is in its cells.
function liveFor(loc: Location): MapLive | null {
  return currentMapLive(loc.map_live);
}

/** The Picture under the Drawing, for a surface that builds its own layers (the player's map). */
export function pictureUnderDrawing(loc: MapStackSource | null | undefined): BattleSurface["picture"] {
  const { picture, drawing } = buildMapStack(loc);
  return picture && drawing && picture.calibration && drawing.calibration
    ? { url: picture.url, calibration: picture.calibration, drawingCalibration: drawing.calibration }
    : null;
}

function motionFor(loc: Location): BattleSurface["motion"] {
  const { picture, motion } = buildMapStack(loc);
  return picture && motion
    ? { key: motion.key, kind: motion.motion.kind, still: picture.url, fileName: motion.motion.file_name, bytes: motion.motion.bytes }
    : null;
}

function standFor(loc: Location, imageUrl: string): string | null {
  return loc.map_layer_url !== null && loc.map_layer_url === imageUrl ? loc.map_layer_stand_url : null;
}

function standLiveFor(loc: Location, imageUrl: string): string | null {
  return loc.map_layer_url !== null && loc.map_layer_url === imageUrl ? loc.map_layer_stand_live_url : null;
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

  // A location with its own calibrated map (Drawing or Picture) behaves
  // exactly as before a room could be a battle-map anchor — including a room
  // that happens to carry a scanned map of its own rather than living on its
  // site's plan.
  const ownImage = buildMapStack(encounterLocation).primary;
  if (ownImage?.calibration) {
    return {
      mapLocation: encounterLocation,
      focusRoomId: null,
      focusCells: [],
      calibration: ownImage.calibration,
      imageUrl: ownImage.url,
      live: liveFor(encounterLocation),
      picture: pictureUnderDrawing(encounterLocation),
      motion: motionFor(encounterLocation),
      standUrl: standFor(encounterLocation, ownImage.url),
      standLiveUrl: standLiveFor(encounterLocation, ownImage.url),
    };
  }

  // An interior space (room or grounds — #886) with no map of its own opens
  // on its site's plan, focused on the cells the DM traced for it.
  // `isInteriorType` is the single reader of that distinction; this must not
  // go back to comparing `location_type` inline.
  if (isInteriorType(encounterLocation.location_type) && parent) {
    const parentImage = buildMapStack(parent).primary;
    if (parentImage?.calibration) {
      const calibration = parentImage.calibration;
      const region = regions.find(
        (r) => r.region_role === "space" && r.space_location_id === encounterLocation.id,
      );
      const focusCells = (region?.cells ?? []).map((c) => regionCellToBattleCell(c, calibration));
      return {
        mapLocation: parent,
        focusRoomId: encounterLocation.id,
        focusCells,
        calibration,
        imageUrl: parentImage.url,
        live: liveFor(parent),
        picture: pictureUnderDrawing(parent),
        motion: motionFor(parent),
        standUrl: standFor(parent, parentImage.url),
        standLiveUrl: standLiveFor(parent, parentImage.url),
      };
    }
  }

  return null;
}

// ── Seeding party tokens into the room they already occupy ─────────────────

/**
 * Places every unpositioned player-type combatant (party members and
 * companions alike — "party tokens", frame 13) on a free spot inside
 * `focusCells`, row-major, footprint-aware, never overlapping. A Tiny token
 * takes a quarter of a square (#1125 decision 13), so four share a square
 * before the next square is used. A combatant that already has a position is
 * left untouched, which is what makes this safe to call every time the battle
 * map mounts while live rather than only once: re-seeding after the DM has
 * dragged tokens around is a no-op for them. Returns a new array — the caller
 * (Pinia store state) owns identity. `footprintOf` defaults to the token's
 * current size (`combatantFootprint`).
 */
export function seedTokenPositions(
  combatants: RunCombatant[],
  focusCells: CellKey[],
  opts: { footprintOf?: (c: RunCombatant) => number } = {},
): RunCombatant[] {
  if (focusCells.length === 0) return combatants;
  const footprintOf = opts.footprintOf ?? combatantFootprint;

  const cells = focusCells.map((k) => parseCellKey(k)).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const available = new Set<CellKey>(focusCells);
  // Occupancy is tracked in half cells so a Tiny token can claim a quarter square.
  const { fits, claim } = createOccupancy(available);

  return combatants.map((c) => {
    if (c.type !== "player" || c.position) return c;
    const size = footprintOf(c);
    // Whole squares for anything a square or larger; the four quarters of a square, in reading order, for a Tiny one.
    const offsets = startOffsets(size);
    for (const [x, y] of cells) {
      for (const [ox, oy] of offsets) {
        if (!fits(x + ox, y + oy, size)) continue;
        claim(x + ox, y + oy, size);
        return { ...c, position: { x: x + ox, y: y + oy } };
      }
    }
    return c; // room too small to fit this one — leave unplaced
  });
}
