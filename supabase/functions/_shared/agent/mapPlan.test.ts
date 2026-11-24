import { describe, expect, it } from "vitest";
import { cellSignature } from "../../../../src/cartographer/cellSignature.ts";
import { MAKE_MAP_TOOL, buildMap, parseMapPlan, type MapPlan } from "./mapPlan.ts";

// Coordinates: cell (x,y) has its top edge "x,y:N" and left edge "x,y:W" (src/lib/battlemap/walls.ts, epic #1125).
const room = (key: string, x: number, y: number, w: number, h: number) => ({ key, name: key.toUpperCase(), x, y, w, h });

function plan(rooms: ReturnType<typeof room>[], doors: unknown[] = [], extra: Record<string, unknown> = {}): unknown {
  return { name: "Test", cols: 10, rows: 10, light: "dim", rooms, doors, ...extra };
}

function parsed(input: unknown): MapPlan {
  const r = parseMapPlan(input);
  if (!r.ok) throw new Error(r.error);
  return r.plan;
}

describe("make_map tool", () => {
  it("is the narrator's make_map and takes no unknown fields", () => {
    expect(MAKE_MAP_TOOL.name).toBe("make_map");
    expect(MAKE_MAP_TOOL.inputSchema.additionalProperties).toBe(false);
  });
});

describe("buildMap geometry", () => {
  // Two 3x3 rooms side by side: A at x 0..2, B at x 3..5, both y 0..2.
  // Each perimeter is 3+3+3+3 = 12 edges; the 3 W edges at x=3 are A's right side and B's left side, so one wall:
  // 12 + 12 - 3 = 21 distinct edges.
  const twoRooms = [room("a", 0, 0, 3, 3), room("b", 3, 0, 3, 3)];

  it("counts a shared side once", () => {
    const built = buildMap(parsed(plan(twoRooms)));
    expect(Object.keys(built.layers.walls)).toHaveLength(21);
    expect(Object.keys(built.layers.walls)).toEqual(expect.arrayContaining(["3,0:W", "3,1:W", "3,2:W"]));
  });

  it("makes a door the middle edge of the shared side, instead of a wall rather than as well", () => {
    // Shared rows are 0,1,2: the middle is row 1, edge "3,1:W". 21 edges: 20 walls and that 1 door.
    const built = buildMap(parsed(plan(twoRooms, [{ from: "a", to: "b" }])));
    expect(built.layers.walls["3,1:W"].type).toBe("doorClosed");
    expect(built.layers.walls["3,0:W"].type).toBe("wall");
    expect(built.mapLive.walls).toHaveLength(20);
    expect(built.mapLive.doors).toHaveLength(1);
    expect(built.mapLive.walls.map((w) => w.id)).not.toContain("3,1:W");
    expect(built.doors).toEqual([{ from: "a", to: "b", edgeKey: "3,1:W" }]);
  });

  it("finds the shared side whichever room the door starts from", () => {
    const built = buildMap(parsed(plan(twoRooms, [{ from: "b", to: "a" }])));
    expect(built.doors[0].edgeKey).toBe("3,1:W");
  });

  it("finds a shared horizontal side, and only the stretch both rooms cover", () => {
    // A 4 wide (x 0..3, y 0..1), B 2 wide below it (x 2..3, y 1..2): shared columns 2,3 along y=2... A is 2 tall? use h=1.
    // A: x0..3,y0 (4x1). B: x2..3,y1 (2x1). A's bottom is y=1 = B's top. Shared columns 2 and 3: edges "2,1:N","3,1:N".
    // Even run of 2: the later one, "3,1:N".
    const built = buildMap(parsed(plan([room("a", 0, 0, 4, 1), room("b", 2, 1, 2, 1)], [{ from: "a", to: "b" }])));
    expect(built.doors[0].edgeKey).toBe("3,1:N");
    expect(built.layers.walls["2,1:N"].type).toBe("wall");
    expect(built.layers.walls["0,1:N"].type).toBe("wall");
  });

  it("puts an outside door in the middle of the room's chosen side", () => {
    // North side of a 3 wide room at x 0..2, y 0: edges 0,0:N 1,0:N 2,0:N, the middle is "1,0:N".
    const built = buildMap(parsed(plan([room("a", 0, 0, 3, 3)], [{ from: "a", to: "outside", side: "north" }])));
    expect(built.layers.walls["1,0:N"].type).toBe("doorClosed");
    expect(built.doors).toEqual([{ from: "a", to: null, edgeKey: "1,0:N" }]);
  });

  it("puts an east door on the room's right edge line, one past its last column", () => {
    // 3x3 at x 0..2: east side is the line x=3, rows 0..2, middle row 1: "3,1:W".
    const built = buildMap(parsed(plan([room("a", 0, 0, 3, 3)], [{ from: "a", to: "outside", side: "east" }])));
    expect(built.doors[0].edgeKey).toBe("3,1:W");
  });

  it("draws a 1 wide corridor with 2*(1+4) = 10 edges", () => {
    const built = buildMap(parsed(plan([room("c", 2, 0, 1, 4)])));
    expect(Object.keys(built.layers.walls)).toHaveLength(10);
    expect(built.rooms[0].cells).toEqual(["2,0", "2,1", "2,2", "2,3"]);
  });

  it("writes live walls and doors with the same ids as the drawing, with the walls invisible and tile-less", () => {
    const built = buildMap(parsed(plan(twoRooms, [{ from: "a", to: "b" }])));
    const live = [...built.mapLive.walls, ...built.mapLive.doors];
    expect(live.map((w) => w.id).sort()).toEqual(Object.keys(built.layers.walls).sort());
    for (const w of live) {
      const drawn = built.layers.walls[w.id];
      expect(drawn.a).toEqual(w.a);
      expect(drawn.b).toEqual(w.b);
      expect(drawn.visible).toBe(false);
      expect(drawn.pack_id).toBe("");
    }
    expect(built.mapLive.doors[0]).toMatchObject({ open: false, leaf: null });
    // "3,1:W" runs (3,1) to (3,2).
    expect(built.mapLive.doors[0]).toMatchObject({ a: [3, 1], b: [3, 2] });
  });

  it("gives each region its cells sorted and the shared signature", () => {
    const built = buildMap(parsed(plan([room("b", 3, 1, 2, 2)])));
    // 2x2 at (3,1): row 1 then row 2.
    expect(built.rooms[0].cells).toEqual(["3,1", "4,1", "3,2", "4,2"]);
    expect(built.rooms[0].signature).toBe(cellSignature(["4,2", "3,1", "3,2", "4,1"]));
  });

  it("carries light and the plain segments", () => {
    const built = buildMap(parsed(plan([room("a", 0, 0, 3, 3)], [{ from: "a", to: "outside", side: "north" }], { cols: 20, rows: 10, light: "dark" })));
    expect(built.darkness).toBe("dark");
    expect(built.mapLive.darkness).toBe("dark");
    expect(built.mapLive.version).toBe(3);
    expect(built.segments.rooms).toEqual([{ x: 0, y: 0, w: 3, h: 3 }]);
    // 12 perimeter edges, one of them the door.
    expect(built.segments.walls).toHaveLength(11);
    expect(built.segments.doors).toEqual([{ a: [1, 0], b: [2, 0] }]);
  });
});

describe("parseMapPlan refusals", () => {
  const err = (input: unknown): string => {
    const r = parseMapPlan(input);
    if (r.ok) throw new Error("expected a refusal");
    return r.error;
  };

  it("accepts a valid plan", () => {
    expect(parseMapPlan(plan([room("a", 0, 0, 3, 3)])).ok).toBe(true);
  });

  it("names a room that runs off the map, on every edge", () => {
    // 10 wide: x 8 + w 3 = 11 > 10.
    expect(err(plan([room("a", 8, 0, 3, 3)]))).toContain('Room "a"');
    expect(err(plan([room("a", 0, 8, 3, 3)]))).toContain('Room "a"');
    // Exactly touching the far edge is fine: 7 + 3 = 10.
    expect(parseMapPlan(plan([room("a", 7, 7, 3, 3)])).ok).toBe(true);
    expect(err(plan([room("a", -1, 0, 3, 3)]))).toContain('Room "a"');
  });

  it("names the two rooms that overlap, and lets rooms that only touch pass", () => {
    expect(err(plan([room("a", 0, 0, 3, 3), room("b", 2, 2, 3, 3)]))).toMatch(/"a" and "b" overlap/);
    expect(parseMapPlan(plan([room("a", 0, 0, 3, 3), room("b", 3, 0, 3, 3)])).ok).toBe(true);
    expect(parseMapPlan(plan([room("a", 0, 0, 3, 3), room("b", 0, 3, 3, 3)])).ok).toBe(true);
  });

  it("refuses duplicate keys, the reserved outside key and zero size", () => {
    expect(err(plan([room("a", 0, 0, 2, 2), room("a", 4, 4, 2, 2)]))).toContain("share the key");
    expect(err(plan([room("outside", 0, 0, 2, 2)]))).toContain("outside");
    expect(err(plan([room("a", 0, 0, 0, 2)]))).toContain("at least 1");
  });

  // #1271 review: two rooms of one name became one room holding two regions, the database refused it, and the place
  // was reported as already having a map. Names match without case, as `make_place_map` matches them.
  it("refuses two rooms of one name, whatever their case", () => {
    expect(err(plan([room("a", 0, 0, 2, 2), { ...room("b", 4, 4, 2, 2), name: "a " }]))).toContain('Two rooms are named "a "');
  });

  // #1271 review: "a" east to outside sat on the wall it shares with "b", and was built as a door leading nowhere.
  it("refuses a door outside on a wall another room shares, and allows one that faces out", () => {
    expect(err(plan([room("a", 0, 0, 3, 3), room("b", 3, 0, 3, 3)], [{ from: "a", to: "outside", side: "east" }]))).toContain('opens into "b"');
    expect(parseMapPlan(plan([room("a", 0, 0, 3, 3), room("b", 3, 0, 3, 3)], [{ from: "a", to: "outside", side: "west" }])).ok).toBe(true);
  });

  it("refuses a door between rooms that share no side, naming both", () => {
    // Diagonal neighbours meet at a corner only; a gap leaves them apart.
    expect(err(plan([room("a", 0, 0, 2, 2), room("b", 2, 2, 2, 2)], [{ from: "a", to: "b" }]))).toMatch(/"a" and "b".*share no side/);
    expect(err(plan([room("a", 0, 0, 2, 2), room("b", 3, 0, 2, 2)], [{ from: "a", to: "b" }]))).toContain("share no side");
  });

  it("refuses doors to unknown rooms, to oneself, and outside doors with no side", () => {
    const rooms = [room("a", 0, 0, 3, 3)];
    expect(err(plan(rooms, [{ from: "zz", to: "a" }]))).toContain('"zz"');
    expect(err(plan(rooms, [{ from: "a", to: "zz" }]))).toContain('"zz"');
    expect(err(plan(rooms, [{ from: "a", to: "a" }]))).toContain("itself");
    expect(err(plan(rooms, [{ from: "a", to: "outside" }]))).toContain("needs a side");
    expect(err(plan([room("a", 0, 0, 3, 3), room("b", 3, 0, 3, 3)], [{ from: "a", to: "b", side: "north" }]))).toContain("takes no side");
  });

  it("refuses two doors on one edge", () => {
    const two = [room("a", 0, 0, 3, 3), room("b", 3, 0, 3, 3)];
    expect(err(plan(two, [{ from: "a", to: "b" }, { from: "b", to: "a" }]))).toContain("same edge");
  });

  it("refuses bad sizes, light and counts", () => {
    const rooms = [room("a", 0, 0, 3, 3)];
    expect(err(plan(rooms, [], { cols: 5 }))).toContain("cols");
    expect(err(plan(rooms, [], { rows: 41 }))).toContain("rows");
    expect(err(plan(rooms, [], { cols: 6.5 }))).toContain("cols");
    expect(err(plan(rooms, [], { light: "bright" }))).toContain("light");
    expect(err(plan([]))).toContain("rooms");
    const many = Array.from({ length: 13 }, (_, i) => room(`r${i}`, i, 0, 1, 1));
    expect(err(plan(many, [], { cols: 20 }))).toContain("rooms");
    expect(err("nope")).toContain("object");
  });
});
