import { describe, it, expect } from "vitest";
import { distanceToSegment, nearestAngledWall, nearestLight, snapPoint } from "./wallPick";
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
