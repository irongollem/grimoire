import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadImage } from "./loadImage";

const scratch = vi.hoisted(() => ({ reads: 0 }));
const painted = vi.hoisted(() => ({ strokes: 0 }));
vi.mock("../paint/engine/stroke", async (importActual) => {
  const actual = await importActual<typeof import("../paint/engine/stroke")>();
  return { ...actual, beginStroke: (...args: Parameters<typeof actual.beginStroke>) => { painted.strokes++; return actual.beginStroke(...args); } };
});
vi.mock("./scratch", () => ({
  makeScratchCanvas: () => ({}),
  scratchContext: () => ({
    drawImage: () => undefined,
    getImageData: () => {
      scratch.reads++;
      return { data: new Uint8ClampedArray(8 * 8 * 4).fill(200) };
    },
  }),
}));

import { applyPaperWash, washAssets, washLayers } from "./paperWash";
import type { WashStep } from "./treatment";

const step: WashStep = { type: "wash", from: "left", reach: 0.5, brush: 0.5, dry: 0.5, seed: 3 };
const image = { width: 8, height: 8 } as unknown as HTMLImageElement;
let loader: LoadImage;
const urls: string[] = [];

beforeEach(() => {
  urls.length = 0;
  scratch.reads = 0;
  loader = async (url) => {
    urls.push(url);
    return image;
  };
});

function fakeCtx(w: number, h: number) {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  let put = false;
  const ctx = { getImageData: () => ({ data }), putImageData: () => { put = true; } };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, data, wasPut: () => put };
}

describe("wash assets", () => {
  // Fails on: tips fetched again for every picture, so a print of twenty pictures downloads the brushes twenty times.
  it("loads the brush tips and grain once per loader across several washes", async () => {
    for (const seed of [1, 2, 3]) {
      const { ctx } = fakeCtx(60, 80);
      await applyPaperWash(ctx, 60, 80, { ...step, seed }, loader);
    }
    expect(urls.sort()).toEqual(["/assets/paintbox/grains/cold-press.webp", "/assets/paintbox/tips/dry-comb.webp", "/assets/paintbox/tips/flat-bristle.webp", "/assets/paintbox/tips/soft-round.webp"]);
    expect(scratch.reads).toBe(4);
  });

  // Fails on: one loader's cache serving another, so the Worker would use the main thread's decoded art.
  it("keeps a separate set per loader", async () => {
    const other: LoadImage = async () => image;
    expect(await washAssets(loader)).not.toBe(await washAssets(other));
  });

  // Fails on: a failed tip load cached forever, so one dropped request leaves every later wash broken.
  it("tries again after a failed load", async () => {
    let fail = true;
    const flaky: LoadImage = async () => {
      if (fail) throw new Error("offline");
      return image;
    };
    await expect(washAssets(flaky)).rejects.toThrow("offline");
    fail = false;
    await expect(washAssets(flaky)).resolves.toBeDefined();
  });

  // Fails on: the wash not erasing the picture where it is.
  it("erases the washed side of the canvas and leaves the far side", async () => {
    const w = 80, h = 100;
    const { ctx, data, wasPut } = fakeCtx(w, h);
    await applyPaperWash(ctx, w, h, step, loader);
    expect(wasPut()).toBe(true);
    expect(data[(60 * w + 3) * 4 + 3]).toBeLessThan(40);
    expect(data[(60 * w + w - 3) * 4 + 3]).toBe(255);
  });

  // Fails on: no memo, so every grade or edge slider move repaints the wash and freezes the live preview.
  it("paints a wash once for the same step, size and loader, and again when a wash field or the size changes", async () => {
    await washLayers(60, 80, step, loader);
    const once = painted.strokes;
    expect(once).toBeGreaterThan(0);
    await washLayers(60, 80, { ...step }, loader);
    expect(painted.strokes).toBe(once);
    await washLayers(60, 80, { ...step, reach: 0.4 }, loader);
    const afterReach = painted.strokes;
    expect(afterReach).toBeGreaterThan(once);
    await washLayers(70, 80, { ...step, reach: 0.4 }, loader);
    expect(painted.strokes).toBeGreaterThan(afterReach);
  });

  // Fails on: the memo keeping only one wash, so dragging back and forth between two settings repaints each time.
  it("remembers the last three washes", async () => {
    const seeds = [11, 12, 13];
    for (const seed of seeds) await washLayers(60, 80, { ...step, seed }, loader);
    const before = painted.strokes;
    for (const seed of seeds) await washLayers(60, 80, { ...step, seed }, loader);
    expect(painted.strokes).toBe(before);
  });

  // Fails on: a draft wash being served for the real one (or the reverse), so the bake would keep the preview's coarse mask.
  it("keeps draft and full washes apart, and the draft has the same composition", async () => {
    const full = await washLayers(1200, 800, step, loader);
    const draft = await washLayers(1200, 800, step, loader, { draft: true });
    expect(draft).not.toBe(full);
    const edge = (e: Uint8ClampedArray) => {
      let total = 0, rows = 0;
      for (let y = 320; y < 720; y += 4) { let x = 0; while (x < 1200 && e[y * 1200 + x] > 127) x++; total += x / 1200; rows++; }
      return total / rows;
    };
    expect(Math.abs(edge(draft.erase) - edge(full.erase))).toBeLessThan(0.05);
    // Two real washes above the draft's size: seconds of painting, more under a loaded full-suite run.
  }, 30_000);
});
