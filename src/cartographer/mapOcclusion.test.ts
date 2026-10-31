import { describe, it, expect } from "vitest";
import { emptyLayers } from "@/types/dungeonMap.types";
import { collectOcclusion, occlusionSegment } from "./mapOcclusion";
import { putWall } from "./testWalls";
import { clearLine, occluders } from "@/lib/battlemap/occlusion";

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

  it("names a lattice wall by the shifted edge key through occlusionSegment", () => {
    expect(occlusionSegment("5,7:W", { ...REF, type: "wall", a: [5, 7], b: [5, 8] }, 1, 1).id).toBe("4,6:W");
  });
});
