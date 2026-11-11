// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { bakeSize, BAKE_QUALITIES, MAX_BAKE_EDGE, renderBake } from "./renderBake";
import type { IlluminateSettings } from "./treatment";

// An edges step with every side off: the pipeline runs and changes nothing.
const off = { enabled: false, roughness: 0, fadeWidth: 0, tearDepth: 0, passes: 1, variation: 0 };
const recipe: IlluminateSettings = { v: 1, seed: 1, steps: [{ type: "edges", style: "classic", top: off, right: off, bottom: off, left: off }] };

function harness(natural: { width: number; height: number }, sizes: number[]) {
  const drawn: number[][] = [];
  const made: number[][] = [];
  const ctx = { drawImage: (_i: unknown, _x: number, _y: number, w: number, h: number) => drawn.push([w, h]) };
  const deps = {
    loadImage: vi.fn(async () => natural as unknown as HTMLImageElement),
    makeCanvas: (w: number, h: number) => {
      made.push([w, h]);
      return { width: w, height: h, getContext: () => ctx } as unknown as HTMLCanvasElement;
    },
    encode: vi.fn(async (_canvas: unknown, _quality: number) => new Blob([new Uint8Array(sizes.shift() ?? 0)], { type: "image/webp" })),
  };
  return { deps, drawn, made };
}

describe("bakeSize", () => {
  it("keeps a picture at its own size and caps the long edge, keeping the proportions", () => {
    expect(bakeSize({ width: 1000, height: 600 })).toEqual({ width: 1000, height: 600 });
    expect(bakeSize({ width: MAX_BAKE_EDGE * 2, height: MAX_BAKE_EDGE })).toEqual({ width: MAX_BAKE_EDGE, height: MAX_BAKE_EDGE / 2 });
  });
});

describe("renderBake", () => {
  it("draws the original at the baked size and returns the first encoding that fits", async () => {
    const { deps, drawn, made } = harness({ width: 6000, height: 3000 }, [10]);
    const blob = await renderBake("o.webp", recipe, 100, deps);
    expect(blob.size).toBe(10);
    expect(made).toEqual([[MAX_BAKE_EDGE, MAX_BAKE_EDGE / 2]]);
    expect(drawn).toEqual([[MAX_BAKE_EDGE, MAX_BAKE_EDGE / 2]]);
    expect(deps.encode).toHaveBeenCalledTimes(1);
  });

  it("steps the quality down until the WebP fits the storage limit", async () => {
    const { deps } = harness({ width: 100, height: 100 }, [500, 300, 90]);
    const blob = await renderBake("o.webp", recipe, 100, deps);
    expect(blob.size).toBe(90);
    expect(deps.encode.mock.calls.map((c) => c[1])).toEqual(BAKE_QUALITIES.slice(0, 3));
  });

  it("fails instead of storing a bake over the limit", async () => {
    const { deps } = harness({ width: 100, height: 100 }, [500, 500, 500, 500]);
    await expect(renderBake("o.webp", recipe, 100, deps)).rejects.toThrow(/too large/);
  });

  it("refuses a recipe with no steps, which has nothing to bake", async () => {
    const { deps } = harness({ width: 100, height: 100 }, [1]);
    await expect(renderBake("o.webp", { v: 1, seed: 1, steps: [] }, 100, deps)).rejects.toThrow(/Nothing to bake/);
    expect(deps.loadImage).not.toHaveBeenCalled();
  });
});
