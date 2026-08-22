import { describe, expect, it } from "vitest";

import { clusterByProximity, convexHull, hullPath, padOutward } from "./hull";

describe("convexHull", () => {
  it("drops points that sit inside the boundary", () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 }, // interior
    ]);

    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual({ x: 5, y: 5 });
  });

  // A faction of one or two is common, and both still have to draw — see
  // hullPath, which turns them into a disc and a capsule.
  it("returns degenerate inputs rather than rejecting them", () => {
    expect(convexHull([])).toEqual([]);
    expect(convexHull([{ x: 3, y: 4 }])).toEqual([{ x: 3, y: 4 }]);
    expect(convexHull([{ x: 0, y: 0 }, { x: 8, y: 0 }])).toHaveLength(2);
  });

  // Three-in-a-row has no area, so the chain halves cancel out. Without the
  // fallback this returns nothing and a whole faction silently stops drawing.
  it("survives collinear members", () => {
    const hull = convexHull([{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 }]);
    expect(hull.length).toBeGreaterThanOrEqual(2);
  });

  it("does not mutate its input", () => {
    const points = [{ x: 2, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 2 }];
    const snapshot = JSON.stringify(points);
    convexHull(points);
    expect(JSON.stringify(points)).toBe(snapshot);
  });
});

describe("padOutward", () => {
  it("grows the shape away from its centre", () => {
    const square = [
      { x: -10, y: -10 },
      { x: 10, y: -10 },
      { x: 10, y: 10 },
      { x: -10, y: 10 },
    ];
    const padded = padOutward(square, 5);

    for (let i = 0; i < square.length; i++) {
      expect(Math.hypot(padded[i].x, padded[i].y)).toBeGreaterThan(Math.hypot(square[i].x, square[i].y));
    }
  });

  // A lone member sits at its own centroid, so the outward direction is
  // undefined — dividing by that distance yields NaN and the path silently
  // stops rendering.
  it("leaves a single point where it is instead of producing NaN", () => {
    const padded = padOutward([{ x: 4, y: 7 }], 20);
    expect(padded).toEqual([{ x: 4, y: 7 }]);
  });

  it("handles an empty hull", () => {
    expect(padOutward([], 10)).toEqual([]);
  });
});

describe("hullPath", () => {
  it("closes a polygon", () => {
    const d = hullPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
    expect(d.startsWith("M 0 0")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });

  // A round line cap turns a zero-length line into a disc. Emitting nothing
  // here would make a one-member faction the one case that draws no hull.
  it("gives a lone point a zero-length line so a round cap draws it", () => {
    expect(hullPath([{ x: 3, y: 4 }])).toBe("M 3 4 L 3 4");
  });

  it("is empty for no points", () => {
    expect(hullPath([])).toBe("");
  });
});

describe("clusterByProximity", () => {
  it("keeps members who sit together in one shape", () => {
    const clusters = clusterByProximity(
      [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 0, y: 50 }],
      240,
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(3);
  });

  // The case measured on a real campaign: a faction spread across the map drew
  // one sliver spanning everything between its members.
  it("splits members who are nowhere near each other", () => {
    const clusters = clusterByProximity(
      [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 5000, y: 0 }, { x: 5040, y: 0 }],
      240,
    );
    expect(clusters).toHaveLength(2);
    expect(clusters.map((c) => c.length).sort()).toEqual([2, 2]);
  });

  // Single-linkage: a chain of neighbours stays one shape even though its ends
  // are far apart, because breaking it would mean choosing an arbitrary point.
  it("follows a chain of neighbours rather than fragmenting it", () => {
    const chain = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 400, y: 0 }, { x: 600, y: 0 }];
    expect(clusterByProximity(chain, 240)).toHaveLength(1);
  });

  it("gives a lone member its own cluster", () => {
    expect(clusterByProximity([{ x: 1, y: 1 }], 240)).toEqual([[{ x: 1, y: 1 }]]);
  });

  it("loses nobody", () => {
    const points = Array.from({ length: 12 }, (_, i) => ({ x: i * 500, y: i * 13 }));
    const total = clusterByProximity(points, 240).reduce((n, c) => n + c.length, 0);
    expect(total).toBe(points.length);
  });

  it("handles no members", () => {
    expect(clusterByProximity([], 240)).toEqual([]);
  });
});
