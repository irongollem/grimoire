// Deriving structure from a drawing (#868) — see structure.types.ts for the
// contract this file fills. The published Atlas never reads a `DungeonMap`
// directly; everything downstream of the Cartographer goes through the
// `DerivedStructure` this module computes, so "what does this drawing mean"
// has exactly one answer.
//
// The flood fill here is deliberately NOT `floodFill.ts`'s: that helper's
// predicate is per-cell, so it cannot express "this edge is blocked". A
// space is defined by both cell membership (a floor tile, not a solid
// block) AND edge membership (no wall/door segment between neighbours) —
// per the overseer decision on #868, EVERY edge segment cuts the fill,
// doors included, so a door can sit "between two derived regions" at all.
// An open arch (`doorOpen`) still cuts the fill; it becomes a `kind: "arch"`
// way out rather than a `kind: "door"` one, but the two rooms it joins stay
// two regions, exactly like a closed door would.

import type { CellKey, CellMetadata, DungeonMap, DungeonMapLayers, EdgeSeg } from "@/types/dungeonMap.types";
import { cellKey, parseCellKey } from "@/types/dungeonMap.types";
import type { SourceEdgeKey } from "@/types/locationDoor.types";
import { canonicalCells, cellSignature } from "./cellSignature";
import { canonicaliseEdge, type Side } from "./edges";
import type { DerivedLink, DerivedSpace, DerivedStair, DerivedStructure, DerivedWay, DerivedZone } from "./structure.types";

// ── Spaces ───────────────────────────────────────────────────────────────

function isOpenFloor(layers: DungeonMapLayers, x: number, y: number): boolean {
  const k = cellKey(x, y);
  if (layers.solidBlock[k]) return false;
  return layers.floor[k]?.floor !== undefined;
}

/** The edge segment (of any type) between (x,y) and its neighbour on `side`,
 *  looked up on whichever cell owns it under NW ownership. */
function edgeSegAt(layers: DungeonMapLayers, x: number, y: number, side: Side): EdgeSeg | undefined {
  const owner = canonicaliseEdge(x, y, side);
  const cell = layers.floor[cellKey(owner.x, owner.y)];
  return owner.side === "N" ? cell?.wallN : cell?.wallW;
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

const NEIGHBOURS: readonly [dx: number, dy: number, side: Side][] = [
  [0, -1, "N"],
  [1, 0, "E"],
  [0, 1, "S"],
  [-1, 0, "W"],
];

export function deriveSpaces(layers: DungeonMapLayers): DerivedSpace[] {
  const visited = new Set<CellKey>();
  const spaces: DerivedSpace[] = [];

  // Canonical order of candidate starts makes the whole derivation
  // deterministic regardless of the object's own key insertion order (jsonb
  // does not promise to preserve it) — see `structure.types.ts` on that.
  const candidates = canonicalCells(
    (Object.keys(layers.floor) as CellKey[]).filter((k) => {
      const [x, y] = parseCellKey(k);
      return isOpenFloor(layers, x, y);
    }),
  );

  for (const start of candidates) {
    if (visited.has(start)) continue;

    const region = new Set<CellKey>([start]);
    visited.add(start);
    const queue: CellKey[] = [start];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const [x, y] = parseCellKey(current);
      for (const [dx, dy, side] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        const nk = cellKey(nx, ny);
        if (visited.has(nk)) continue;
        if (!isOpenFloor(layers, nx, ny)) continue;
        if (edgeSegAt(layers, x, y, side) !== undefined) continue;
        visited.add(nk);
        region.add(nk);
        queue.push(nk);
      }
    }

    const cells = canonicalCells(region);
    spaces.push({
      key: `s:${cells[0]}`,
      cells,
      signature: cellSignature(cells),
      ...nameFromAnnotation(layers.annotation, cells),
    });
  }

  return spaces;
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

  for (const key of Object.keys(layers.floor) as CellKey[]) {
    const [x, y] = parseCellKey(key);
    const cell = layers.floor[key];

    for (const side of ["N", "W"] as const) {
      const seg = side === "N" ? cell.wallN : cell.wallW;
      if (seg?.type !== "doorClosed" && seg?.type !== "doorOpen") continue;

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
        kind: DOOR_EDGE_KIND[seg.type],
        fromKey: fromSpace.key,
        toKey: toSpace.key,
      });
    }
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

// ── Zones ────────────────────────────────────────────────────────────────

export function deriveZones(layers: DungeonMapLayers): DerivedZone[] {
  const zoneLayer = layers.zone;
  if (!zoneLayer) return [];

  const byZoneId = new Map<string, CellKey[]>();
  for (const key of Object.keys(zoneLayer) as CellKey[]) {
    const zoneId = zoneLayer[key].zone_id;
    const cells = byZoneId.get(zoneId);
    if (cells) cells.push(key);
    else byZoneId.set(zoneId, [key]);
  }

  const zones: DerivedZone[] = [];
  for (const [zoneId, rawCells] of byZoneId) {
    const cells = canonicalCells(rawCells);
    // kind/label are repeated per cell by contract — any cell answers.
    const first = zoneLayer[cells[0]];
    zones.push({ zoneId, kind: first.kind, label: first.label, cells, signature: cellSignature(cells) });
  }

  return zones.sort((a, b) => (a.zoneId < b.zoneId ? -1 : a.zoneId > b.zoneId ? 1 : 0));
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
  const zones = deriveZones(map.layers);
  const links = deriveLinks(map.metadata, spaces);
  return { spaces, ways, stairs, zones, links };
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
