import { describe, it, expect } from "vitest";
import { distanceToSegment, isWallEnd, nearestAngledWall, nearestLight, snapPoint, snapRunPoint } from "./wallPick";
import type { WallEdge } from "@/types/dungeonMap.types";
import { cachedWallGeometry } from "./wallGeometry";

const wall = (a: [number, number], b: [number, number]): WallEdge => ({ pack_id: "p", pack_version: 1, variant: 0, type: "wall", a, b });

describe("snapPoint", () => {
  // #1125 story 5: an angled wall snaps to grid intersections and half-cells; Alt places freely.
  it("snaps to the nearest half cell", () => {
    expect(snapPoint([1.2, 2.8], false)).toEqual([1, 3]);
    expect(snapPoint([1.3, 2.6], false)).toEqual([1.5, 2.5]);
  });
  it("keeps the exact point when placing freely", () => {
    expect(snapPoint([1.23, 2.81], true)).toEqual([1.23, 2.81]);
  });
});

describe("distanceToSegment", () => {
  it("measures to the nearest point on the segment, and to an end past it", () => {
    expect(distanceToSegment([1, 1], [0, 0], [2, 0])).toBe(1);
    expect(distanceToSegment([4, 0], [0, 0], [2, 0])).toBe(2);
  });
  it("copes with a segment of no length", () => {
    expect(distanceToSegment([3, 4], [0, 0], [0, 0])).toBe(5);
  });
});

describe("nearestAngledWall", () => {
  const walls = { a: wall([0, 0], [4, 4]), b: wall([0, 4], [4, 0]), "1,1:N": wall([1, 1], [2, 1]) };

  it("picks the wall within 0.3 cells of the click", () => {
    expect(nearestAngledWall(walls, [1.15, 1])).toBe("a");
  });
  it("picks the nearer of two walls where they cross", () => {
    expect(nearestAngledWall(walls, [2.05, 2.15])).toBe("a");
  });
  it("picks nothing beyond 0.3 cells", () => {
    // 0.42 cells from the nearer diagonal.
    expect(nearestAngledWall(walls, [1, 1.6])).toBeNull();
  });
  it("leaves a wall on a grid line to the grid tools", () => {
    expect(nearestAngledWall({ "1,1:N": wall([1, 1], [2, 1]) }, [1.5, 1])).toBeNull();
  });
});

describe("nearestLight", () => {
  it("picks the closest light within reach and nothing past it", () => {
    const lights = {
      far: { x: 5, y: 5, light: { color: "#ffffff", bright: 5, dim: 5 } },
      near: { x: 2.5, y: 2, light: { color: "#ffffff", bright: 5, dim: 5 } },
    };
    expect(nearestLight(lights, [2.7, 2.1])).toBe("near");
    expect(nearestLight(lights, [3.5, 2])).toBeNull();
  });
});

describe("nearestAngledWall on a curved wall (#1125)", () => {
  it("picks the wall by the curve it is drawn on, not by its chord", () => {
    const walls = { p: { ...wall([0, 0], [4, 0]), smoothB: true as const }, q: { ...wall([4, 0], [4, 4]), smoothA: true as const } };
    const far = cachedWallGeometry(walls).lines.get("q")!.path.reduce((best, pt) => (pt[0] > best[0] ? pt : best));
    expect(far[0]).toBeGreaterThan(4.25);
    expect(nearestAngledWall(walls, far)).toBe("q");
    expect(nearestAngledWall(walls, [3.8, 2])).toBeNull() // 0.2 from the chord, 0.5 from the curve;
  });
});

describe("snapRunPoint (Trace the walls, frame 02)", () => {
  const walls = { w: wall([4, 4], [8, 4]) };
  // Three points placed, so the first can close the ring.
  const run: [number, number][] = [[0, 0], [3, 0], [3, 3]];

  it("prefers the run's own start over a wall end that is also within reach", () => {
    // Pointer (0.1, 0): 0.1 from the start (0,0) and 0.15 from the wall end at (0.2, 0): both in reach (0.25).
    const both = { w: wall([0.2, 0], [5, 5]) };
    expect(snapRunPoint([0.1, 0], false, run, both)).toEqual({ point: [0, 0], kind: "start" });
  });

  it("lands exactly on the run's start, not on the grid point near it", () => {
    // Start (0.2, 0.1) is off the half-cell grid; the grid point for the pointer (0.3, 0.2) would be (0.5, 0).
    expect(snapRunPoint([0.3, 0.2], false, [[0.2, 0.1], [3, 0], [3, 3]], {})).toEqual({ point: [0.2, 0.1], kind: "start" });
  });

  it("prefers a wall end over the half-cell grid", () => {
    // (4.2, 4.1) is 0.22 from the end (4,4); the half-cell grid would give (4, 4) too, so use an end off the grid.
    const off = { w: wall([4.2, 4.1], [8, 4]) };
    expect(snapRunPoint([4.3, 4.2], false, [], off)).toEqual({ point: [4.2, 4.1], kind: "wall-end" });
  });

  it("catches the b end of a wall as well as the a end", () => {
    expect(snapRunPoint([8.1, 4], false, [], walls)).toEqual({ point: [8, 4], kind: "wall-end" });
  });

  it("falls back to the half-cell grid when nothing is in reach", () => {
    expect(snapRunPoint([1.3, 2.6], false, [], walls)).toEqual({ point: [1.5, 2.5], kind: "grid" });
  });

  it("does not snap to a wall end beyond the reach", () => {
    // 0.3 from (4,4), past 0.25: the grid point (4.5, 4) is what it gets, not the wall end.
    expect(snapRunPoint([4.3, 4], false, [], walls)).toEqual({ point: [4.5, 4], kind: "grid" });
  });

  it("the start only counts once three points are placed", () => {
    expect(snapRunPoint([0.1, 0], false, [[0, 0], [3, 0]], {}).kind).toBe("grid");
    expect(snapRunPoint([0.1, 0], false, [[0, 0]], {}).kind).toBe("grid");
  });

  it("Alt snaps to nothing, not even a start or wall end in reach", () => {
    expect(snapRunPoint([0.1, 0.05], true, run, walls)).toEqual({ point: [0.1, 0.05], kind: "free" });
    expect(snapRunPoint([4.1, 4.05], true, [], walls)).toEqual({ point: [4.1, 4.05], kind: "free" });
  });

  it("is not fooled by a far wall end when picking the nearest of two in reach", () => {
    const two = { a: wall([4.2, 4], [9, 9]), b: wall([4.05, 4], [9, 8]) };
    expect(snapRunPoint([4, 4], false, [], two).point).toEqual([4.05, 4]);
  });
});

describe("isWallEnd", () => {
  it("is true for either end and false for a point along the wall", () => {
    const walls = { w: wall([1, 1], [5, 1]) };
    expect(isWallEnd(walls, [1, 1])).toBe(true);
    expect(isWallEnd(walls, [5, 1])).toBe(true);
    expect(isWallEnd(walls, [3, 1])).toBe(false);
  });
});
