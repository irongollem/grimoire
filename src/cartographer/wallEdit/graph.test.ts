import { describe, expect, it } from "vitest";
import { buildGraph, runAt, type WallMap } from "./graph";
import { cachedWallGeometry } from "@/cartographer/wallGeometry";
import { angled, lattice, rect } from "./fixtures.test-helpers";

describe("runs", () => {
  it("a ten-square straight lattice wall is one bone with two nodes, not ten", () => {
    const walls: WallMap = {};
    lattice(walls, 0, 0, 10, 0);
    const g = buildGraph(walls);
    expect(g.runs).toHaveLength(1);
    expect([g.runs[0].a, g.runs[0].b]).toEqual(["0,0", "10,0"]);
    expect(g.runs[0].length).toBe(10);
  });

  it("a rectangle is four bones: a corner ends a run even though it has two segments", () => {
    expect(buildGraph(rect(0, 0, 4, 3)).runs.map((r) => r.id).sort()).toEqual(
      ["0,0>0,3", "0,0>4,0", "0,3>4,3", "4,0>4,3"],
    );
  });

  it("a T-junction ends the through-wall's run on both sides of it", () => {
    const walls: WallMap = {};
    lattice(walls, 0, 0, 4, 0);
    lattice(walls, 2, 0, 2, 3);
    expect(buildGraph(walls).runs.map((r) => r.id).sort()).toEqual(["0,0>2,0", "2,0>2,3", "2,0>4,0"]);
  });

  it("a door sits in its bone at its fraction of the length, in order with the walls around it", () => {
    const walls: WallMap = {};
    lattice(walls, 0, 0, 10, 0);
    walls["4,0:N"] = { ...walls["4,0:N"], type: "doorClosed" };
    const [run] = buildGraph(walls).runs;
    expect(run.segments).toHaveLength(10);
    const door = run.segments.find((s) => s.wall.type === "doorClosed")!;
    expect([door.t0, door.t1]).toEqual([0.4, 0.5]);
    const starts = run.segments.map((s) => s.t0);
    expect(starts).toEqual(starts.slice().sort((p, q) => p - q));
  });

  it("collinear angled segments through a degree-2 node are one bone, a bend is two", () => {
    const straight: WallMap = {};
    angled(straight, "u1", [0, 0], [1, 1]);
    angled(straight, "u2", [2, 2], [1, 1]);
    expect(buildGraph(straight).runs).toHaveLength(1);
    const bent: WallMap = {};
    angled(bent, "u1", [0, 0], [1, 1]);
    angled(bent, "u2", [1, 1], [2, 1]);
    expect(buildGraph(bent).runs).toHaveLength(2);
  });

  it("two segments that double back at a node are not one run", () => {
    const walls: WallMap = {};
    angled(walls, "u1", [0, 0], [2, 0]);
    angled(walls, "u2", [2, 0], [1, 0]);
    expect(buildGraph(walls).runs).toHaveLength(2);
  });

  it("a node the UI keeps ends the run there", () => {
    const walls: WallMap = {};
    lattice(walls, 0, 0, 4, 0);
    expect(buildGraph(walls, { breakAt: new Set(["2,0"]) }).runs.map((r) => r.id).sort()).toEqual(["0,0>2,0", "2,0>4,0"]);
  });
});

describe("runAt", () => {
  const g = buildGraph(rect(0, 0, 4, 3));
  it("finds the run under the point within tolerance, with where along it", () => {
    const hit = runAt(g, [1, 0.2], 0.25)!;
    expect(hit.run.id).toBe("0,0>4,0");
    expect(hit.t).toBe(0.25);
    expect(hit.foot).toEqual([1, 0]);
  });
  it("misses beyond tolerance", () => {
    expect(runAt(g, [2, 1.5], 0.25)).toBeUndefined();
  });
  it("picks the nearer of two runs near a corner", () => {
    expect(runAt(g, [0.1, 0.15], 0.25)!.run.id).toBe("0,0>0,3");
    expect(runAt(g, [0.15, 0.1], 0.25)!.run.id).toBe("0,0>4,0");
  });
});

describe("curved runs", () => {
  function bowed(): WallMap {
    const walls: WallMap = {};
    angled(walls, "p", [0, 0], [4, 0], { smoothB: true });
    angled(walls, "q", [4, 0], [4, 4], { smoothA: true });
    return walls;
  }

  it("a smooth node ends a run even where the two walls are in line", () => {
    const walls: WallMap = {};
    angled(walls, "h1", [0, 0], [2, 0], { smoothB: true });
    angled(walls, "h2", [2, 0], [4, 0], { smoothA: true });
    const g = buildGraph(walls);
    expect(g.runs).toHaveLength(2);
    expect(g.nodes.get("2,0")!.smooth).toBe(true);
  });

  it("a curved run is hit along its drawn curve and missed along its chord", () => {
    const walls = bowed();
    const g = buildGraph(walls);
    const path = cachedWallGeometry(walls).lines.get("q")!.path;
    const far = path.reduce((best, pt) => (pt[0] > best[0] ? pt : best));
    expect(far[0]).toBeGreaterThan(4.25);
    expect(runAt(g, far, 0.1)?.run.id).toBe("4,0>4,4");
    // On the chord, halfway down, nothing is drawn (the curve bows 0.3 away): a click there picks nothing.
    expect(runAt(g, [4, 2], 0.1)).toBeUndefined();
  });

  it("a straight run keeps no path, so a lattice wall is hit exactly as before", () => {
    const walls: WallMap = {};
    lattice(walls, 0, 0, 4, 0);
    const [run] = buildGraph(walls).runs;
    expect(run.path).toBeUndefined();
    expect(runAt(buildGraph(walls), [2, 0.05], 0.1)?.run.id).toBe(run.id);
  });
});
