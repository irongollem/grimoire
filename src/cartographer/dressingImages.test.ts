import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadImage: vi.fn() }));
vi.mock("./packLoader", () => ({ loadImage: mocks.loadImage }));

import { buildDressingCatalog, clearDressingImageCache, loadDressingImage } from "./dressingImages";
import type { LibraryDressing } from "@/types/dressing.types";

function row(id: string, w = 1, h = 1, image_url: string | null = null): LibraryDressing {
  return { id, name: id, group_key: "furniture", tags: [], footprint_w: w, footprint_h: h, image_url, source: "grimoire-dressing", flat: false, light: null, sway: null };
}

describe("loadDressingImage", () => {
  beforeEach(() => {
    clearDressingImageCache();
    mocks.loadImage.mockReset();
  });

  it("loads a url once and shares the result", async () => {
    const img = {} as HTMLImageElement;
    mocks.loadImage.mockResolvedValue(img);
    const [a, b] = await Promise.all([loadDressingImage("u"), loadDressingImage("u")]);
    expect(a).toBe(img);
    expect(b).toBe(img);
    expect(mocks.loadImage).toHaveBeenCalledTimes(1);
  });

  it("passes a failed load through as null", async () => {
    mocks.loadImage.mockResolvedValue(null);
    expect(await loadDressingImage("bad")).toBeNull();
  });

  it("tries a failed url again rather than caching the failure", async () => {
    const img = {} as HTMLImageElement;
    mocks.loadImage.mockResolvedValueOnce(null).mockResolvedValueOnce(img);
    expect(await loadDressingImage("flaky")).toBeNull();
    expect(await loadDressingImage("flaky")).toBe(img);
    expect(mocks.loadImage).toHaveBeenCalledTimes(2);
  });
});

describe("buildDressingCatalog", () => {
  it("maps rows to props, with null art where no image is loaded", () => {
    const img = {} as CanvasImageSource;
    const catalog = buildDressingCatalog([row("a", 2, 1, "https://cdn/a.webp"), row("b"), row("c", 1, 1, "https://cdn/c.webp")], new Map([["https://cdn/a.webp", img]]));
    expect(catalog.get("a")).toEqual({ id: "a", name: "a", footprint_w: 2, footprint_h: 1, image: img, flat: false, light: null, url: "https://cdn/a.webp", sway: null });
    expect(catalog.get("b")?.image).toBeNull();
    expect(catalog.get("c")?.image).toBeNull();
  });

  it("carries a prop's light through, and none as null", () => {
    const lantern = { color: "#ffb347", bright: 30, dim: 30, intensity: 0.7 };
    const catalog = buildDressingCatalog([{ ...row("lantern"), light: lantern }, row("plain")], new Map());
    expect(catalog.get("lantern")?.light).toEqual(lantern);
    expect(catalog.get("plain")?.light).toBeNull();
  });

  it("carries a prop's sway through, and none as null", () => {
    const sway = { amount: 3, speed: 1.2 };
    const catalog = buildDressingCatalog([{ ...row("palm", 1, 1, "https://cdn/p.webp"), sway }, row("plain")], new Map());
    expect(catalog.get("palm")?.sway).toEqual(sway);
    expect(catalog.get("plain")?.sway).toBeNull();
  });

  it("looks the art up by url, so a republished picture is not shadowed by the old one", () => {
    const old = {} as CanvasImageSource;
    const catalog = buildDressingCatalog([row("a", 1, 1, "https://cdn/a-v2.webp")], new Map([["https://cdn/a-v1.webp", old]]));
    expect(catalog.get("a")?.image).toBeNull();
  });
});
