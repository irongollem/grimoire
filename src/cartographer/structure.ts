// Deriving structure from a drawing (#868) — see structure.types.ts for the
// contract this file fills. The published Atlas never reads a `DungeonMap`
// directly; everything downstream of the Cartographer goes through the
// `DerivedStructure` this module computes, so "what does this drawing mean"
// has exactly one answer.
//
// A space is a face of the wall graph (`roomOutline.ts`), not a flood of squares:
// per the overseer decision on #868 EVERY wall cuts, doors included, so a door
// can sit "between two derived regions" at all. An open arch (`doorOpen`) still
// cuts; it becomes a `kind: "arch"` way out rather than a `kind: "door"` one,
// but the two rooms it joins stay two regions, exactly like a closed door would.
// The squares of a room are the ones whose middle falls inside its outline.

import type { CellKey, CellMetadata, DungeonMap, DungeonMapLayers } from "@/types/dungeonMap.types";
import { cellKey, parseCellKey } from "@/types/dungeonMap.types";
import type { SourceEdgeKey } from "@/types/locationDoor.types";
import { canonicalCells, cellSignature } from "./cellSignature";
import { findFaces } from "./roomOutline";
import { latticeWalls } from "./wallGraph";
import type { DerivedLink, DerivedSpace, DerivedStair, DerivedStructure, DerivedWay } from "./structure.types";

// ── Spaces ───────────────────────────────────────────────────────────────

function isOpenFloor(layers: DungeonMapLayers, x: number, y: number): boolean {
  const k = cellKey(x, y);
  if (layers.solidBlock[k]) return false;
  return layers.floor[k]?.floor !== undefined;
}

function nameFromAnnotation(
  annotation: DungeonMapLayers["annotation"],
  cells: readonly CellKey[],
): Pick<DerivedSpace, "name" | "nameSource"> {
  for (const cell of cells) {
    const text = annotation[cell]?.text;
    if (text === undefined) continue;
    const trimmed = text.trim();
    if (trimmed.length > 0) return { name: trimmed, nameSource: "annotation" };
  }
  return { name: null, nameSource: null };
}

/**
 * The rooms of a drawing: the faces of its wall graph that hold open floor (`roomOutline.ts`), each with the outline
 * that bounds it and the squares whose middle falls inside. Every wall of any type cuts, doors and arches included,
 * so a door can sit between two derived rooms.
 */
export function deriveSpaces(layers: DungeonMapLayers): DerivedSpace[] {
  return findFaces(layers)
    .map((face) => {
      const cells = canonicalCells(face.cells);
      return {
        key: `s:${cells[0]}`,
        cells,
        signature: cellSignature(cells),
        outline: face.outline,
        ...nameFromAnnotation(layers.annotation, cells),
      };
    })
    .sort((p, q) => {
      const [px, py] = parseCellKey(p.cells[0]);
      const [qx, qy] = parseCellKey(q.cells[0]);
      return py - qy || px - qx;
    });
}

export function spaceContaining(cell: CellKey, spaces: readonly DerivedSpace[]): DerivedSpace | null {
  for (const space of spaces) {
    if (space.cells.includes(cell)) return space;
  }
  return null;
}

function indexSpaces(spaces: readonly DerivedSpace[]): Map<CellKey, DerivedSpace> {
  const index = new Map<CellKey, DerivedSpace>();
  for (const space of spaces) {
    for (const cell of space.cells) index.set(cell, space);
  }
  return index;
}

// ── Ways ─────────────────────────────────────────────────────────────────

const DOOR_EDGE_KIND: Record<"doorClosed" | "doorOpen", "door" | "arch"> = {
  doorClosed: "door",
  doorOpen: "arch",
};

export function deriveWays(layers: DungeonMapLayers, spaces: readonly DerivedSpace[]): DerivedWay[] {
  const index = indexSpaces(spaces);
  const ways: DerivedWay[] = [];

  for (const entry of latticeWalls(layers)) {
    const { x, y, side, wall } = entry;
    const key = cellKey(x, y);
    if (wall.type !== "doorClosed" && wall.type !== "doorOpen") continue;

    const [ox, oy] = side === "N" ? [x, y - 1] : [x - 1, y];
    // A door edge with floor on only one side leads nowhere — not a way.
    if (!isOpenFloor(layers, x, y) || !isOpenFloor(layers, ox, oy)) continue;

    const fromSpace = index.get(key);
    const toSpace = index.get(cellKey(ox, oy));
    if (!fromSpace || !toSpace) continue;
    // The fill already cuts at every door edge, so two open-floor cells on
    // either side land in different spaces UNLESS another route already
    // joins them — in which case this door is internal, not a way out.
    if (fromSpace.key === toSpace.key) continue;

    ways.push({
      edgeKey: `${x},${y}:${side}` as SourceEdgeKey,
      kind: DOOR_EDGE_KIND[wall.type],
      fromKey: fromSpace.key,
      toKey: toSpace.key,
    });
  }

  return ways.sort((a, b) => (a.edgeKey < b.edgeKey ? -1 : a.edgeKey > b.edgeKey ? 1 : 0));
}

// ── Stairs ───────────────────────────────────────────────────────────────

const STAIR_DIRECTION: Record<"stairsUp" | "stairsDown", "up" | "down"> = {
  stairsUp: "up",
  stairsDown: "down",
};

export function deriveStairs(layers: DungeonMapLayers, spaces: readonly DerivedSpace[]): DerivedStair[] {
  const keys = canonicalCells(
    (Object.keys(layers.object) as CellKey[]).filter((k) => {
      const category = layers.object[k].category;
      return category === "stairsUp" || category === "stairsDown";
    }),
  );

  return keys.map((cellKey) => {
    const category = layers.object[cellKey].category as "stairsUp" | "stairsDown";
    return {
      cellKey,
      direction: STAIR_DIRECTION[category],
      spaceKey: spaceContaining(cellKey, spaces)?.key ?? null,
    };
  });
}

// ── Links ────────────────────────────────────────────────────────────────

function hasMetadata(m: CellMetadata): boolean {
  return (
    !!m.trap_id ||
    !!m.feature_id ||
    !!m.encounter_id ||
    !!m.note_id ||
    (m.npc_spawn_ids?.length ?? 0) > 0 ||
    (m.monster_spawn_ids?.length ?? 0) > 0
  );
}

export function deriveLinks(metadata: DungeonMap["metadata"], spaces: readonly DerivedSpace[]): DerivedLink[] {
  const cells = canonicalCells((Object.keys(metadata) as CellKey[]).filter((k) => hasMetadata(metadata[k])));
  return cells.map((cellKey) => ({
    cellKey,
    spaceKey: spaceContaining(cellKey, spaces)?.key ?? null,
    metadata: metadata[cellKey],
  }));
}

// ── Whole structure ──────────────────────────────────────────────────────

export function deriveStructure(map: Pick<DungeonMap, "layers" | "metadata">): DerivedStructure {
  const spaces = deriveSpaces(map.layers);
  const ways = deriveWays(map.layers, spaces);
  const stairs = deriveStairs(map.layers, spaces);
  const links = deriveLinks(map.metadata, spaces);
  return { spaces, ways, stairs, links };
}

// ── Delta, for the editor's status line ─────────────────────────────────

function jaccard(a: readonly CellKey[], b: readonly CellKey[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const cell of setA) if (setB.has(cell)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function structureDelta(
  before: DerivedStructure,
  after: DerivedStructure,
): { changedSpaces: number; newSpaces: number; goneSpaces: number; newWays: number; goneWays: number } {
  const beforeSigs = new Set(before.spaces.map((s) => s.signature));
  const afterSigs = new Set(after.spaces.map((s) => s.signature));
  const beforeOnly = before.spaces.filter((s) => !afterSigs.has(s.signature));
  const afterOnly = after.spaces.filter((s) => !beforeSigs.has(s.signature));

  // A gone signature that overlaps ≥50% (Jaccard) with an unmatched new
  // signature is the same room, moved — "changed", not "gone" + "new".
  const matchedAfterSigs = new Set<string>();
  let changedSpaces = 0;
  for (const b of beforeOnly) {
    let bestSig: string | null = null;
    let bestScore = 0;
    for (const a of afterOnly) {
      if (matchedAfterSigs.has(a.signature)) continue;
      const score = jaccard(b.cells, a.cells);
      if (score >= 0.5 && score > bestScore) {
        bestScore = score;
        bestSig = a.signature;
      }
    }
    if (bestSig !== null) {
      matchedAfterSigs.add(bestSig);
      changedSpaces++;
    }
  }

  const goneSpaces = beforeOnly.length - changedSpaces;
  const newSpaces = afterOnly.filter((a) => !matchedAfterSigs.has(a.signature)).length;

  const beforeEdgeKeys = new Set(before.ways.map((w) => w.edgeKey));
  const afterEdgeKeys = new Set(after.ways.map((w) => w.edgeKey));
  const newWays = after.ways.filter((w) => !beforeEdgeKeys.has(w.edgeKey)).length;
  const goneWays = before.ways.filter((w) => !afterEdgeKeys.has(w.edgeKey)).length;

  return { changedSpaces, newSpaces, goneSpaces, newWays, goneWays };
}
