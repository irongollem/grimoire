import { describe, expect, it } from "vitest";
import { TiledLayer } from "../engine/tiledLayer";
import type { PaintLayer, PictureLayer } from "../session/types";
import { createCompositor, type Ctx, type Surface } from "./compositor";

interface Call {
  op: string;
  args: unknown[];
}

class FakeCtx implements Ctx {
  calls: Call[] = [];
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = "source-over";
  fillStyle: string | CanvasGradient | CanvasPattern = "";
  imageSmoothingEnabled = true;
  imageSmoothingQuality: ImageSmoothingQuality = "low";
  pixel = [0, 0, 0, 0];
  private rec(op: string) {
    return (...args: unknown[]) => {
      this.calls.push({ op, args });
    };
  }
  setTransform = this.rec("setTransform");
  clearRect = this.rec("clearRect");
  fillRect = this.rec("fillRect");
  putImageData = this.rec("putImageData");
  save = this.rec("save");
  restore = this.rec("restore");
  createImageData(w: number, h: number) {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }
  createPattern() {
    return { setTransform: (m: DOMMatrix2DInit) => this.calls.push({ op: "patternScale", args: [m.a, m.d] }) } as unknown as CanvasPattern;
  }
  getImageData(_x = 0, _y = 0, w = 1, h = 1) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) data.set(this.pixel, i * 4);
    return { width: w, height: h, data };
  }
  /** Records the blend and alpha in force, which is what a layer is drawn with. */
  drawImage(src: CanvasImageSource, ...rest: number[]) {
    this.calls.push({ op: "drawImage", args: [src, this.globalCompositeOperation, this.globalAlpha, ...rest] });
  }
}

interface FakeSurface extends Surface {
  fake: FakeCtx;
}

function harness(picture: CanvasImageSource | null = null) {
  const made: FakeSurface[] = [];
  const createCanvas = (): FakeSurface => {
    const ctx = new FakeCtx();
    const s: FakeSurface = { fake: ctx, ctx, drawable: {} as ImageBitmap };
    made.push(s);
    return s;
  };
  const comp = createCompositor({ width: 512, height: 300, picture, createCanvas });
  return { comp, made };
}

const puts = (made: FakeSurface[]) => made.reduce((n, s) => n + s.fake.calls.filter((c) => c.op === "putImageData").length, 0);

function paintLayer(id: string, over: Partial<PaintLayer> = {}): PaintLayer {
  return { kind: "paint", id, name: id, blend: "source-over", opacity: 1, visible: true, lockAlpha: false, pixels: new TiledLayer(512, 300), ...over };
}

function painted(layer: PaintLayer, keys: number[]): void {
  for (const k of keys) layer.pixels.ensureTile(k).fill(255);
}

const target = () => {
  const ctx = new FakeCtx();
  return { canvas: { width: 100, height: 100, getContext: () => ctx }, ctx };
};

describe("setPicture", () => {
  const pictureLayer = (): PictureLayer => ({ kind: "picture", id: "picture", name: "Picture", visible: true, mask: new TiledLayer(512, 300) });

  // Fails if a new picture is stored but the picture layer is not redrawn, so an edit under the paint never shows.
  it("redraws the picture layer from the new source on the next flush", () => {
    const { comp, made } = harness({} as CanvasImageSource);
    comp.syncLayers([pictureLayer()]);
    comp.flush();
    const next = { tag: "next" } as unknown as CanvasImageSource;
    const draws = () => made.flatMap((s) => s.fake.calls).filter((c) => c.op === "drawImage" && c.args[0] === next).length;
    comp.setPicture(next);
    expect(draws()).toBe(1);
    const before = made.reduce((n, s) => n + s.fake.calls.filter((c) => c.op === "clearRect").length, 0);
    comp.flush();
    const after = made.reduce((n, s) => n + s.fake.calls.filter((c) => c.op === "clearRect").length, 0);
    expect(after).toBeGreaterThan(before);
  });
});

describe("compositor uploads", () => {
  it("uploads only the tiles it is told are dirty (fails if a stroke frame re-uploads the whole layer)", () => {
    const { comp, made } = harness();
    const layer = paintLayer("a");
    painted(layer, [0, 1, 2, 3]);
    comp.syncLayers([layer]);
    comp.flush();
    const afterSync = puts(made);
    expect(afterSync).toBe(4);
    comp.markDirty("a", [2]);
    comp.markDirty("a", [2, 3]);
    comp.flush();
    expect(puts(made) - afterSync).toBe(2);
  });

  it("uploads each dirty tile once per flush however often it was marked, and nothing when nothing is dirty", () => {
    const { comp, made } = harness();
    const layer = paintLayer("a");
    painted(layer, [0]);
    comp.syncLayers([layer]);
    comp.flush();
    const base = puts(made);
    for (let i = 0; i < 5; i++) comp.markDirty("a", [0]);
    comp.flush();
    comp.flush();
    expect(puts(made) - base).toBe(1);
  });

  it("a tile that has become empty is cleared, not left showing its old paint", () => {
    const { comp, made } = harness();
    const layer = paintLayer("a");
    painted(layer, [0]);
    comp.syncLayers([layer]);
    comp.flush();
    layer.pixels.setTile(0, null);
    comp.markDirty("a", [0]);
    const ctx = made[0].fake;
    ctx.calls.length = 0;
    comp.flush();
    expect(ctx.calls.filter((c) => c.op === "clearRect").length).toBeGreaterThan(0);
    expect(ctx.calls.some((c) => c.op === "putImageData")).toBe(false);
  });

  it("crops an edge tile to the layer instead of putting a full-stride tile off the canvas", () => {
    const { comp, made } = harness();
    const layer = paintLayer("a");
    painted(layer, [layer.pixels.key(1, 1)]);
    comp.syncLayers([layer]);
    comp.flush();
    const call = made[0].fake.calls.find((c) => c.op === "putImageData");
    const img = call?.args[0] as { width: number; height: number };
    expect([img.width, img.height]).toEqual([256, 44]);
  });
});

describe("compositor render", () => {
  it("draws layers bottom to top with their blend and opacity, and skips hidden ones", () => {
    const { comp, made } = harness();
    const a = paintLayer("a");
    const b = paintLayer("b", { blend: "multiply", opacity: 0.4 });
    const hidden = paintLayer("c", { visible: false });
    comp.syncLayers([a, b, hidden]);
    const t = target();
    comp.render(t.canvas, { scale: 1, offsetX: 0, offsetY: 0 }, 1);
    const draws = t.ctx.calls.filter((c) => c.op === "drawImage");
    expect(draws).toHaveLength(2);
    expect(draws[0].args[0]).toBe(made[0].drawable);
    expect(draws[1].args[0]).toBe(made[1].drawable);
    expect(draws[1].args.slice(1, 3)).toEqual(["multiply", 0.4]);
    expect(draws[0].args.slice(1, 3)).toEqual(["source-over", 1]);
  });

  it("composes under the viewport scaled by the device pixel ratio", () => {
    const { comp } = harness();
    comp.syncLayers([paintLayer("a")]);
    const t = target();
    comp.render(t.canvas, { scale: 2, offsetX: 10, offsetY: 5 }, 1.5);
    const sets = t.ctx.calls.filter((c) => c.op === "setTransform");
    expect(sets.some((c) => c.args.join() === [3, 0, 0, 3, 15, 7.5].join())).toBe(true);
  });

  it("tiles the paper under everything when there is one, and a checker only when there is not", () => {
    const { comp } = harness();
    comp.syncLayers([paintLayer("a")]);
    const bare = target();
    comp.render(bare.canvas, { scale: 1, offsetX: 0, offsetY: 0 }, 1);
    expect(bare.ctx.calls.filter((c) => c.op === "fillRect")).toHaveLength(1);
    comp.setPaper({} as CanvasImageSource);
    const papered = target();
    comp.render(papered.canvas, { scale: 1, offsetX: 0, offsetY: 0 }, 1);
    const fills = papered.ctx.calls.filter((c) => c.op === "fillRect");
    expect(fills).toHaveLength(1);
    expect(fills[0].args).toEqual([0, 0, 512, 300]);
  });

  // Fails on: the paper under a transparent page painting being drawn at its tile size, so its grain shows at
  // half the size it has on the page and in the blank sheet's own paper.
  it("lays the paper at the scale it is given, and at its own size by default", () => {
    const { comp } = harness();
    comp.syncLayers([paintLayer("a")]);
    comp.setPaper({} as CanvasImageSource);
    const plain = target();
    comp.render(plain.canvas, { scale: 1, offsetX: 0, offsetY: 0 }, 1);
    expect(plain.ctx.calls.some((c) => c.op === "patternScale")).toBe(false);
    comp.setPaper({} as CanvasImageSource, 1.9);
    const scaled = target();
    comp.render(scaled.canvas, { scale: 1, offsetX: 0, offsetY: 0 }, 1);
    expect(scaled.ctx.calls.find((c) => c.op === "patternScale")?.args).toEqual([1.9, 1.9]);
  });

  it("cuts the picture's mask out of it and redraws a tile when its mask changes", () => {
    const { comp, made } = harness({} as ImageBitmap);
    const mask = new TiledLayer(512, 300);
    const pic: PictureLayer = { kind: "picture", id: "picture", name: "Picture", visible: true, mask };
    comp.syncLayers([pic]);
    comp.flush();
    const [, pictureCanvas] = made; // made[0] = the picture at document size
    const cut = () => pictureCanvas.fake.calls.filter((c) => c.op === "drawImage" && c.args[1] === "destination-out").length;
    const before = cut();
    mask.ensureTile(1).fill(255);
    comp.markDirty("picture", [1]);
    comp.flush();
    expect(cut() - before).toBe(1);
  });

  it("readPixel gives the composited colour, null outside the document and null where nothing shows", () => {
    const { comp, made } = harness();
    comp.syncLayers([paintLayer("a")]);
    expect(comp.readPixel(-1, 5)).toBeNull();
    expect(comp.readPixel(512, 5)).toBeNull();
    expect(comp.readPixel(10, 10)).toBeNull();
    const probe = made[made.length - 1].fake;
    probe.pixel = [12, 34, 56, 255];
    expect(comp.readPixel(10.7, 10)).toEqual({ r: 12, g: 34, b: 56 });
    expect(probe.calls.some((c) => c.op === "setTransform" && c.args.join() === "1,0,0,1,-10,-10")).toBe(true);
  });

  it("readRegion draws the stack shifted to the rectangle's corner and gives its pixels, clipped to the document", () => {
    // Fails on: a box near the edge reading outside the document, a region offset from where it was drawn, or nothing returned for a box that is partly inside.
    const { comp, made } = harness();
    comp.syncLayers([paintLayer("a")]);
    expect(comp.readRegion(600, 10, 20, 20)).toBeNull();
    expect(comp.readRegion(10, 10, 0, 5)).toBeNull();
    const before = made.length;
    const px = comp.readRegion(500.4, 290.2, 40, 40);
    expect(px).not.toBeNull();
    expect([px?.width, px?.height]).toEqual([12, 10]);
    const area = made[before].fake;
    expect(area.calls.some((c) => c.op === "setTransform" && c.args.join() === "1,0,0,1,-500,-290")).toBe(true);
    expect(area.calls.some((c) => c.op === "drawImage")).toBe(true);
  });

  it("syncLayers drops a removed layer so it is no longer drawn", () => {
    const { comp } = harness();
    const a = paintLayer("a");
    const b = paintLayer("b");
    comp.syncLayers([a, b]);
    comp.syncLayers([a]);
    const t = target();
    comp.render(t.canvas, { scale: 1, offsetX: 0, offsetY: 0 }, 1);
    expect(t.ctx.calls.filter((c) => c.op === "drawImage")).toHaveLength(1);
  });
});
