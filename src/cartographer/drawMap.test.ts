import { describe, it, expect } from "vitest";
import { drawMapContent, type DrawMapInput } from "./drawMap";
import { emptyLayers, cellKey } from "@/types/dungeonMap.types";
import type { DressingCatalog } from "./dressing";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import { makeCtx, makeRuntime, sourceOf, type Recorder } from "./testCanvas";

const PACK = "p";

function input(
  rt: TilePackRuntime | null,
  overrides: Partial<DrawMapInput> = {},
): { input: DrawMapInput; rec: Recorder } {
  const { ctx, rec } = makeCtx();
  return {
    rec,
    input: {
      ctx,
      tilePx: 128,
      origin: { x: 0, y: 0 },
      bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
      layers: emptyLayers(),
      runtime: () => rt,
      defaultPackId: PACK,
      glyphs: {},
      glyphPackId: PACK,
      dressing: new Map(),
      ...overrides,
    },
  };
}

const ref = { pack_id: PACK, pack_version: 1, variant: 0 };

describe("drawMapContent", () => {
  it("translates cells by the origin", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(2, 3)] = { floor: ref };
    const { input: i, rec } = input(makeRuntime(PACK), { layers, origin: { x: 64, y: 0 } });
    drawMapContent(i);
    expect(rec.drawImages).toHaveLength(1);
    expect(rec.drawImages[0]).toMatchObject({ x: 192, y: 384, w: 128, h: 128 });
  });

  it("culls cells outside the bounds", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(2, 2)] = { floor: ref };
    layers.floor[cellKey(9, 9)] = { floor: ref };
    layers.object[cellKey(-3, 0)] = { pack_id: PACK, pack_version: 1, category: "chest", variant: 0 } as never;
    const { input: i, rec } = input(makeRuntime(PACK), { layers });
    drawMapContent(i);
    expect(rec.drawImages).toHaveLength(1);
  });

  it("skips a layer whose pack resolves to no runtime", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(1, 1)] = { floor: ref };
    const { input: i, rec } = input(null, { layers });
    drawMapContent(i);
    expect(rec.drawImages).toHaveLength(0);
  });

  it("draws layers in order and runs the hooks in their slots", () => {
    const layers = emptyLayers();
    layers.floor[cellKey(1, 1)] = { floor: ref, wallN: { ...ref, type: "wall" }, wallW: { ...ref, type: "wall" } };
    layers.object[cellKey(2, 2)] = { pack_id: PACK, pack_version: 1, category: "chest", variant: 0 } as never;
    layers.dressing.a = { prop_id: "table", x: 3, y: 3, rotation: 0, z: 0 };
    const catalog: DressingCatalog = new Map([
      ["table", { id: "table", name: "T", footprint_w: 1, footprint_h: 1, image: null, flat: false }],
    ]);
    const events: string[] = [];
    const { input: i, rec } = input(makeRuntime(PACK), {
      layers,
      dressing: catalog,
      glyphs: { [cellKey(4, 4)]: "trap" } as never,
      afterGround: () => events.push(`ground@${rec.drawImages.length}`),
      afterDressing: () => events.push(`dressing@${rec.drawImages.length}`),
    });
    drawMapContent(i);
    const cats = rec.drawImages.map((d) => sourceOf(d)?.category).filter(Boolean);
    const idx = (c: string): number => cats.indexOf(c as never);
    expect(idx("floor")).toBeLessThan(idx("wallSegmentH"));
    expect(idx("wallSegmentH")).toBeLessThan(idx("chest"));
    expect(idx("chest")).toBeLessThan(idx("trap"));
    // floor drawn before the ground hook, everything else after
    expect(events[0]).toBe("ground@1");
    expect(events[1]).toMatch(/^dressing@/);
    expect(idx("wallSegmentH")).toBeLessThan(idx("wallJoint"));
    expect(idx("wallJoint")).toBeLessThan(idx("chest"));
  });

  const lCorner = (): ReturnType<typeof emptyLayers> => {
    const layers = emptyLayers();
    layers.floor[cellKey(1, 1)] = { floor: ref, wallN: { ...ref, type: "wall" }, wallW: { ...ref, type: "wall" } };
    return layers;
  };

  it("draws a rounded corner only when the pack has real art for it", () => {
    const real = input(makeRuntime(PACK, { categoryCounts: { wallRoundJoint: 1 } }), { layers: lCorner() });
    drawMapContent(real.input);
    expect(real.rec.drawImages.some((d) => sourceOf(d).category === "wallRoundJoint")).toBe(true);

    const fake = input(makeRuntime(PACK, { categoryCounts: { wallRoundJoint: 1 }, placeholders: ["wallRoundJoint"] }), {
      layers: lCorner(),
    });
    drawMapContent(fake.input);
    expect(fake.rec.drawImages.some((d) => sourceOf(d).category === "wallRoundJoint")).toBe(false);

    const none = input(makeRuntime(PACK), { layers: lCorner() });
    drawMapContent(none.input);
    expect(none.rec.drawImages.some((d) => sourceOf(d).category === "wallRoundJoint")).toBe(false);
  });

  it("paints the joint fallback square in the pack palette", () => {
    const rt = makeRuntime(PACK, { placeholders: ["wallJoint"], palette: { wallJoint: [1, 2, 3] } });
    const { input: i, rec } = input(rt, { layers: lCorner() });
    drawMapContent(i);
    expect(rec.fillStyles).toContain("rgb(1,2,3)");
    expect(rec.fillStyles).not.toContain("rgb(40,36,32)");
  });

  it("draws joints that straddle the window border", () => {
    const layers = emptyLayers();
    // wall cell sits one cell outside the window; its joint is on the border
    layers.floor[cellKey(6, 6)] = { floor: ref, wallN: { ...ref, type: "wall" }, wallW: { ...ref, type: "wall" } };
    const { input: i, rec } = input(makeRuntime(PACK, { placeholders: ["wallJoint"] }), { layers });
    drawMapContent(i);
    expect(rec.fillRects).toHaveLength(1);
  });
});
