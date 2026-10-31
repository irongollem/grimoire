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

import { cellKey, type AreaCell, type CellKey, type DungeonMapLayers, type EdgeSeg, type EdgeSegType, type WallEdge } from "@/types/dungeonMap.types";
import { nextDressingZ } from "@/cartographer/dressing";
import type { StampCategory } from "@/cartographer/stampCategories";
import { canonicaliseEdge, type CanonicalEdge, type CellEdge } from "@/cartographer/edges";
import { latticeKey } from "@/lib/battlemap/walls";
import { isLatticeKey, latticeWall, wallSegment } from "@/cartographer/wallGraph";
import { cachedAreaLoops } from "@/cartographer/area";
import { floodFill } from "@/cartographer/floodFill";
import { segmentsIntersect, type Point } from "@/lib/battlemap/walls";

export interface PaintContext {
  layers: DungeonMapLayers;
  packId: string;
  packVersion: number;
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

// Painting over floor re-skins it: the cell keeps its shape and only its pack changes. A brushed cell keeps its
// coverage mask, so a curve stays a curve (and a sliver under half covered, which has no floor entry, stays a sliver);
// a plain cell stays a whole square. Dropping the mask here once turned every repainted cell of a rounded wall into a
// hard square that stuck out past the outline.
export function paintCell(ctx: PaintContext, x: number, y: number, variant: number): boolean {
  const k = cellKey(x, y);
  const existing = ctx.layers.floor[k];
  const brushed = ctx.layers.area[k];
  if (brushed) return reskinBrushedCell(ctx, k, brushed, variant);
  if (existing?.floor?.pack_id === ctx.packId && existing?.floor?.variant === variant) return false;
  ctx.layers.floor[k] = {
    ...existing,
    floor: {
      pack_id: ctx.packId,
      pack_version: ctx.packVersion,
      variant,
    },
  };
  return true;
}

function reskinBrushedCell(ctx: PaintContext, k: CellKey, brushed: AreaCell, variant: number): boolean {
  const pack = { pack_id: ctx.packId, pack_version: ctx.packVersion, variant };
  const floor = ctx.layers.floor[k];
  const areaSame = brushed.pack_id === pack.pack_id && brushed.variant === pack.variant;
  const floorSame = !floor?.floor || (floor.floor.pack_id === pack.pack_id && floor.floor.variant === pack.variant);
  if (areaSame && floorSame) return false;
  ctx.layers.area = { ...ctx.layers.area, [k]: { ...pack, mask: brushed.mask } };
  if (floor?.floor) ctx.layers.floor[k] = { ...floor, floor: pack };
  return true;
}

// A cell's terrain and brushed area go with the cell: water or a curved floor
// drawn where the floor is no longer there would be a ghost the walls, spaces
// and publish cannot see. A brushed cell under half covered has no floor at
// all, only its area entry, and is erased all the same.
export function eraseCell(ctx: PaintContext, x: number, y: number): boolean {
  const k = cellKey(x, y);
  const hadFloor = Boolean(ctx.layers.floor[k]);
  const hadTerrain = Boolean(ctx.layers.terrain[k]);
  const hadArea = dropArea(ctx, k);
  // The walls on the cell's own north and west edges go with it, as they did when they were stored on the cell.
  const ownedWalls = [latticeKey(x, y, "N"), latticeKey(x, y, "W")].filter((wallKey) => ctx.layers.walls[wallKey]);
  if (!hadFloor && !hadTerrain && ownedWalls.length === 0) return hadArea;
  if (ownedWalls.length > 0) {
    const nextWalls = { ...ctx.layers.walls };
    for (const wallKey of ownedWalls) delete nextWalls[wallKey];
    ctx.layers.walls = nextWalls;
  }
  if (hadFloor) {
    const next = { ...ctx.layers.floor };
    delete next[k];
    ctx.layers.floor = next;
  }
  if (hadTerrain) eraseTerrainAt(ctx, x, y);
  return true;
}

function dropArea(ctx: PaintContext, k: CellKey): boolean {
  if (!ctx.layers.area[k]) return false;
  const next = { ...ctx.layers.area };
  delete next[k];
  ctx.layers.area = next;
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
  let changed = false;
  if (floorVariant !== undefined && !ctx.layers.floor[k]?.floor) {
    changed = paintCell(ctx, x, y, floorVariant);
  }
  const existing = ctx.layers.terrain[k];
  if (existing?.pack_id === ctx.packId && existing.variant === variant) return changed;
  ctx.layers.terrain[k] = { pack_id: ctx.packId, pack_version: ctx.packVersion, variant };
  return true;
}

export function eraseTerrainAt(ctx: PaintContext, x: number, y: number): boolean {
  const k = cellKey(x, y);
  if (!ctx.layers.terrain[k]) return false;
  const next = { ...ctx.layers.terrain };
  delete next[k];
  ctx.layers.terrain = next;
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
  if (existing && !mayOverwriteEdge(existing, kind, ctx.packId)) {
    stroke.painted.add(strokeKey);
    return false;
  }

  ctx.layers.walls[key] = latticeWall(canon.x, canon.y, canon.side, {
    pack_id: ctx.packId,
    pack_version: ctx.packVersion,
    type: kind,
    variant,
  });

  stroke.painted.add(strokeKey);
  return true;
}

// Doors are never overwritten. A plain wall only restyles a wall of another
// pack; a grate or sluice replaces a wall (any pack) or the other opening,
// but not a copy of itself from the same pack.
function mayOverwriteEdge(existing: EdgeSeg, kind: PaintedWallKind, packId: string): boolean {
  if (existing.type === "doorClosed" || existing.type === "doorOpen") return false;
  if (kind === "wall") return existing.type === "wall" && existing.pack_id !== packId;
  return !(existing.type === kind && existing.pack_id === packId);
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
  });
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
  });
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
  });
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
 * The cells the Fill tool reaches from (cx, cy). It stops at every wall and door, lattice or angled, and at the
 * outline of the brushed area (the smoothed curve, not the lattice staircase around it). A cell the outline only
 * clips (a brushed sliver whose centre is outside the curve) is still part of the room it hugs, so brushed cells
 * beside the region join it unless a wall stands between; without them a rim of the old tile would be left behind.
 */
export function fillRegion(layers: DungeonMapLayers, cx: number, cy: number, maxCells: number): Set<CellKey> {
  const walls: Barrier[] = Object.entries(layers.walls).map(([id, wall]) => {
    const s = wallSegment(id, wall);
    return [s.a, s.b];
  });
  const outline: Barrier[] = [];
  for (const loop of cachedAreaLoops(layers)) {
    const n = loop.points.length;
    for (let i = 0; i < n; i++) outline.push([loop.points[i], loop.points[(i + 1) % n]]);
  }
  const crosses = (barriers: readonly Barrier[], fx: number, fy: number, tx: number, ty: number): boolean => {
    const from = centre(fx, fy);
    const to = centre(tx, ty);
    return barriers.some(([a, b]) => segmentsIntersect(from, to, a, b));
  };
  const region = floodFill(cx, cy, (x, y) => !layers.solidBlock[cellKey(x, y)], {
    maxCells,
    canStep: (fx, fy, tx, ty) => !crosses(walls, fx, fy, tx, ty) && !crosses(outline, fx, fy, tx, ty),
  });
  const queue = [...region];
  for (let key = queue.pop(); key !== undefined; key = queue.pop()) {
    const [x, y] = key.split(",").map(Number);
    for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
      const nk = cellKey(nx, ny);
      if (region.has(nk) || !layers.area[nk] || layers.solidBlock[nk] || crosses(walls, x, y, nx, ny)) continue;
      region.add(nk);
      queue.push(nk);
    }
  }
  return region;
}
