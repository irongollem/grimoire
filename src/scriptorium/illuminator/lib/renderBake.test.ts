// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { bakeSize, BAKE_QUALITIES, MAX_BAKE_EDGE, renderBake } from "./renderBake";
import type { IlluminateSettings } from "./treatment";

// An edges step with every side off: the pipeline runs and changes nothing.
const off = { enabled: false, roughness: 0, fadeWidth: 0, tearDepth: 0, passes: 1, variation: 0 };
const recipe: IlluminateSettings = { v: 1, seed: 1, steps: [{ type: "edges", style: "classic", top: off, right: off, bottom: off, left: off }] };

function harness(natural: { width: number; height: number }, sizes: number[]) {
  const drawn: number[][] = [];
  const sources: number[][] = [];
  const made: number[][] = [];
  // The base is drawn with the source rectangle first (the crop), then where it lands.
  const ctx = {
    drawImage: (...a: number[]) => {
      if (a.length === 9) sources.push(a.slice(1, 5));
      drawn.push(a.slice(-2));
    },
  };
  const deps = {
    loadImage: vi.fn(async () => natural as unknown as HTMLImageElement),
    makeCanvas: (w: number, h: number) => {
      made.push([w, h]);
      return { width: w, height: h, getContext: () => ctx } as unknown as HTMLCanvasElement;
    },
    encode: vi.fn(async (_canvas: unknown, _quality: number) => new Blob([new Uint8Array(sizes.shift() ?? 0)], { type: "image/webp" })),
  };
  return { deps, drawn, made, sources };
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

  // Bug: the bake loaded the original, so the page and the player's copy lost the AI result.
  it("draws over the AI output when the recipe has one", async () => {
    const { deps } = harness({ width: 100, height: 100 }, [10]);
    const ai: IlluminateSettings = { v: 1, seed: 1, steps: [{ type: "ai", action: "ink", output: "ai.webp" }] };
    await renderBake("o.webp", ai, 100, deps);
    expect(deps.loadImage).toHaveBeenCalledWith("ai.webp");
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

describe("renderBake with a crop", () => {
  const cropped = (steps: IlluminateSettings["steps"]): IlluminateSettings => ({ v: 1, seed: 1, steps });

  // Fails on: the bake coming out at the whole picture's size, so a cropped picture prints a different shape than it shows.
  it("bakes the kept part at its own size", async () => {
    const { deps, made, drawn, sources } = harness({ width: 1000, height: 500 }, [10]);
    await renderBake("o.webp", cropped([{ type: "crop", x: 0.25, y: 0, w: 0.5, h: 1 }]), 100, deps);
    expect(made).toEqual([[500, 500]]);
    expect(sources).toEqual([[250, 0, 500, 500]]);
    expect(drawn).toEqual([[500, 500]]);
  });

  // Fails on: the long-edge cap being worked out before the crop, so a crop of a huge picture is shrunk for no reason.
  it("caps the long edge of the kept part, not of the whole picture", async () => {
    const { deps, made } = harness({ width: 8000, height: 4000 }, [10]);
    await renderBake("o.webp", cropped([{ type: "crop", x: 0, y: 0, w: 0.25, h: 0.5 }]), 100, deps);
    expect(made).toEqual([[2000, 2000]]);
  });

  // Fails on: steps after the crop working on the whole picture, so a mask lands in the wrong place on the cropped one.
  it("runs the other steps over the cropped canvas", async () => {
    const { deps, drawn } = harness({ width: 1000, height: 500 }, [10]);
    await renderBake("o.webp", cropped([{ type: "crop", x: 0, y: 0, w: 0.5, h: 1 }, { type: "mask", url: "m.webp" }]), 100, deps);
    // The base, then the mask: both fill the 500 by 500 canvas, not the 1000 by 500 picture.
    expect(drawn).toEqual([[500, 500], [500, 500]]);
  });
});
