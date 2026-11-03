import { describe, expect, it } from "vitest";
import type { MapLive, MapLiveDoor } from "@/types/mapLive.types";
import { latticeSegment, type WallSegment } from "./walls";
import { clearLine, NO_DOOR_STATES, NO_OCCLUDERS, nudgedOrigins, occluders, occludersOf } from "./occlusion";

type Spec = { walls?: string[]; doors?: { edge: string; open: boolean }[]; solid?: string[] };
/** Lattice edge keys in, occluders out: the spec for grid walls is unchanged by the segment model. */
const build = (o: Spec) =>
  occluders({
    walls: (o.walls ?? []).map(latticeSegment),
    doors: (o.doors ?? []).map((d) => ({ ...latticeSegment(d.edge), open: d.open })),
    solid: o.solid ?? [],
  });

describe("clearLine", () => {
  it("is clear across an open room", () => {
    expect(clearLine(NO_OCCLUDERS, 0.5, 0.5, 9.5, 7.5)).toBe(true);
    expect(clearLine(build({ walls: ["50,50:W"] }), 0.5, 0.5, 9.5, 7.5)).toBe(true);
  });

  it("stops at a wall between the points, from either side", () => {
    const occ = build({ walls: ["5,0:W"] });
    expect(clearLine(occ, 2.5, 0.5, 8.5, 0.5)).toBe(false);
    expect(clearLine(occ, 8.5, 0.5, 2.5, 0.5)).toBe(false);
    expect(clearLine(occ, 2.5, 0.5, 4.5, 0.5)).toBe(true);
    // A horizontal wall, crossed on a slant.
    expect(clearLine(build({ walls: ["3,4:N"] }), 3.5, 1.5, 4.2, 6.5)).toBe(false);
  });

  it("stops at a closed door and passes an open one", () => {
    expect(clearLine(build({ doors: [{ edge: "5,0:W", open: false }] }), 2.5, 0.5, 8.5, 0.5)).toBe(false);
    expect(clearLine(build({ doors: [{ edge: "5,0:W", open: true }] }), 2.5, 0.5, 8.5, 0.5)).toBe(true);
  });

  it("stops at a solid cell, but not at the cell it starts in", () => {
    const occ = build({ solid: ["5,0"] });
    expect(clearLine(occ, 2.5, 0.5, 8.5, 0.5)).toBe(false);
    // A light set into rock shines out of it.
    expect(clearLine(occ, 5.5, 0.5, 8.5, 0.5)).toBe(true);
    expect(clearLine(occ, 5.5, 0.5, 2.5, 0.5)).toBe(true);
  });

  it("does not leak through the corner where two walls meet", () => {
    // Walls on the east side of (1,1) and the south side of (1,1): a diagonal from (1,1) to (2,2) passes their corner.
    const occ = build({ walls: ["2,1:W", "1,2:N"] });
    expect(clearLine(occ, 1.5, 1.5, 2.5, 2.5)).toBe(false);
    // One wall of the pair is enough: either way round the corner is blocked.
    expect(clearLine(build({ walls: ["2,1:W"] }), 1.5, 1.5, 2.5, 2.5)).toBe(false);
    expect(clearLine(build({ walls: ["1,2:N"] }), 1.5, 1.5, 2.5, 2.5)).toBe(false);
    // The other way along the diagonal; a wall that only touches the corner counts, one away from it does not.
    expect(clearLine(build({ walls: ["2,2:W"] }), 2.5, 2.5, 1.5, 1.5)).toBe(false);
    expect(clearLine(build({ walls: ["2,3:W"] }), 2.5, 2.5, 1.5, 1.5)).toBe(true);
    // The wall under the far cell's top edge meets the same corner.
    expect(clearLine(build({ walls: ["2,2:N"] }), 1.5, 1.5, 2.5, 2.5)).toBe(false);
  });

  it("does not slip diagonally past the corner of a solid block", () => {
    // From (1,1) to (2,2) through their shared corner; rock on either flank or on the target cell stops the line.
    for (const solid of ["2,1", "1,2", "2,2"]) {
      expect(clearLine(build({ solid: [solid] }), 1.5, 1.5, 2.5, 2.5)).toBe(false);
    }
    expect(clearLine(build({ solid: ["3,1"] }), 1.5, 1.5, 2.5, 2.5)).toBe(true);
  });

  it("blocks a point on the far side of a long wall", () => {
    const walls = Array.from({ length: 10 }, (_, i) => `${i},5:N`);
    const occ = build({ walls });
    expect(clearLine(occ, 4.5, 3.5, 4.5, 7.5)).toBe(false);
    expect(clearLine(occ, 0.5, 3.5, 9.5, 8.5)).toBe(false);
    // Round the end of it.
    expect(clearLine(occ, 10.5, 3.5, 10.5, 7.5)).toBe(true);
  });
});

describe("nudgedOrigins", () => {
  it("returns an ordinary point as itself", () => {
    expect(nudgedOrigins(3.5, 4.5)).toEqual([[3.5, 4.5]]);
  });

  it("gives a point on a vertical edge one origin on each face", () => {
    const [left, right] = nudgedOrigins(5, 2.5);
    expect(left[0]).toBeLessThan(5);
    expect(right[0]).toBeGreaterThan(5);
    expect(left[1]).toBe(2.5);
  });

  it("gives a point on a horizontal edge one origin on each face", () => {
    const [above, below] = nudgedOrigins(2.5, 5);
    expect(above[1]).toBeLessThan(5);
    expect(below[1]).toBeGreaterThan(5);
  });

  it("gives a grid corner its four cells", () => {
    expect(nudgedOrigins(5, 5)).toHaveLength(4);
  });

  it("lets a wall light shine on its own face and not through the wall", () => {
    const occ = build({ walls: ["5,2:W"] });
    const reach = (x: number) => nudgedOrigins(5, 2.5).map(([ox, oy]) => clearLine(occ, ox, oy, x, 2.5));
    // Both faces are lit from their own origin: the point on one side is reached by one origin only.
    expect(reach(3.5)).toEqual([true, false]);
    expect(reach(7.5)).toEqual([false, true]);
  });
});

describe("occludersOf with door states", () => {
  const liveDoor = (edge: string, open: boolean): MapLiveDoor => {
    const { id, a, b } = latticeSegment(edge);
    return { id, a: [a[0], a[1]], b: [b[0], b[1]], open, leaf: null };
  };
  const live: MapLive = {
    version: 3,
    darkness: "daylight",
    groups: [],
    lights: [],
    sprites: [],
    walls: [],
    doors: [
      liveDoor("5,0:W", false),
      liveDoor("5,3:W", true),
    ],
    solid: [],
  };

  it("lets a line through a closed door the DM opened", () => {
    expect(clearLine(occludersOf(live), 2.5, 0.5, 8.5, 0.5)).toBe(false);
    expect(clearLine(occludersOf(live, [{ id: "5,0:W", open: true }]), 2.5, 0.5, 8.5, 0.5)).toBe(true);
  });

  it("blocks a line at an open door the DM shut", () => {
    expect(clearLine(occludersOf(live), 2.5, 3.5, 8.5, 3.5)).toBe(true);
    expect(clearLine(occludersOf(live, [{ id: "5,3:W", open: false }]), 2.5, 3.5, 8.5, 3.5)).toBe(false);
  });

  it("returns the same object for the same snapshot and states", () => {
    const states = [{ id: "5,0:W", open: true }];
    expect(occludersOf(live, states)).toBe(occludersOf(live, states));
    expect(occludersOf(live)).toBe(occludersOf(live, NO_DOOR_STATES));
    expect(occludersOf(live, states)).not.toBe(occludersOf(live));
  });
});

describe("angled walls", () => {
  // #1125 decision 5: a wall is a segment, not a grid edge.
  const diagonal: WallSegment = { id: "d1", a: [2, 2], b: [6, 6] };
  const angled = (walls: WallSegment[]) => occluders({ walls, doors: [], solid: [] });

  it("blocks a ray crossing a diagonal wall and not one passing beside it", () => {
    const occ = angled([diagonal]);
    expect(clearLine(occ, 2.5, 5.5, 5.5, 2.5)).toBe(false);
    expect(clearLine(occ, 5.5, 2.5, 2.5, 5.5)).toBe(false);
    // Parallel to the wall, a cell off it; and past its far end.
    expect(clearLine(occ, 2.5, 3.5, 5.5, 6.5)).toBe(true);
    expect(clearLine(occ, 6.5, 8.5, 8.5, 6.5)).toBe(true);
  });

  it("passes through the gap between two angled walls", () => {
    const occ = angled([
      { id: "w1", a: [2, 2], b: [4, 4] },
      { id: "w2", a: [5, 5], b: [7, 7] },
    ]);
    // The ray crosses the diagonal line at (4.5, 4.5), in the gap.
    expect(clearLine(occ, 3, 6, 6, 3)).toBe(true);
    // Through the end of the first wall, at (4,4), is not a gap.
    expect(clearLine(occ, 2.5, 5.5, 5.5, 2.5)).toBe(false);
    // And through the middle of the first wall.
    expect(clearLine(occ, 2, 4, 4, 2)).toBe(false);
  });

  it("finds a long wall by the cells in the middle of it, not only its ends", () => {
    const occ = angled([{ id: "long", a: [0.5, 0.5], b: [30.5, 3.5] }]);
    expect(clearLine(occ, 15, 0, 15, 5)).toBe(false);
  });

  it("is clear with no walls and no rock, whatever the line", () => {
    expect(clearLine(angled([]), -40.3, 12.1, 90.7, -3.9)).toBe(true);
  });

  it("does not hide a target that sits exactly on a wall line", () => {
    // Old grid behaviour: a ray that only reaches the wall at its end is not stopped by it.
    expect(clearLine(build({ walls: ["5,0:W"] }), 2.5, 0.5, 5, 0.5)).toBe(true);
  });
});
