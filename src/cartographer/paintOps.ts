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

import { cellKey, type CellKey, type DungeonMapLayers, type EdgeSeg, type EdgeSegType } from "@/types/dungeonMap.types";
import { nextDressingZ } from "@/cartographer/dressing";
import type { StampCategory } from "@/cartographer/stampCategories";
import { canonicaliseEdge, type CellEdge } from "@/cartographer/edges";

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

// Plain floor is a whole square, so painting it over a brushed cell drops the
// cell's coverage mask: otherwise the tile stays clipped to the old curve.
export function paintCell(ctx: PaintContext, x: number, y: number, variant: number): boolean {
  const k = cellKey(x, y);
  const existing = ctx.layers.floor[k];
  const hadArea = dropArea(ctx, k);
  if (existing?.floor?.pack_id === ctx.packId && existing?.floor?.variant === variant) return hadArea;
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

// A cell's terrain and brushed area go with the cell: water or a curved floor
// drawn where the floor is no longer there would be a ghost the walls, spaces
// and publish cannot see. A brushed cell under half covered has no floor at
// all, only its area entry, and is erased all the same.
export function eraseCell(ctx: PaintContext, x: number, y: number): boolean {
  const k = cellKey(x, y);
  const hadFloor = Boolean(ctx.layers.floor[k]);
  const hadTerrain = Boolean(ctx.layers.terrain[k]);
  const hadArea = dropArea(ctx, k);
  if (!hadFloor && !hadTerrain) return hadArea;
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

  const ownerKey = cellKey(canon.x, canon.y);
  const ownerCell = ctx.layers.floor[ownerKey] ?? {};
  const existing = canon.side === "N" ? ownerCell.wallN : ownerCell.wallW;
  if (existing && !mayOverwriteEdge(existing, kind, ctx.packId)) {
    stroke.painted.add(strokeKey);
    return false;
  }

  const seg: EdgeSeg = {
    pack_id: ctx.packId,
    pack_version: ctx.packVersion,
    type: kind,
    variant,
  };

  ctx.layers.floor[ownerKey] = canon.side === "N"
    ? { ...ownerCell, wallN: seg }
    : { ...ownerCell, wallW: seg };

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
  const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
  const ownerKey = cellKey(canon.x, canon.y);
  const ownerCell = ctx.layers.floor[ownerKey];
  if (!ownerCell) return false;
  const existing = canon.side === "N" ? ownerCell.wallN : ownerCell.wallW;
  if (!existing || existing.type !== "wall" || existing.decal === decal) return false;
  const { decal: _previous, ...rest } = existing;
  const seg: EdgeSeg = decal === undefined ? rest : { ...rest, decal };
  ctx.layers.floor[ownerKey] = canon.side === "N"
    ? { ...ownerCell, wallN: seg }
    : { ...ownerCell, wallW: seg };
  return true;
}

// Writes a wall edge directly, skipping stroke tracking. Used by wrap-walls,
// rectangle perimeter, and shift+click — operations that aren't "strokes".
export function setWallEdgeIfEmpty(ctx: PaintContext, edge: CellEdge, variant: number): boolean {
  const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
  const ownerKey = cellKey(canon.x, canon.y);
  const ownerCell = ctx.layers.floor[ownerKey] ?? {};
  const existing = canon.side === "N" ? ownerCell.wallN : ownerCell.wallW;
  if (existing) return false; // preserve existing walls/doors
  const seg: EdgeSeg = {
    pack_id: ctx.packId,
    pack_version: ctx.packVersion,
    type: "wall",
    variant,
  };
  ctx.layers.floor[ownerKey] = canon.side === "N"
    ? { ...ownerCell, wallN: seg }
    : { ...ownerCell, wallW: seg };
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

  const ownerKey = cellKey(canon.x, canon.y);
  const ownerCell = ctx.layers.floor[ownerKey] ?? {};
  const existing = canon.side === "N" ? ownerCell.wallN : ownerCell.wallW;

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

  const seg: EdgeSeg = { pack_id: ctx.packId, pack_version: ctx.packVersion, type: newType, variant };
  ctx.layers.floor[ownerKey] = canon.side === "N"
    ? { ...ownerCell, wallN: seg }
    : { ...ownerCell, wallW: seg };
  stroke.painted.add(strokeKey);
  return true;
}

// Right-click on door edge: revert to plain wall (preserves the edge, removes door).
export function removeDoorAtEdge(ctx: PaintContext, edge: CellEdge, wallVariant: number): boolean {
  const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
  const ownerKey = cellKey(canon.x, canon.y);
  const ownerCell = ctx.layers.floor[ownerKey];
  if (!ownerCell) return false;
  const existing = canon.side === "N" ? ownerCell.wallN : ownerCell.wallW;
  if (!existing || existing.type === "wall") return false;
  const seg: EdgeSeg = {
    pack_id: ctx.packId,
    pack_version: ctx.packVersion,
    type: "wall",
    variant: wallVariant,
  };
  ctx.layers.floor[ownerKey] = canon.side === "N"
    ? { ...ownerCell, wallN: seg }
    : { ...ownerCell, wallW: seg };
  return true;
}

export function eraseWallAtCellEdge(ctx: PaintContext, edge: CellEdge, stroke: StrokeState): boolean {
  const dir = edgeDirection(edge.side);
  if (stroke.active) {
    if (stroke.direction === null) stroke.direction = dir;
    else if (stroke.direction !== dir) return false;
  }

  const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
  const ownerKey = cellKey(canon.x, canon.y);
  const ownerCell = ctx.layers.floor[ownerKey];
  if (!ownerCell) return false;
  if (canon.side === "N" && !ownerCell.wallN) return false;
  if (canon.side === "W" && !ownerCell.wallW) return false;
  const next = { ...ownerCell };
  if (canon.side === "N") delete next.wallN;
  else delete next.wallW;
  // If the cell is now empty (no floor, no walls), drop it from the map.
  if (!next.floor && !next.wallN && !next.wallW) {
    const newFloor = { ...ctx.layers.floor };
    delete newFloor[ownerKey];
    ctx.layers.floor = newFloor;
  } else {
    ctx.layers.floor[ownerKey] = next;
  }
  return true;
}
