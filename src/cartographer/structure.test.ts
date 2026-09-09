import { describe, it, expect } from "vitest";
import {
  deriveLinks,
  deriveSpaces,
  deriveStairs,
  deriveStructure,
  deriveWays,
  deriveZones,
  spaceContaining,
  structureDelta,
} from "./structure";
import { canonicalCells, cellSignature } from "./cellSignature";
import { canonicaliseEdge, type Side } from "./edges";
import { cellKey } from "@/types/dungeonMap.types";
import type { CellKey, CellMetadata, DungeonMapLayers, EdgeSegType, PackRef } from "@/types/dungeonMap.types";
import type { DerivedSpace, DerivedStructure, DerivedWay } from "./structure.types";
import type { PackCategory } from "./packSchema";
import type { ZoneKind } from "@/types/locationMapRegion.types";

// ── Fixture builders — a DungeonMapLayers assembled cell by cell, mirroring
// how the editor itself writes these layers, rather than an ASCII plan: the
// interesting cases here turn on which of a cell's TWO edges (wallN/wallW)
// carries a segment and under whose ownership, which an ASCII grid would
// have to re-derive anyway. ─────────────────────────────────────────────

const PACK: PackRef = { pack_id: "p", pack_version: 1, variant: 0 };

function emptyLayers(): DungeonMapLayers {
  return { floor: {}, solidBlock: {}, object: {}, annotation: {}, zone: {} };
}

function addFloor(layers: DungeonMapLayers, x: number, y: number): void {
  const k = cellKey(x, y);
  layers.floor[k] = { ...layers.floor[k], floor: PACK };
}

function addEdge(layers: DungeonMapLayers, x: number, y: number, side: Side, type: EdgeSegType): void {
  const owner = canonicaliseEdge(x, y, side);
  const k = cellKey(owner.x, owner.y);
  const cell = layers.floor[k] ?? {};
  const seg = { ...PACK, type };
  layers.floor[k] = owner.side === "N" ? { ...cell, wallN: seg } : { ...cell, wallW: seg };
}

function addSolid(layers: DungeonMapLayers, x: number, y: number): void {
  layers.solidBlock[cellKey(x, y)] = { ...PACK };
}

function addAnnotation(layers: DungeonMapLayers, x: number, y: number, text: string): void {
  layers.annotation[cellKey(x, y)] = { text };
}

function addObject(layers: DungeonMapLayers, x: number, y: number, category: PackCategory): void {
  layers.object[cellKey(x, y)] = { ...PACK, category };
}

function addZone(
  layers: DungeonMapLayers,
  x: number,
  y: number,
  zoneId: string,
  kind: ZoneKind,
  label: string | null = null,
): void {
  layers.zone![cellKey(x, y)] = { zone_id: zoneId, kind, label };
}

function metaFor(fields: CellMetadata): CellMetadata {
  return fields;
}

// ── deriveSpaces ─────────────────────────────────────────────────────────

describe("deriveSpaces", () => {
  it("one open room: every connected floor cell forms one space", () => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    addFloor(layers, 1, 0);
    addFloor(layers, 0, 1);
    addFloor(layers, 1, 1);

    const spaces = deriveSpaces(layers);
    expect(spaces).toHaveLength(1);
    expect(spaces[0].cells).toEqual(["0,0", "1,0", "0,1", "1,1"]);
    expect(spaces[0].key).toBe("s:0,0");
    expect(spaces[0].signature).toBe(cellSignature(["0,0", "1,0", "0,1", "1,1"]));
  });

  it("two rooms split by a wall edge become two spaces", () => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    addFloor(layers, 1, 0);
    addEdge(layers, 0, 0, "E", "wall");

    const spaces = deriveSpaces(layers);
    expect(spaces).toHaveLength(2);
    expect(spaces.map((s) => s.cells)).toEqual([["0,0"], ["1,0"]]);
  });

  it("a closed door edge also cuts the fill into two spaces", () => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    addFloor(layers, 1, 0);
    addEdge(layers, 0, 0, "E", "doorClosed");

    const spaces = deriveSpaces(layers);
    expect(spaces).toHaveLength(2);
  });

  it("an open door edge (arch) also cuts the fill into two spaces", () => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    addFloor(layers, 1, 0);
    addEdge(layers, 0, 0, "E", "doorOpen");

    const spaces = deriveSpaces(layers);
    expect(spaces).toHaveLength(2);
  });

  it("a solid block splits a corridor into two spaces and is never itself a space cell", () => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    addFloor(layers, 1, 0);
    addFloor(layers, 2, 0);
    addSolid(layers, 1, 0);

    const spaces = deriveSpaces(layers);
    expect(spaces).toHaveLength(2);
    expect(spaces.map((s) => s.cells)).toEqual([["0,0"], ["2,0"]]);
    for (const space of spaces) expect(space.cells).not.toContain("1,0");
  });

  it("a diagonal-only touch does not connect two cells", () => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    addFloor(layers, 1, 1);

    const spaces = deriveSpaces(layers);
    expect(spaces).toHaveLength(2);
    expect(spaces.map((s) => s.cells)).toEqual([["0,0"], ["1,1"]]);
  });

  it("names a space from the first annotation with non-empty trimmed text inside it", () => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    addFloor(layers, 1, 0);
    addAnnotation(layers, 1, 0, "  Throne Room  ");

    const spaces = deriveSpaces(layers);
    expect(spaces).toHaveLength(1);
    expect(spaces[0].name).toBe("Throne Room");
    expect(spaces[0].nameSource).toBe("annotation");
  });

  it("ignores an annotation whose cell falls outside every space", () => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    addAnnotation(layers, 5, 5, "Nowhere");

    const spaces = deriveSpaces(layers);
    expect(spaces).toHaveLength(1);
    expect(spaces[0].name).toBeNull();
    expect(spaces[0].nameSource).toBeNull();
  });

  it("treats an annotation with only whitespace text as no name", () => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    addAnnotation(layers, 0, 0, "   ");

    const spaces = deriveSpaces(layers);
    expect(spaces[0].name).toBeNull();
  });

  it("a door edge that does not actually split anything (a loop) produces one space", () => {
    // 2x2 open block; a door sits on the (0,0)-(1,0) edge, but the two cells
    // are still joined by the (0,1)-(1,1) route, which carries no segment.
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    addFloor(layers, 1, 0);
    addFloor(layers, 0, 1);
    addFloor(layers, 1, 1);
    addEdge(layers, 0, 0, "E", "doorClosed");

    const spaces = deriveSpaces(layers);
    expect(spaces).toHaveLength(1);
    expect(spaces[0].cells).toHaveLength(4);
  });
});

// ── deriveWays ───────────────────────────────────────────────────────────

describe("deriveWays", () => {
  it("a closed door between two spaces is one way of kind door", () => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    addFloor(layers, 1, 0);
    addEdge(layers, 0, 0, "E", "doorClosed");
    const spaces = deriveSpaces(layers);

    const ways = deriveWays(layers, spaces);
    expect(ways).toHaveLength(1);
    expect(ways[0].edgeKey).toBe("1,0:W");
    expect(ways[0].kind).toBe("door");
    const fromSpace = spaceContaining("1,0", spaces);
    const toSpace = spaceContaining("0,0", spaces);
    expect(ways[0].fromKey).toBe(fromSpace?.key);
    expect(ways[0].toKey).toBe(toSpace?.key);
  });

  it("an open door between two spaces is one way of kind arch", () => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    addFloor(layers, 1, 0);
    addEdge(layers, 0, 0, "E", "doorOpen");
    const spaces = deriveSpaces(layers);

    const ways = deriveWays(layers, spaces);
    expect(ways).toHaveLength(1);
    expect(ways[0].kind).toBe("arch");
  });

  it("a door edge with floor on only one side produces no way", () => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    // (1,0) never gets addFloor — the door frame exists but leads to void.
    addEdge(layers, 0, 0, "E", "doorClosed");
    const spaces = deriveSpaces(layers);

    const ways = deriveWays(layers, spaces);
    expect(ways).toHaveLength(0);
  });

  it("a door that does not actually separate two spaces (a loop) produces no way", () => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    addFloor(layers, 1, 0);
    addFloor(layers, 0, 1);
    addFloor(layers, 1, 1);
    addEdge(layers, 0, 0, "E", "doorClosed");
    const spaces = deriveSpaces(layers);

    const ways = deriveWays(layers, spaces);
    expect(ways).toHaveLength(0);
  });

  it("a plain wall edge produces no way", () => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    addFloor(layers, 1, 0);
    addEdge(layers, 0, 0, "E", "wall");
    const spaces = deriveSpaces(layers);

    expect(deriveWays(layers, spaces)).toHaveLength(0);
  });

  it("sorts output by edgeKey regardless of insertion order", () => {
    const layers = emptyLayers();
    // Group at x=5 inserted first...
    addFloor(layers, 5, 0);
    addFloor(layers, 5, 1);
    addEdge(layers, 5, 1, "N", "doorClosed");
    // ...group at x=0 inserted second.
    addFloor(layers, 0, 0);
    addFloor(layers, 0, 1);
    addEdge(layers, 0, 1, "N", "doorClosed");

    const spaces = deriveSpaces(layers);
    const ways = deriveWays(layers, spaces);
    expect(ways.map((w) => w.edgeKey)).toEqual(["0,1:N", "5,1:N"]);
  });
});

// ── deriveStairs ─────────────────────────────────────────────────────────

describe("deriveStairs", () => {
  it("a stairsUp object inside a room resolves the containing space", () => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    addFloor(layers, 1, 0);
    addObject(layers, 1, 0, "stairsUp");
    const spaces = deriveSpaces(layers);

    const stairs = deriveStairs(layers, spaces);
    expect(stairs).toHaveLength(1);
    expect(stairs[0]).toEqual({ cellKey: "1,0", direction: "up", spaceKey: spaces[0].key });
  });

  it("a stairsDown object on a cell no space claims resolves to a null spaceKey", () => {
    const layers = emptyLayers();
    // No addFloor at all — the object sits over void.
    addObject(layers, 3, 3, "stairsDown");
    const spaces = deriveSpaces(layers);

    const stairs = deriveStairs(layers, spaces);
    expect(stairs).toEqual([{ cellKey: "3,3", direction: "down", spaceKey: null }]);
  });

  it("ignores non-stair object categories", () => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    addObject(layers, 0, 0, "objectChest");
    const spaces = deriveSpaces(layers);

    expect(deriveStairs(layers, spaces)).toHaveLength(0);
  });
});

// ── deriveZones ──────────────────────────────────────────────────────────

describe("deriveZones", () => {
  it("returns an empty array when the zone layer is absent", () => {
    const layers: DungeonMapLayers = { floor: {}, solidBlock: {}, object: {}, annotation: {} };
    expect(deriveZones(layers)).toEqual([]);
  });

  it("groups zone cells by zone_id, sorted by zoneId, taking kind/label from the group", () => {
    const layers = emptyLayers();
    addZone(layers, 5, 5, "water", "hazard", "Flooded nave");
    addZone(layers, 0, 0, "fire", "hazard", "Ash fall");
    addZone(layers, 1, 0, "fire", "hazard", "Ash fall");

    const zones = deriveZones(layers);
    expect(zones.map((z) => z.zoneId)).toEqual(["fire", "water"]);
    const fire = zones[0];
    expect(fire.cells).toEqual(["0,0", "1,0"]);
    expect(fire.kind).toBe("hazard");
    expect(fire.label).toBe("Ash fall");
    expect(fire.signature).toBe(cellSignature(["0,0", "1,0"]));
  });
});

// ── deriveLinks ──────────────────────────────────────────────────────────

describe("deriveLinks", () => {
  it("assigns a link to the space containing its cell", () => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    const spaces = deriveSpaces(layers);
    const metadata = { "0,0": metaFor({ trap_id: "t1" }) };

    const links = deriveLinks(metadata, spaces);
    expect(links).toEqual([{ cellKey: "0,0", spaceKey: spaces[0].key, metadata: metadata["0,0"] }]);
  });

  it("still publishes a link on a cell no space claims, with a null spaceKey", () => {
    const metadata = { "9,9": metaFor({ note_id: "n1" }) };
    const links = deriveLinks(metadata, []);
    expect(links).toEqual([{ cellKey: "9,9", spaceKey: null, metadata: metadata["9,9"] }]);
  });

  it("excludes a metadata entry with every field empty", () => {
    const metadata: Record<CellKey, CellMetadata> = {
      "0,0": {},
      "1,0": { npc_spawn_ids: [], monster_spawn_ids: [] },
    };
    expect(deriveLinks(metadata, [])).toEqual([]);
  });
});

// ── spaceContaining ──────────────────────────────────────────────────────

describe("spaceContaining", () => {
  it("returns null when no space holds the cell", () => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    const spaces = deriveSpaces(layers);
    expect(spaceContaining("9,9", spaces)).toBeNull();
  });
});

// ── deriveStructure ──────────────────────────────────────────────────────

describe("deriveStructure", () => {
  it("assembles spaces, ways, stairs, zones and links from one map", () => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    addFloor(layers, 1, 0);
    addEdge(layers, 0, 0, "E", "doorClosed");
    addObject(layers, 1, 0, "stairsUp");
    addAnnotation(layers, 0, 0, "Antechamber");
    addZone(layers, 0, 0, "gas", "hazard", "Poison gas");
    const metadata = { "1,0": metaFor({ trap_id: "t1" }) };

    const structure = deriveStructure({ layers, metadata });
    expect(structure.spaces).toHaveLength(2);
    expect(structure.ways).toHaveLength(1);
    expect(structure.stairs).toHaveLength(1);
    expect(structure.zones).toHaveLength(1);
    expect(structure.links).toHaveLength(1);
  });
});

// ── structureDelta ───────────────────────────────────────────────────────

function fakeSpace(cells: CellKey[]): DerivedSpace {
  const canon = canonicalCells(cells);
  return { key: `s:${canon[0]}`, cells: canon, signature: cellSignature(canon), name: null, nameSource: null };
}

function fakeStructure(spaces: DerivedSpace[], ways: DerivedWay[] = []): DerivedStructure {
  return { spaces, ways, stairs: [], zones: [], links: [] };
}

describe("structureDelta", () => {
  it("reports nothing when before and after are identical", () => {
    const room = fakeSpace(["0,0", "1,0"]);
    const before = fakeStructure([room]);
    const after = fakeStructure([fakeSpace(["0,0", "1,0"])]);

    expect(structureDelta(before, after)).toEqual({
      changedSpaces: 0,
      newSpaces: 0,
      goneSpaces: 0,
      newWays: 0,
      goneWays: 0,
    });
  });

  it("counts a space shifted enough to still overlap ≥50% as changed, not gone+new", () => {
    const beforeRoom = fakeSpace(["0,0", "1,0", "2,0", "0,1", "1,1", "2,1", "0,2", "1,2", "2,2"]);
    // Shifted one column right: 6 of 9 cells shared, Jaccard = 6/12 = 0.5.
    const afterRoom = fakeSpace(["1,0", "2,0", "3,0", "1,1", "2,1", "3,1", "1,2", "2,2", "3,2"]);

    const delta = structureDelta(fakeStructure([beforeRoom]), fakeStructure([afterRoom]));
    expect(delta.changedSpaces).toBe(1);
    expect(delta.goneSpaces).toBe(0);
    expect(delta.newSpaces).toBe(0);
  });

  it("counts a space with no ≥50% overlap match as gone", () => {
    const beforeRoom = fakeSpace(["0,0"]);
    const unrelatedAfter = fakeSpace(["50,50"]);

    const delta = structureDelta(fakeStructure([beforeRoom]), fakeStructure([unrelatedAfter]));
    expect(delta.goneSpaces).toBe(1);
    expect(delta.newSpaces).toBe(1);
    expect(delta.changedSpaces).toBe(0);
  });

  it("counts a genuinely new space (no before signature) as new", () => {
    const shared = fakeSpace(["0,0"]);
    const before = fakeStructure([shared]);
    const after = fakeStructure([fakeSpace(["0,0"]), fakeSpace(["9,9"])]);

    const delta = structureDelta(before, after);
    expect(delta.newSpaces).toBe(1);
    expect(delta.goneSpaces).toBe(0);
    expect(delta.changedSpaces).toBe(0);
  });

  it("counts ways that appeared and disappeared", () => {
    const way = (edgeKey: string): DerivedWay => ({
      edgeKey: edgeKey as DerivedWay["edgeKey"],
      kind: "door",
      fromKey: "s:a",
      toKey: "s:b",
    });
    const before = fakeStructure([], [way("0,0:N")]);
    const after = fakeStructure([], [way("0,0:N"), way("1,0:N")]);

    expect(structureDelta(before, fakeStructure([])).goneWays).toBe(1);
    expect(structureDelta(fakeStructure([]), after).newWays).toBe(2);
    expect(structureDelta(before, after).newWays).toBe(1);
    expect(structureDelta(before, after).goneWays).toBe(0);
  });
});
