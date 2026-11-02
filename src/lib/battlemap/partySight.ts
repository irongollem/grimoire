// What the party sees of a map (epic #1133): the squares any party character can see right now, the map's memory of
// squares seen before, and which tokens a player screen may therefore draw. Pure and DOM-free; all squares are battle
// cells of the map picture ("x,y"), the space token positions, lights and walls already use.

import type { FogCellKey } from "@/lib/battlemap/fogMask";
import { AMBIENT, illuminationGrid, NO_ZONES, type DarknessZone } from "@/lib/battlemap/illumination";
import { NO_OCCLUDERS, occludersOf } from "@/lib/battlemap/occlusion";
import { combatantFootprint, type SizedToken } from "@/lib/battlemap/tokenFootprint";
import { SEEN_THRESHOLD, visionGrid, type LitScene, type Viewer } from "@/lib/battlemap/vision";
import type { MapLive, MapLiveDoorState } from "@/types/mapLive.types";

/** The battle cells of the map picture; cell (0,0) is its top-left. */
export interface MapGrid {
  cols: number;
  rows: number;
}

/** The light and walls sight reads: the snapshot's lights, walls and doors at their play state, magical darkness; with no snapshot (a plain picture), daylight with nothing in the way. */
export function sightScene(live: MapLive | null, doorStates: readonly MapLiveDoorState[], zones: readonly DarknessZone[]): LitScene {
  if (!live) return { ambient: AMBIENT.daylight, sources: [], occluders: NO_OCCLUDERS, zones };
  // Shares the occluder memo with the veil, so a token move rebuilds no wall index.
  return { ambient: AMBIENT[live.darkness], sources: live.lights, occluders: occludersOf(live, doorStates), zones };
}

/** Every square some viewer sees: lit (or in darkvision/blindsight/truesight range) with a clear line. No viewers: an empty set. */
export function sightCells(scene: LitScene, viewers: readonly Viewer[], grid: MapGrid): Set<FogCellKey> {
  const cells = new Set<FogCellKey>();
  // visionGrid treats an empty viewer list as "no line to test" and returns the light itself, which would show a lit map to nobody.
  if (viewers.length === 0 || grid.cols <= 0 || grid.rows <= 0) return cells;
  const { cols, rows } = grid;
  // One sample per cell, at its centre: the same test `canSee` makes, at a fraction of the cost of the veil's grid.
  const illumination = illuminationGrid({
    ambient: scene.ambient,
    sources: scene.sources,
    occluders: scene.occluders,
    minX: 0,
    minY: 0,
    cols,
    rows,
    samplesPerCell: 1,
    zones: scene.zones.length > 0 ? scene.zones : NO_ZONES,
  });
  const { seen } = visionGrid({
    illumination,
    minX: 0,
    minY: 0,
    cols,
    rows,
    samplesPerCell: 1,
    viewers,
    occluders: scene.occluders,
    zones: scene.zones,
  });
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (seen[y * cols + x] > SEEN_THRESHOLD) cells.add(`${x},${y}`);
    }
  }
  return cells;
}

/** What a player screen shows: what the map remembers and what is seen now. */
export function shownCells(memory: ReadonlySet<FogCellKey>, sight: ReadonlySet<FogCellKey>): Set<FogCellKey> {
  return new Set([...memory, ...sight]);
}

/** Seen now but not yet remembered, sorted: what a DM window writes to the map's memory. */
export function newlySeen(memory: ReadonlySet<FogCellKey>, sight: ReadonlySet<FogCellKey>): FogCellKey[] {
  // Sorted by (x, y) numerically so two windows computing the same sight write the same payload.
  return [...sight]
    .filter((k) => !memory.has(k))
    .sort((a, b) => {
      const [ax, ay] = a.split(",").map(Number);
      const [bx, by] = b.split(",").map(Number);
      return ax - bx || ay - by;
    });
}

/** Every square a token's box touches; a Tiny one on a half square touches only its own. Positions may be fractional. */
export function footprintCells(token: SizedToken & { position: { x: number; y: number } }): FogCellKey[] {
  const size = combatantFootprint(token);
  const endX = Math.ceil(token.position.x + size);
  const endY = Math.ceil(token.position.y + size);
  const cells: FogCellKey[] = [];
  for (let x = Math.floor(token.position.x); x < endX; x++) {
    for (let y = Math.floor(token.position.y); y < endY; y++) cells.push(`${x},${y}`);
  }
  return cells;
}

/** Tokens a player screen draws: its own (ownId) always, a token with no position never, any other only where the party sees a square of its footprint. */
export function partyVisibleCombatants<T extends SizedToken & { instance_id: string; position?: { x: number; y: number } | null }>(
  list: readonly T[],
  sight: ReadonlySet<FogCellKey>,
  ownId: string | null,
): T[] {
  return list.filter((c) => {
    if (c.instance_id === ownId) return true;
    if (!c.position) return false;
    return footprintCells({ ...c, position: c.position }).some((k) => sight.has(k));
  });
}

/**
 * Tokens the Table screen draws (and the DM's "As players see it" preview, which stands for it): every placed player
 * character always, since the TV is each player's own screen and each sees their own coin there; any other token
 * (monsters, NPCs, allies) only where the party sees a square of its footprint.
 */
export function tableTokens<T extends SizedToken & { type: string; position?: { x: number; y: number } | null }>(
  list: readonly T[],
  sight: ReadonlySet<FogCellKey>,
): T[] {
  return list.filter((c) => {
    if (!c.position) return false;
    if (c.type === "player") return true;
    return footprintCells({ ...c, position: c.position }).some((k) => sight.has(k));
  });
}

/**
 * The battle cells a map picture covers, from its calibration and its natural size; null until the picture's size is
 * known. The column count is a whole number (rounded up, as the Explore screen does with its frame): a calibration
 * like 29.9999 would otherwise make every row-major index `j * cols + i` fractional and sight would read only row 0.
 * The rows follow the unrounded width, which is the one the picture is drawn at.
 */
export function imageGrid(cellsAcross: number | null | undefined, size: { w: number; h: number } | null): MapGrid | null {
  if (!size || cellsAcross == null || !Number.isFinite(cellsAcross) || cellsAcross <= 0) return null;
  if (!Number.isFinite(size.w) || !Number.isFinite(size.h) || size.w <= 0 || size.h <= 0) return null;
  return { cols: Math.ceil(cellsAcross), rows: Math.ceil(cellsAcross * (size.h / size.w)) };
}
