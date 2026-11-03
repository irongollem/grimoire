import { describe, expect, it } from "vitest";
import type { WallMap } from "./wallEdit/graph";
import { angled, lattice } from "./wallEdit/fixtures.test-helpers";
import { cachedWallGeometry, computeWallGeometry, smoothNodeIds, wallIdOfPiece, wallsAsPieces } from "./wallGeometry";

/** An n-gon of angled walls around (cx, cy), every node smooth: a round room. */
function ring(n: number, radius: number, cx = 10, cy = 10): WallMap {
  const walls: WallMap = {};
  const at = (i: number): [number, number] => [
    Math.round((cx + radius * Math.cos((2 * Math.PI * i) / n)) * 1e6) / 1e6,
    Math.round((cy + radius * Math.sin((2 * Math.PI * i) / n)) * 1e6) / 1e6,
  ];
  for (let i = 0; i < n; i++) angled(walls, `w${i}`, at(i), at((i + 1) % n), { smoothA: true, smoothB: true });
  return walls;
}

describe("smooth nodes", () => {
  it("a node is smooth only where exactly two angled walls both ask for it", () => {
    const walls: WallMap = {};
    angled(walls, "p", [0, 0], [2, 1], { smoothB: true });
    angled(walls, "q", [2, 1], [4, 0], { smoothA: true });
    expect(smoothNodeIds(walls)).toEqual(new Set(["2,1"]));
    // A third wall on the node makes it a junction: a corner, whatever the flags say (even when all three ask).
    angled(walls, "r", [2, 1], [2, 4], { smoothA: true });
    expect(smoothNodeIds(walls).size).toBe(0);
  });

  it("one wall asking is not enough: the other side is a corner until it asks too", () => {
    const walls: WallMap = {};
    angled(walls, "p", [0, 0], [2, 1], { smoothB: true });
    angled(walls, "q", [2, 1], [4, 0]);
    expect(smoothNodeIds(walls).size).toBe(0);
  });

  it("a door end and a lattice wall end are corners even when the flags are set", () => {
    const door: WallMap = {};
    angled(door, "p", [0, 0], [2, 1], { smoothB: true });
    angled(door, "d", [2, 1], [4, 0], { smoothA: true, type: "doorClosed" });
    expect(smoothNodeIds(door).size).toBe(0);
    const grid: WallMap = {};
    lattice(grid, 2, 1, 4, 1);
    angled(grid, "p", [0, 0], [2, 1], { smoothB: true });
    expect(smoothNodeIds(grid).size).toBe(0);
  });
});

describe("wall geometry", () => {
  it("a wall with no smooth ends is its own chord, one piece named by the wall", () => {
    const walls: WallMap = {};
    angled(walls, "slant", [0, 0], [3, 1]);
    const line = computeWallGeometry(walls).lines.get("slant")!;
    expect(line.pieces).toEqual([{ id: "slant", wall: "slant", sub: 0, a: [0, 0], b: [3, 1] }]);
  });

  it("a radius-4 round room reads round: every sampled point lies within a twentieth of a cell of the circle", () => {
    const geometry = computeWallGeometry(ring(8, 4));
    let worst = 0;
    for (const line of geometry.lines.values()) {
      for (const p of line.pieces) worst = Math.max(worst, Math.abs(Math.hypot(p.a[0] - 10, p.a[1] - 10) - 4));
    }
    // The chords of an octagon sag 0.15 cells inside the circle (4 * (1 - cos 22.5deg)); the curve must stay well clear of that.
    expect(worst).toBeLessThan(0.05);
    expect(geometry.smooth.size).toBe(8);
  });

  it("the pieces join end to end and keep the wall's ends exactly, so nodes stay where they were put", () => {
    const walls = ring(6, 3);
    const line = computeWallGeometry(walls).lines.get("w2")!;
    expect(line.pieces[0].a).toEqual(walls.w2.a);
    expect(line.pieces[line.pieces.length - 1].b).toEqual(walls.w2.b);
    line.pieces.slice(1).forEach((p, i) => expect(p.a).toEqual(line.pieces[i].b));
  });

  it("every piece resolves to its wall by id, and the ids are unique", () => {
    const geometry = computeWallGeometry(ring(5, 3));
    const ids = [...geometry.lines.values()].flatMap((l) => l.pieces.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const [wall, line] of geometry.lines) for (const p of line.pieces) expect(wallIdOfPiece(p.id)).toBe(wall);
  });

  it("an open chain bends only through its smooth node: the far ends are corners and the walls end where they end", () => {
    const walls: WallMap = {};
    angled(walls, "p", [0, 0], [4, 0], { smoothB: true });
    angled(walls, "q", [4, 0], [4, 4], { smoothA: true });
    const geometry = computeWallGeometry(walls);
    const p = geometry.lines.get("p")!;
    // The curve cuts the sharp corner: some point of p's piece line is off the chord.
    expect(p.pieces.some((piece) => Math.abs(piece.b[1]) > 0.01)).toBe(true);
    expect(p.pieces[0].a).toEqual([0, 0]);
    expect(p.capStart).toBe(true);
    expect(p.capEnd).toBe(false);
    expect(geometry.lines.get("q")!.capEnd).toBe(true);
  });

  it("a chain entered by a wall's b end still lists that wall's pieces from a to b", () => {
    const walls: WallMap = {};
    angled(walls, "p", [0, 0], [4, 0], { smoothB: true });
    // q is stored backwards: its a end is the chain's far end.
    angled(walls, "q", [4, 4], [4, 0], { smoothB: true });
    const q = computeWallGeometry(walls).lines.get("q")!;
    expect(q.pieces[0].a).toEqual([4, 4]);
    expect(q.pieces[q.pieces.length - 1].b).toEqual([4, 0]);
  });

  it("wallsAsPieces turns a curved wall into plain walls, one per piece, and leaves straight and grid walls alone", () => {
    const walls = ring(4, 3);
    lattice(walls, 0, 0, 2, 0);
    const split = wallsAsPieces(walls);
    expect(split["0,0:N"]).toBe(walls["0,0:N"]);
    expect(Object.keys(split).length).toBeGreaterThan(Object.keys(walls).length);
    expect(Object.values(split).every((w) => w.smoothA === undefined && w.smoothB === undefined)).toBe(true);
  });
});

describe("cachedWallGeometry", () => {
  it("is rebuilt when a tool adds a wall to the same record in place", () => {
    const walls: WallMap = {};
    angled(walls, "p", [0, 0], [3, 1]);
    expect(cachedWallGeometry(walls).lines.size).toBe(1);
    angled(walls, "q", [3, 1], [6, 0]);
    expect(cachedWallGeometry(walls).lines.size).toBe(2);
  });
  it("is the same object while nothing changed", () => {
    const walls: WallMap = {};
    angled(walls, "p", [0, 0], [3, 1]);
    expect(cachedWallGeometry(walls)).toBe(cachedWallGeometry(walls));
  });
});
