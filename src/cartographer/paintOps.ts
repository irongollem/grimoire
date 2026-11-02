// Layer paint/erase operations for the cartographer map editor.
//
// Pulled out of CartographerEditorView.vue so the stroke logic (direction
// lock, edge dedup, door preservation) can be exercised without Vue
// reactivity. Every function receives plain values only — never Vue refs —
// so this module must not import from "vue". Variant numbers are computed
// by the caller (via src/cartographer/tileVariants.ts) and passed in, so
// this module stays free of pack-runtime lookups.
//
// Every operation returns `true` when it actually changed `layers`, `false`
// for a no-op. None of them set a dirty flag themselves — the caller does
// `if (changed) dirty.value = true;` at the call site.

import { cellKey, type CellKey, type DungeonMapLayers, type EdgeSegType, type WallEdge } from "@/types/dungeonMap.types";
import { eraseGroundCells, paintGroundCells } from "./groundRegions";
import { nextDressingZ } from "@/cartographer/dressing";
import type { StampCategory } from "@/cartographer/stampCategories";
import { canonicaliseEdge, type CanonicalEdge, type CellEdge } from "@/cartographer/edges";
import { latticeKey } from "@/lib/battlemap/walls";
import { isLatticeKey, latticeWall, wallSegment } from "@/cartographer/wallGraph";
import { wallsAsPieces } from "@/cartographer/wallGeometry";
import { floodFill } from "@/cartographer/floodFill";
import { segmentsIntersect, type Point } from "@/lib/battlemap/walls";

export interface PaintContext {
  layers: DungeonMapLayers;
  packId: string;
  packVersion: number;
  /** Hidden walls remain physical blockers; omitted means ordinary visible creation. */
  wallVisible?: boolean;
}

/**
 * Mutable state for one paint stroke (a pointer-down-to-pointer-up drag).
 * Replaces what used to be module-level `let`s in the view — the view now
 * owns one of these and resets it at stroke start via `createStrokeState()`.
 */
export interface StrokeState {
  /** Was `isPainting.value` — true while a stroke is in progress. */
  active: boolean;
  /**
   * Direction lock: once the first edge of a drag is placed, every
   * subsequent edge in the stroke must match the same direction. Prevents
   * accidental perpendicular walls when the cursor passes near a cell corner.
   */
  direction: "H" | "V" | null;
  /**
   * Canonical edge keys already written during the current stroke, so
   * dragging back over the same edge doesn't re-randomise its variant.
   */
  painted: Set<string>;
}

export function createStrokeState(): StrokeState {
  return { active: false, direction: null, painted: new Set() };
}

export function edgeDirection(side: "N" | "E" | "S" | "W"): "H" | "V" {
  return side === "N" || side === "S" ? "H" : "V";
}

// ── Floor cell ──────────────────────────────────────────────────────────────

// Painting over floor re-skins it: the cell keeps its shape and only its pack changes.
export function paintCell(ctx: PaintContext, x: number, y: number, variant: number): boolean {
  const k = cellKey(x, y);
  const existing = ctx.layers.floor[k];
  if (!ctx.layers.terrain[k] && existing?.floor?.pack_id === ctx.packId && existing.floor.pack_version === ctx.packVersion && existing.floor.variant === variant) return false;
  Object.assign(ctx.layers, paintGroundCells(ctx.layers, new Set([k]), {
    pack_id: ctx.packId, pack_version: ctx.packVersion, variant,
  }));
  return true;
}

// A cell's terrain goes with the cell: water drawn where the floor is no longer
// there would be a ghost the walls, spaces and publish cannot see.
export function eraseCell(ctx: PaintContext, x: number, y: number): boolean {
  const k = cellKey(x, y);
  const hadFloor = Boolean(ctx.layers.floor[k]);
  const hadTerrain = Boolean(ctx.layers.terrain[k]);
  // The walls on the cell's own north and west edges go with it, as they did when they were stored on the cell.
  const ownedWalls = [latticeKey(x, y, "N"), latticeKey(x, y, "W")].filter((wallKey) => ctx.layers.walls[wallKey]);
  if (!hadFloor && !hadTerrain && ownedWalls.length === 0) return false;
  if (ownedWalls.length > 0) {
    const nextWalls = { ...ctx.layers.walls };
    for (const wallKey of ownedWalls) delete nextWalls[wallKey];
    ctx.layers.walls = nextWalls;
  }
  if (hadFloor || hadTerrain) Object.assign(ctx.layers, eraseGroundCells(ctx.layers, new Set([k])));
  return true;
}

// ── Terrain tool ────────────────────────────────────────────────────────────

/**
 * Paints water (the pack's `terrainWater`) on a cell. Terrain is drawn in
 * place of the floor, but everything else keys on floor cells, so a cell with
 * no floor gets one too when the caller passes `floorVariant`.
 */
export function paintTerrainAt(
  ctx: PaintContext,
  x: number,
  y: number,
  variant: number,
  floorVariant?: number,
): boolean {
  const k = cellKey(x, y);
  // The terrain tool promises a lasting ground surface underneath newly painted water. Keep it as a separate
  // source, so removing the water reveals its original floor variant instead of deleting the playable square.
  const addedFloor = floorVariant !== undefined && !ctx.layers.floor[k]?.floor
    ? paintCell(ctx, x, y, floorVariant)
    : false;
  const existing = ctx.layers.terrain[k];
  if (existing?.pack_id === ctx.packId && existing.variant === variant && existing.pack_version === ctx.packVersion) return addedFloor;
  Object.assign(ctx.layers, paintGroundCells(ctx.layers, new Set([k]), {
    pack_id: ctx.packId, pack_version: ctx.packVersion, variant,
  }, "terrainWater"));
  return true;
}

export function eraseTerrainAt(ctx: PaintContext, x: number, y: number): boolean {
  const k = cellKey(x, y);
  if (!ctx.layers.terrain[k]) return false;
  Object.assign(ctx.layers, eraseGroundCells(ctx.layers, new Set([k]), "terrainWater"));
  return true;
}

// ── Solid block tool ─────────────────────────────────────────────────────────

export function paintSolidAt(ctx: PaintContext, x: number, y: number, variant: number): boolean {
  const k = cellKey(x, y);
  if (ctx.layers.solidBlock[k]?.variant === variant) return false;
  ctx.layers.solidBlock[k] = { pack_id: ctx.packId, pack_version: ctx.packVersion, variant };
  return true;
}

export function eraseSolidAt(ctx: PaintContext, x: number, y: number): boolean {
  const k = cellKey(x, y);
  if (!ctx.layers.solidBlock[k]) return false;
  const next = { ...ctx.layers.solidBlock };
  delete next[k];
  ctx.layers.solidBlock = next;
  return true;
}

// ── Place tool: objects ─────────────────────────────────────────────────────

export function paintObjectAt(
  ctx: PaintContext,
  x: number,
  y: number,
  category: StampCategory,
  variant: number,
  rotation: number,
): boolean {
  const k = cellKey(x, y);
  ctx.layers.object[k] = {
    pack_id: ctx.packId,
    pack_version: ctx.packVersion,
    category,
    variant,
    ...(rotation ? { rotation } : {}),
  };
  return true;
}

export function eraseObjectAt(ctx: PaintContext, x: number, y: number): boolean {
  const k = cellKey(x, y);
  if (!ctx.layers.object[k]) return false;
  const next = { ...ctx.layers.object };
  delete next[k];
  ctx.layers.object = next;
  return true;
}

// ── Dressing (props, epic #1062) ──────────────────────────────────────────────
// Placements are keyed by a uuid the caller mints, so tests stay deterministic.
// Like the cell layers above, each op replaces `layers.dressing` rather than
// mutating it.

function normaliseRotation(degrees: number): number {
  return ((Math.round(degrees) % 360) + 360) % 360;
}

export function placeDressing(
  layers: DungeonMapLayers,
  placement: { prop_id: string; x: number; y: number; rotation: number },
  id: string,
): boolean {
  if (layers.dressing[id]) return false;
  layers.dressing = {
    ...layers.dressing,
    [id]: {
      prop_id: placement.prop_id,
      x: placement.x,
      y: placement.y,
      rotation: normaliseRotation(placement.rotation),
      z: nextDressingZ(layers.dressing),
    },
  };
  return true;
}

export function moveDressing(layers: DungeonMapLayers, id: string, x: number, y: number): boolean {
  const current = layers.dressing[id];
  if (!current || (current.x === x && current.y === y)) return false;
  layers.dressing = { ...layers.dressing, [id]: { ...current, x, y } };
  return true;
}

export function rotateDressing(layers: DungeonMapLayers, id: string, rotation: number): boolean {
  const current = layers.dressing[id];
  if (!current) return false;
  const next = normaliseRotation(rotation);
  if (next === current.rotation) return false;
  layers.dressing = { ...layers.dressing, [id]: { ...current, rotation: next } };
  return true;
}

export function removeDressing(layers: DungeonMapLayers, id: string): boolean {
  if (!layers.dressing[id]) return false;
  const next = { ...layers.dressing };
  delete next[id];
  layers.dressing = next;
  return true;
}

// ── Wall placement (edge-based, NW ownership) ─────────────────────────────────

/** The edge kinds the wall tool paints. A decal is not one: it dresses an existing wall. */
export type PaintedWallKind = Extract<EdgeSegType, "wall" | "grate" | "sluice">;

/** The lattice wall on a canonical edge, keyed as `layers.walls` keys it. */
function latticeEntry(ctx: PaintContext, canon: CanonicalEdge): { key: string; existing: WallEdge | undefined } {
  const key = latticeKey(canon.x, canon.y, canon.side);
  return { key, existing: ctx.layers.walls[key] };
}

export function paintWallAtCellEdge(
  ctx: PaintContext,
  edge: CellEdge,
  stroke: StrokeState,
  variant: number,
  kind: PaintedWallKind = "wall",
): boolean {
  const dir = edgeDirection(edge.side);
  // Direction lock: first paint of a stroke commits H or V; later perpendicular
  // edges are ignored. Single clicks (no later moves) are unaffected.
  if (stroke.active) {
    if (stroke.direction === null) stroke.direction = dir;
    else if (stroke.direction !== dir) return false;
  }

  const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
  const strokeKey = `${canon.x},${canon.y},${canon.side}`;
  if (stroke.painted.has(strokeKey)) return false;

  const { key, existing } = latticeEntry(ctx, canon);
  if (existing && !mayOverwriteEdge(existing, kind, ctx.packId, ctx.wallVisible)) {
    stroke.painted.add(strokeKey);
    return false;
  }

  ctx.layers.walls[key] = latticeWall(canon.x, canon.y, canon.side, {
    pack_id: ctx.packId,
    pack_version: ctx.packVersion,
    type: kind,
    variant,
  }, ctx.wallVisible);

  stroke.painted.add(strokeKey);
  return true;
}

// Doors are never overwritten. A plain wall only restyles a wall of another
// pack; a grate or sluice replaces a wall (any pack) or the other opening,
// but not a copy of itself from the same pack.
function mayOverwriteEdge(existing: WallEdge, kind: PaintedWallKind, packId: string, visible = true): boolean {
  if (existing.type === "doorClosed" || existing.type === "doorOpen") return false;
  const visibilityChanged = (existing.visible !== false) !== visible;
  if (kind === "wall") return existing.type === "wall" && (existing.pack_id !== packId || visibilityChanged);
  return visibilityChanged || !(existing.type === kind && existing.pack_id === packId);
}

/**
 * Sets (or, with `undefined`, removes) the decal on a wall edge. A decal only
 * dresses a plain wall, so any other edge is a no-op.
 */
export function setDecalAtEdge(ctx: PaintContext, edge: CellEdge, decal: number | undefined): boolean {
  const { key, existing } = latticeEntry(ctx, canonicaliseEdge(edge.x, edge.y, edge.side));
  if (!existing || existing.type !== "wall" || existing.decal === decal) return false;
  const { decal: _previous, ...rest } = existing;
  ctx.layers.walls[key] = decal === undefined ? rest : { ...rest, decal };
  return true;
}

// Writes a wall edge directly, skipping stroke tracking. Used by wrap-walls,
// rectangle perimeter, and shift+click — operations that aren't "strokes".
export function setWallEdgeIfEmpty(ctx: PaintContext, edge: CellEdge, variant: number): boolean {
  const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
  const { key, existing } = latticeEntry(ctx, canon);
  if (existing) return false; // preserve existing walls/doors
  ctx.layers.walls[key] = latticeWall(canon.x, canon.y, canon.side, {
    pack_id: ctx.packId,
    pack_version: ctx.packVersion,
    type: "wall",
    variant,
  }, ctx.wallVisible);
  return true;
}

// ── Door tool (edge-based) ─────────────────────────────────────────────────────

// `newDoorVariant` is only used when the edge has no existing door/wall to
// react to — an existing door reuses its own stored variant when it swaps
// open/closed, so the caller may compute it unconditionally without checking
// what's already there.
export function paintDoorAtEdge(ctx: PaintContext, edge: CellEdge, stroke: StrokeState, newDoorVariant: number): boolean {
  const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
  const strokeKey = `${canon.x},${canon.y},${canon.side}`;
  if (stroke.painted.has(strokeKey)) return false;

  const { key, existing } = latticeEntry(ctx, canon);

  let newType: EdgeSegType;
  let variant: number;
  if (existing?.type === "doorClosed") {
    newType = "doorOpen";
    variant = existing.variant; // same door model, now open
  } else if (existing?.type === "doorOpen") {
    newType = "doorClosed";
    variant = existing.variant;
  } else {
    newType = "doorClosed";
    variant = newDoorVariant;
  }

  ctx.layers.walls[key] = latticeWall(canon.x, canon.y, canon.side, {
    pack_id: ctx.packId,
    pack_version: ctx.packVersion,
    type: newType,
    variant,
  }, existing ? existing.visible : ctx.wallVisible);
  stroke.painted.add(strokeKey);
  return true;
}

// Right-click on door edge: revert to plain wall (preserves the edge, removes door).
export function removeDoorAtEdge(ctx: PaintContext, edge: CellEdge, wallVariant: number): boolean {
  const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
  const { key, existing } = latticeEntry(ctx, canon);
  if (!existing || existing.type === "wall") return false;
  ctx.layers.walls[key] = latticeWall(canon.x, canon.y, canon.side, {
    pack_id: ctx.packId,
    pack_version: ctx.packVersion,
    type: "wall",
    variant: wallVariant,
  }, existing.visible);
  return true;
}

export function eraseWallAtCellEdge(ctx: PaintContext, edge: CellEdge, stroke: StrokeState): boolean {
  const dir = edgeDirection(edge.side);
  if (stroke.active) {
    if (stroke.direction === null) stroke.direction = dir;
    else if (stroke.direction !== dir) return false;
  }

  const { key, existing } = latticeEntry(ctx, canonicaliseEdge(edge.x, edge.y, edge.side));
  if (!existing) return false;
  const next = { ...ctx.layers.walls };
  delete next[key];
  ctx.layers.walls = next;
  return true;
}

/** Toggles an angled wall between wall and door (the Door tool on a wall that is not on a grid line). */
export function toggleAngledDoor(ctx: PaintContext, id: string, doorVariant: number): boolean {
  const existing = ctx.layers.walls[id];
  if (!existing || isLatticeKey(id)) return false;
  const type: EdgeSegType = existing.type === "doorClosed" || existing.type === "doorOpen" ? "wall" : "doorClosed";
  const variant = type === "doorClosed" ? doorVariant : existing.variant;
  ctx.layers.walls[id] = { ...existing, type, variant };
  return true;
}

/** Removes a wall by id, lattice or angled. */
export function removeWallById(ctx: PaintContext, id: string): boolean {
  if (!ctx.layers.walls[id]) return false;
  const next = { ...ctx.layers.walls };
  delete next[id];
  ctx.layers.walls = next;
  return true;
}

// ── Fill bucket ───────────────────────────────────────────────────────────────

type Barrier = readonly [Point, Point];

const centre = (x: number, y: number): Point => [x + 0.5, y + 0.5];

/**
 * The cells the Fill tool reaches from (cx, cy). It stops at every wall and door, lattice or angled; an angled wall counts as the
 * curve it is drawn along (`wallsAsPieces`), not its chord, so Fill does not leak through the bulge of a round wall.
 */
export function fillRegion(layers: DungeonMapLayers, cx: number, cy: number, maxCells: number): Set<CellKey> {
  const walls: Barrier[] = Object.entries(wallsAsPieces(layers.walls)).map(([id, wall]) => {
    const s = wallSegment(id, wall);
    return [s.a, s.b];
  });
  const crosses = (fx: number, fy: number, tx: number, ty: number): boolean => {
    const from = centre(fx, fy);
    const to = centre(tx, ty);
    return walls.some(([a, b]) => segmentsIntersect(from, to, a, b));
  };
  return floodFill(cx, cy, (x, y) => !layers.solidBlock[cellKey(x, y)], {
    maxCells,
    canStep: (fx, fy, tx, ty) => !crosses(fx, fy, tx, ty),
  });
}
