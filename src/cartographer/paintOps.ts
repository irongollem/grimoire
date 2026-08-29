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

import { cellKey, type DungeonMapLayers, type EdgeSeg, type EdgeSegType } from "@/types/dungeonMap.types";
import type { ObjectCategory } from "@/cartographer/packSchema";
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

export function paintCell(ctx: PaintContext, x: number, y: number, variant: number): boolean {
  const k = cellKey(x, y);
  const existing = ctx.layers.floor[k];
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

export function eraseCell(ctx: PaintContext, x: number, y: number): boolean {
  const k = cellKey(x, y);
  if (!ctx.layers.floor[k]) return false;
  const next = { ...ctx.layers.floor };
  delete next[k];
  ctx.layers.floor = next;
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

// ── Object stamp tool ────────────────────────────────────────────────────────

export function paintObjectAt(
  ctx: PaintContext,
  x: number,
  y: number,
  category: ObjectCategory,
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

// ── Wall placement (edge-based, NW ownership) ─────────────────────────────────

export function paintWallAtCellEdge(ctx: PaintContext, edge: CellEdge, stroke: StrokeState, variant: number): boolean {
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
  // Preserve doors. For walls, skip only if same pack — different pack restyling the edge.
  if (existing && (existing.type !== "wall" || existing.pack_id === ctx.packId)) {
    stroke.painted.add(strokeKey);
    return false;
  }

  const seg: EdgeSeg = {
    pack_id: ctx.packId,
    pack_version: ctx.packVersion,
    type: "wall",
    variant,
  };

  ctx.layers.floor[ownerKey] = canon.side === "N"
    ? { ...ownerCell, wallN: seg }
    : { ...ownerCell, wallW: seg };

  stroke.painted.add(strokeKey);
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
