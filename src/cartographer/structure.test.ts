import { describe, it, expect } from "vitest";
import { putWall } from "./testWalls";
import {
  deriveLinks,
  deriveSpaces,
  deriveStairs,
  deriveStructure,
  deriveWays,
  spaceContaining,
  structureDelta,
} from "./structure";
import { canonicalCells, cellSignature } from "./cellSignature";
import { canonicaliseEdge, type Side } from "./edges";
import { cellKey } from "@/types/dungeonMap.types";
import type { CellKey, CellMetadata, DungeonMapLayers, EdgeSegType, PackRef } from "@/types/dungeonMap.types";
import type { DerivedSpace, DerivedStructure, DerivedWay } from "./structure.types";
import type { PackCategory } from "./packSchema";

// ── Fixture builders — a DungeonMapLayers assembled cell by cell, mirroring
// how the editor itself writes these layers, rather than an ASCII plan: the
// interesting cases here turn on which of a cell's TWO edges (N/W keys in `layers.walls`)
// carries a segment and under whose ownership, which an ASCII grid would
// have to re-derive anyway. ─────────────────────────────────────────────

const PACK: PackRef = { pack_id: "p", pack_version: 1, variant: 0 };

function emptyLayers(): DungeonMapLayers {
  return { ground: {}, floor: {}, solidBlock: {}, terrain: {}, object: {}, annotation: {}, dressing: {}, walls: {}, lights: {} };
}

function addFloor(layers: DungeonMapLayers, x: number, y: number): void {
  const k = cellKey(x, y);
  layers.floor[k] = { ...layers.floor[k], floor: PACK };
}

function addEdge(layers: DungeonMapLayers, x: number, y: number, side: Side, type: EdgeSegType): void {
  const owner = canonicaliseEdge(x, y, side);
  putWall(layers, owner.x, owner.y, owner.side, { ...PACK, type });
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

  it("a grate edge splits two spaces and creates no way", () => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    addFloor(layers, 1, 0);
    addEdge(layers, 0, 0, "E", "grate");

    const spaces = deriveSpaces(layers);
    expect(spaces).toHaveLength(2);
    expect(deriveWays(layers, spaces)).toEqual([]);
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
    // W edge of (1,0): bottom to top, so the normal points east at the owner cell.
    expect(ways[0].segment).toEqual([
      [1, 1],
      [1, 0],
    ]);
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
  it("assembles spaces, ways, stairs and links from one map", () => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    addFloor(layers, 1, 0);
    addEdge(layers, 0, 0, "E", "doorClosed");
    addObject(layers, 1, 0, "stairsUp");
    addAnnotation(layers, 0, 0, "Antechamber");
    const metadata = { "1,0": metaFor({ trap_id: "t1" }) };

    const structure = deriveStructure({ layers, metadata });
    expect(structure.spaces).toHaveLength(2);
    expect(structure.ways).toHaveLength(1);
    expect(structure.stairs).toHaveLength(1);
    expect(structure.links).toHaveLength(1);
  });
});

// ── structureDelta ───────────────────────────────────────────────────────

function fakeSpace(cells: CellKey[]): DerivedSpace {
  const canon = canonicalCells(cells);
  return { key: `s:${canon[0]}`, cells: canon, signature: cellSignature(canon), outline: [[0, 0], [1, 0], [1, 1]], name: null, nameSource: null };
}

function fakeStructure(spaces: DerivedSpace[], ways: DerivedWay[] = []): DerivedStructure {
  return { spaces, ways, stairs: [], links: [] };
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
      segment: [
        [0, 0],
        [1, 0],
      ],
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

// #1125 story 5: an angled wall is a segment in `layers.walls`, and cuts the fill wherever it crosses the edge
// between two floor cells. A wall that only ends at a corner never splits cells it does not pass between.
describe("deriveSpaces with angled walls", () => {
  const strip = (): DungeonMapLayers => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    addFloor(layers, 1, 0);
    return layers;
  };
  const angled = (layers: DungeonMapLayers, id: string, a: [number, number], b: [number, number], type: EdgeSegType = "wall") => {
    layers.walls[id] = { ...PACK, type, a, b };
  };

  it("a slanted wall across the edge between two cells makes them two rooms", () => {
    const layers = strip();
    angled(layers, "slant", [0.6, -0.2], [1.4, 1.2]);
    expect(deriveSpaces(layers).map((s) => s.cells)).toEqual([["0,0"], ["1,0"]]);
  });

  it("a wall that only reaches the corner of the edge does not split the cells", () => {
    const layers = strip();
    angled(layers, "corner", [0, 2], [1, 1]);
    expect(deriveSpaces(layers)).toHaveLength(1);
  });

  it("a slanted wall that passes beside the edge leaves the room whole", () => {
    const layers = strip();
    angled(layers, "beside", [1.2, 0.2], [2, 0.8]);
    expect(deriveSpaces(layers)).toHaveLength(1);
  });

  it("an angled door cuts the fill like any other wall, since the fill cuts at every door", () => {
    const layers = strip();
    angled(layers, "door", [0.6, -0.2], [1.4, 1.2], "doorClosed");
    expect(deriveSpaces(layers)).toHaveLength(2);
  });

  it("a wall on the grid line splits the two cells whichever kind stores it", () => {
    const lattice = strip();
    addEdge(lattice, 0, 0, "E", "wall");
    const free = strip();
    angled(free, "free", [1, 0], [1, 1]);
    expect(deriveSpaces(lattice)).toHaveLength(2);
    expect(deriveSpaces(free)).toHaveLength(2);
  });

  // The door [0.6,-0.2]->[1.4,1.2]: d = (0.8,1.4), |d| = sqrt(2.6) = 1.6125, so n = (-dy,dx)/|d| = (-0.868, 0.496) and the
  // middle m is (1.0, 0.5). The `+` side m + 0.5n = (0.566, 0.748) is cell (0,0); the `-` side m - 0.5n = (1.434, 0.252)
  // is cell (1,0). So from is the room of (0,0) and to the room of (1,0).
  const DOOR_A: [number, number] = [0.6, -0.2];
  const DOOR_B: [number, number] = [1.4, 1.2];

  it("an angled door between two floored rooms is a way keyed by the wall id, from the + side to the - side", () => {
    const layers = strip();
    angled(layers, "door-uuid", DOOR_A, DOOR_B, "doorClosed");
    const spaces = deriveSpaces(layers);
    expect(spaces).toHaveLength(2);
    expect(deriveWays(layers, spaces)).toEqual([
      {
        edgeKey: "door-uuid",
        segment: [DOOR_A, DOOR_B],
        kind: "door",
        fromKey: spaceContaining("0,0", spaces)?.key,
        toKey: spaceContaining("1,0", spaces)?.key,
      },
    ]);
  });

  it("an open angled door is an arch", () => {
    const layers = strip();
    angled(layers, "door-uuid", DOOR_A, DOOR_B, "doorOpen");
    expect(deriveWays(layers, deriveSpaces(layers)).map((w) => w.kind)).toEqual(["arch"]);
  });

  it("an angled door inside one room (the rows below join both sides) is not a way", () => {
    // The wall ends at y = 1.2, inside the second row of floor, so the room wraps round it: one space, both samples in it.
    const layers = strip();
    addFloor(layers, 0, 1);
    addFloor(layers, 1, 1);
    angled(layers, "door-uuid", DOOR_A, DOOR_B, "doorClosed");
    const spaces = deriveSpaces(layers);
    expect(spaces).toHaveLength(1);
    expect(deriveWays(layers, spaces)).toEqual([]);
  });

  it("an angled door with floor on one side only leads nowhere and is not a way", () => {
    const layers = emptyLayers();
    addFloor(layers, 0, 0);
    angled(layers, "door-uuid", DOOR_A, DOOR_B, "doorClosed");
    expect(deriveWays(layers, deriveSpaces(layers))).toEqual([]);
  });

  it("an angled door with no floor either side is a way with no space keys", () => {
    const layers = emptyLayers();
    angled(layers, "door-uuid", DOOR_A, DOOR_B, "doorClosed");
    expect(deriveWays(layers, deriveSpaces(layers))).toEqual([
      { edgeKey: "door-uuid", segment: [DOOR_A, DOOR_B], kind: "door", fromKey: null, toKey: null },
    ]);
  });

  it("a grid door with no floor either side is a way with no space keys and its grid line", () => {
    const layers = emptyLayers();
    addEdge(layers, 0, 0, "E", "doorOpen");
    // E of (0,0) is the W edge of (1,0): [[1,1],[1,0]].
    expect(deriveWays(layers, deriveSpaces(layers))).toEqual([
      {
        edgeKey: "1,0:W",
        segment: [
          [1, 1],
          [1, 0],
        ],
        kind: "arch",
        fromKey: null,
        toKey: null,
      },
    ]);
  });

  it("orders ways by the middle of their line, not by the text of a uuid key", () => {
    // Middles: zzz (2.5, 0.5), 5,3:N (5.5, 3), aaa (9.5, 6.5). Reading order is zzz, 5,3:N, aaa; key text would give
    // 5,3:N, aaa, zzz.
    const layers = emptyLayers();
    angled(layers, "aaa", [9, 6], [10, 7], "doorClosed");
    addEdge(layers, 5, 3, "N", "doorClosed");
    angled(layers, "zzz", [2, 0], [3, 1], "doorClosed");
    expect(deriveWays(layers, []).map((w) => w.edgeKey)).toEqual(["zzz", "5,3:N", "aaa"]);
  });

  it("two ways with the same middle are ordered by key", () => {
    const layers = emptyLayers();
    angled(layers, "b", [0, 0], [2, 2], "doorClosed");
    angled(layers, "a", [0, 2], [2, 0], "doorClosed");
    expect(deriveWays(layers, []).map((w) => w.edgeKey)).toEqual(["a", "b"]);
  });
});
