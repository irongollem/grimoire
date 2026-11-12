import { describe, expect, it, vi } from "vitest";
import { loadPaintAssets } from "./loadPaintAssets";

const px = { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 200]) };

describe("a painter's own pictures in the asset store", () => {
  it("fetches an own tip from its absolute URL, not through the art path mapping", async () => {
    // Fails on: running a user's CDN URL through artUrl(), which would point the fetch somewhere else.
    const decode = vi.fn(async () => px);
    const store = loadPaintAssets({ decode });
    store.addUserTipUrl("user:r1:tip", "https://cdn.example/u1/brush-a.webp");
    const tip = await store.loadTip("user:r1:tip");
    expect(decode).toHaveBeenCalledWith("https://cdn.example/u1/brush-a.webp");
    expect(tip.alpha[0]).toBe(200);
    expect(store.tip("user:r1:tip")).toBe(tip);
  });

  it("serves a handed-over image at once, without fetching", async () => {
    // Fails on: a just-imported brush painting nothing until its upload has been read back.
    const decode = vi.fn(async () => px);
    const store = loadPaintAssets({ decode });
    const tip = { width: 1, height: 1, alpha: new Uint8Array([9]) };
    store.putTip("user:r2:tip", tip);
    expect(store.tip("user:r2:tip")).toBe(tip);
    await expect(store.loadTip("user:r2:tip")).resolves.toBe(tip);
    expect(decode).not.toHaveBeenCalled();
  });

  it("still refuses an id that has neither art nor a URL", async () => {
    await expect(loadPaintAssets({ decode: async () => px }).loadGrain("user:x:grain")).rejects.toThrow(/no grain art/);
  });
});
