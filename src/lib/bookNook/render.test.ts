import { describe, expect, it, vi } from "vitest";
import { drawScene, frameImageKey, framedImages, FRAME_KEY, loadImages, type Images } from "./render.ts";
import { cameraAt, parallax, screenFit, type Scene } from "./scene.ts";

/** A canvas context that only writes down the transforms it is asked for. */
function recorder(width: number, height: number) {
  const calls: [string, ...number[]][] = [];
  const stub = (): unknown => new Proxy(() => stub(), { get: (_, key) => (key === "addColorStop" ? () => undefined : stub()) });
  const ctx = new Proxy({ canvas: { width, height } } as Record<string, unknown>, {
    get(target, key) {
      if (typeof key !== "string") return undefined;
      if (key in target) return target[key];
      if (key === "translate" || key === "scale") return (...args: number[]) => void calls.push([key, ...args]);
      return (...args: unknown[]) => (key.startsWith("create") ? stub() : args);
    },
    set: () => true,
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const scene: Scene = {
  id: "r",
  title: "R",
  size: { width: 1000, height: 2000 },
  loop: 12,
  camera: { drift: 0.012, push: 0.015 },
  grade: { tint: { color: [0, 0, 0], amount: 0 }, vignette: 0 },
  seed: 1,
  stack: [{ kind: "layer", id: "plate", src: "p.png", depth: 1.3, anchor: { x: 0.5, y: 0.5 }, at: { x: 500, y: 1000 }, width: 1000 }],
};
const images: Images = new Map([["plate", { naturalWidth: 500, naturalHeight: 1000 } as HTMLImageElement]]);

describe("drawScene", () => {
  // The promo films with no view; its transforms must be the ones it always drew with.
  it("without a view moves a layer as the camera and its depth say, about the frame's centre", () => {
    const { ctx, calls } = recorder(1000, 2000);
    drawScene(ctx, scene, images, 3);
    const p = parallax(cameraAt(scene, 3), 1.3);
    expect(calls.slice(0, 3)).toEqual([
      ["translate", 500 + p.dx, 1000 + p.dy],
      ["scale", p.scale, p.scale],
      ["translate", -500, -1000],
    ]);
  });

  it("through a window maps the window's centre to the canvas centre at the cover-fit scale", () => {
    const { ctx, calls } = recorder(800, 450);
    const view = { window: { x: 100, y: 200, w: 400, h: 225 }, breathe: 0 };
    drawScene(ctx, scene, images, 3, view);
    const fit = screenFit(scene, { width: 800, height: 450 }, view);
    expect(fit.scale).toBe(2);
    expect(calls.slice(0, 3)).toEqual([
      ["translate", 400, 225],
      ["scale", 2, 2],
      ["translate", -300, -312.5],
    ]);
  });
});

describe("framedImages", () => {
  const tall = { id: "tall" } as unknown as HTMLImageElement;
  const wide = { id: "wide" } as unknown as HTMLImageElement;
  const loaded: Images = new Map([["plate", wide], [frameImageKey("tall"), tall], [frameImageKey("wide"), wide]]);
  // Bug: the Atlas picture, which sits in a page, drew the frame as well.
  it("adds no frame for the Atlas", () => {
    expect(framedImages(loaded, null).has(FRAME_KEY)).toBe(false);
  });
  // Bug: the phone stage drew the wide shape stretched.
  it("picks the shape of the screen", () => {
    expect(framedImages(loaded, "tall").get(FRAME_KEY)).toBe(tall);
    expect(framedImages(loaded, "wide").get(FRAME_KEY)).toBe(wide);
  });
  it("leaves the map alone when that shape has not loaded", () => {
    expect(framedImages(new Map(), "tall").has(FRAME_KEY)).toBe(false);
  });
});

describe("loadImages", () => {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    crossOrigin = "";
    set src(v: string) { queueMicrotask(() => (v.includes("bad") ? this.onerror?.() : this.onload?.())); }
  }
  // Bug: a frame file that 404s dropped the whole nook to its still.
  it("plays without a frame that fails to load", async () => {
    vi.stubGlobal("Image", FakeImage);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const withFrame = { ...scene, frame: { wide: "bad-frame.webp" } };
    const out = await loadImages(withFrame, (s) => s, "wide");
    expect([...out.keys()]).toEqual(["plate"]);
    expect(warn).toHaveBeenCalledTimes(1);
    // A missing layer still fails the load.
    await expect(loadImages({ ...scene, stack: [{ ...scene.stack[0], src: "bad.png" } as never] }, (s) => s)).rejects.toThrow(/missing/);
    warn.mockRestore();
    vi.unstubAllGlobals();
  });
});
