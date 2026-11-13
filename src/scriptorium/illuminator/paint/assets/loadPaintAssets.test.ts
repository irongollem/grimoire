import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/assets/artUrl", () => ({ artUrl: (p: string) => `cdn:${p}` }));

import { grainFromPixels, loadPaintAssets, loadPaperSurface, tipFromPixels, type DecodedPixels } from "./loadPaintAssets";

const px = (w: number, h: number, rgba: number[]): DecodedPixels => ({ width: w, height: h, data: new Uint8ClampedArray(rgba) });

describe("loadPaintAssets", () => {
  const paths = { round: "/assets/t/round.webp" };
  const grainPaths = { rough: "/assets/g/rough.webp" };

  it("fetches every path through artUrl (fails if a raw build path reaches the decoder)", async () => {
    const decode = vi.fn(async (_url: string) => px(1, 1, [0, 0, 0, 255]));
    const store = loadPaintAssets({ decode, tipPaths: paths, grainPaths });
    await store.preloadStock();
    expect(decode.mock.calls.map((c) => c[0]).sort()).toEqual(["cdn:/assets/g/rough.webp", "cdn:/assets/t/round.webp"]);
  });

  it("fetches one id once however often and however concurrently it is asked for", async () => {
    const decode = vi.fn(async () => px(1, 1, [0, 0, 0, 255]));
    const store = loadPaintAssets({ decode, tipPaths: paths, grainPaths });
    await Promise.all([store.loadTip("round"), store.loadTip("round")]);
    await store.loadTip("round");
    await store.preloadStock();
    expect(decode).toHaveBeenCalledTimes(2); // the tip once, the grain once
  });

  it("answers tip() and grain() synchronously only after they loaded", async () => {
    const store = loadPaintAssets({ decode: async () => px(1, 1, [10, 20, 30, 200]), tipPaths: paths, grainPaths });
    expect(store.tip("round")).toBeUndefined();
    await store.loadTip("round");
    expect(store.tip("round")?.alpha[0]).toBe(200);
    expect(store.grain("rough")).toBeUndefined();
  });

  it("rejects an id it has no art for, and retries a failed fetch instead of caching the failure", async () => {
    const decode = vi.fn<() => Promise<DecodedPixels>>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(px(1, 1, [0, 0, 0, 9]));
    const store = loadPaintAssets({ decode, tipPaths: paths, grainPaths });
    await expect(store.loadTip("nope")).rejects.toThrow(/no tip art/);
    await expect(store.loadTip("round")).rejects.toThrow("offline");
    await expect(store.loadTip("round")).resolves.toBeDefined();
  });

  it("a tip's coverage is the alpha channel and a grain's height is luminance", () => {
    const pixels = px(2, 1, [255, 0, 0, 40, 255, 255, 255, 255]);
    expect([...tipFromPixels(pixels).alpha]).toEqual([40, 255]);
    expect([...grainFromPixels(pixels).value]).toEqual([54, 255]);
  });
});

describe("loadPaperSurface", () => {
  it("loads through artUrl and once per paper", async () => {
    const surface = { width: 4 } as unknown as ImageBitmap;
    const load = vi.fn(async () => surface);
    const paper = { id: "cold-press", surfacePath: "/assets/papers/cold-press.webp" };
    await Promise.all([loadPaperSurface(paper, load), loadPaperSurface(paper, load)]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith("cdn:/assets/papers/cold-press.webp");
  });
});
