import { describe, it, expect } from "vitest";
import { emptyLayers } from "@/types/dungeonMap.types";
import { collectOcclusion, latticeOcclusionSegment } from "./mapOcclusion";
import { setGroundWalls } from "./groundRegions";
import { brushDisc } from "@/test/brushDisc";
import { putWall } from "./testWalls";
import { clearLine, occluders } from "@/lib/battlemap/occlusion";
import { cachedWallGeometry, wallIdOfPiece } from "./wallGeometry";

const REF = { pack_id: "p", pack_version: 1, variant: 0 };

describe("collectOcclusion reads layers.walls (#1125 story 5)", () => {
  it("shifts a lattice wall's id to the image cell's edge key, which is what door states name", () => {
    const layers = emptyLayers();
    putWall(layers, 5, 7, "N", { ...REF, type: "doorClosed" });
    const { doors } = collectOcclusion(layers, 2, 3);
    expect(doors).toEqual([{ id: "3,4:N", a: [3, 4], b: [4, 4], open: false }]);
  });

  it("keeps an angled wall's own id and shifts its end points by the origin", () => {
    const layers = emptyLayers();
    layers.walls.slant = { ...REF, type: "wall", a: [4, 5], b: [6, 8] };
    expect(collectOcclusion(layers, 2, 3).walls).toEqual([{ id: "slant", a: [2, 2], b: [4, 5] }]);
  });

  it("lets an angled wall block a light that a ray would otherwise reach", () => {
    const layers = emptyLayers();
    layers.walls.slant = { ...REF, type: "wall", a: [2, 0], b: [4, 4] };
    const blocked = occluders(collectOcclusion(layers, 0, 0));
    const open = occluders(collectOcclusion(emptyLayers(), 0, 0));
    // From (1, 2) to (5, 2) the ray crosses the slant at (3, 2); with nothing there it reaches.
    expect(clearLine(blocked, 1, 2, 5, 2)).toBe(false);
    expect(clearLine(open, 1, 2, 5, 2)).toBe(true);
  });

  it("still stops light at a wall marked invisible: it is hidden from the picture, not from the light", () => {
    const layers = emptyLayers();
    layers.walls.ghost = { ...REF, type: "wall", a: [3, 0], b: [3, 4], visible: false };
    expect(clearLine(occluders(collectOcclusion(layers, 0, 0)), 1, 2, 5, 2)).toBe(false);
  });

  it("treats an angled door like a lattice door: by drawn state, and a grate lets light through", () => {
    const layers = emptyLayers();
    layers.walls.d1 = { ...REF, type: "doorOpen", a: [0, 0], b: [2, 2] };
    layers.walls.g1 = { ...REF, type: "grate", a: [0, 2], b: [2, 0] };
    const { walls, doors } = collectOcclusion(layers, 0, 0);
    expect(doors).toEqual([{ id: "d1", a: [0, 0], b: [2, 2], open: true }]);
    expect(walls).toEqual([]);
  });

  it("names a lattice wall by the shifted edge key through latticeOcclusionSegment", () => {
    expect(latticeOcclusionSegment("5,7:W", 1, 1).id).toBe("4,6:W");
  });
});

describe("a round-brush room stops light at its drawn curve (#1125)", () => {
  const floor = brushDisc(emptyLayers(), { x: 5, y: 5, r: 3 }, REF);
  const room = setGroundWalls(floor, Object.keys(floor.ground)[0], "visible");
  const occ = occluders(collectOcclusion(room, 0, 0));
  const lit = (angle: number, r: number): boolean => clearLine(occ, 5, 5, 5 + Math.cos(angle) * r, 5 + Math.sin(angle) * r);

  it("lights nothing just beyond the curve, at any angle, including between lattice corners", () => {
    for (let k = 0; k < 48; k++) expect(lit((k / 48) * Math.PI * 2, 3.25)).toBe(false);
  });

  it("does not block early: a point just inside the curve stays lit", () => {
    for (let k = 0; k < 48; k++) expect(lit((k / 48) * Math.PI * 2, 2.6)).toBe(true);
  });

  it("blocks along the curve, not along lattice edges, with a few more pieces than the wall has nodes", () => {
    const { walls } = collectOcclusion(room, 0, 0);
    expect(walls.length).toBeGreaterThan(20);
    expect(walls.every((w) => !/^-?\d+,-?\d+:[NW]$/.test(w.id))).toBe(true);
  });
});

describe("collectOcclusion follows a curved wall (#1125, curved walls)", () => {
  /** A flat wall and a wall going down meet at (4,0); the node is smooth, so the corner is cut by a curve. */
  function corner(smooth: boolean) {
    const layers = emptyLayers();
    layers.walls.p = { ...REF, type: "wall", a: [0, 0], b: [4, 0], ...(smooth ? { smoothB: true as const } : {}) };
    layers.walls.q = { ...REF, type: "wall", a: [4, 0], b: [4, 4], ...(smooth ? { smoothA: true as const } : {}) };
    return layers;
  }

  it("blocks a ray that crosses the drawn curve where the chord is nowhere near", () => {
    const smooth = corner(true);
    // The drawn wall bows out of its chord x = 4; find where it bows furthest.
    const curve = cachedWallGeometry(smooth.walls).lines.get("q")!.path;
    const far = curve.reduce((best, pt) => (pt[0] > best[0] ? pt : best));
    expect(far[0]).toBeGreaterThan(4.2);
    // Start between the chord and the curve and look outwards: only the curve is in the way.
    const from = { x: 4 + (far[0] - 4) * 0.5, y: far[1] };
    const to = { x: far[0] + 1, y: far[1] };
    expect(clearLine(occluders(collectOcclusion(corner(false), 0, 0)), from.x, from.y, to.x, to.y)).toBe(true);
    expect(clearLine(occluders(collectOcclusion(smooth, 0, 0)), from.x, from.y, to.x, to.y)).toBe(false);
  });

  it("names each piece by its wall, so a piece resolves to the wall it came from", () => {
    const { walls } = collectOcclusion(corner(true), 0, 0);
    expect(walls.length).toBeGreaterThan(2);
    expect(new Set(walls.map((w) => wallIdOfPiece(w.id)))).toEqual(new Set(["p", "q"]));
    expect(new Set(walls.map((w) => w.id)).size).toBe(walls.length);
  });

  it("shifts every piece by the origin", () => {
    const here = collectOcclusion(corner(true), 0, 0).walls;
    const there = collectOcclusion(corner(true), 2, 3).walls;
    there.forEach((w, i) => {
      expect(w.a[0] + 2).toBeCloseTo(here[i].a[0]);
      expect(w.a[1] + 3).toBeCloseTo(here[i].a[1]);
    });
  });

  it("keeps a door one straight segment under its own id, even beside a curved wall", () => {
    const layers = corner(true);
    layers.walls.d = { ...REF, type: "doorClosed", a: [4, 4], b: [4, 6] };
    const { doors } = collectOcclusion(layers, 0, 0);
    expect(doors).toEqual([{ id: "d", a: [4, 4], b: [4, 6], open: false }]);
  });
});
