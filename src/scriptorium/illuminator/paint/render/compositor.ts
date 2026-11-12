/*
 * Draws a painting session to a canvas (#1181). Each layer has an offscreen canvas of its own, kept in step with
 * its tiles by uploading only the tiles a stroke touched; one render per animation frame stacks them under the
 * viewport: paper, picture (with its erased mask cut out), then paint layers bottom to top with their blend and
 * opacity.
 *
 * Offscreen canvases come from `createCanvas`, injected so the compositor is tested with a recording context.
 */
import type { Layer } from "../session/types";
import type { Rgb } from "../engine/types";
import type { TiledLayer } from "../engine/tiledLayer";
import type { Viewport } from "./viewport";

/** Raw pixels, as ImageData holds them. */
export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * The slice of the 2D context the compositor draws with. Written as methods so a real
 * CanvasRenderingContext2D is assignable, and a test can supply a recording one without casts.
 */
export interface Ctx {
  globalAlpha: number;
  globalCompositeOperation: GlobalCompositeOperation;
  fillStyle: string | CanvasGradient | CanvasPattern;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  save(): void;
  restore(): void;
  drawImage(image: CanvasImageSource, ...rect: number[]): void;
  createPattern(image: CanvasImageSource, repetition: string): CanvasPattern | null;
  createImageData(w: number, h: number): PixelBuffer;
  putImageData(img: PixelBuffer, x: number, y: number): void;
  getImageData(x: number, y: number, w: number, h: number): PixelBuffer;
}

/** The canvas a frame is drawn to. */
export interface RenderTarget {
  width: number;
  height: number;
  getContext(id: "2d"): Ctx | null;
}

/** An offscreen canvas: what to draw from, and what to draw with. */
export interface Surface {
  drawable: CanvasImageSource;
  ctx: Ctx;
}

export interface CompositorOptions {
  /** The document's size in canvas pixels. */
  width: number;
  height: number;
  /** The picture being illuminated, drawn to fill the document; null for a blank sheet. */
  picture: CanvasImageSource | null;
  /** `readback` is a hint that the pixels will be read often. */
  createCanvas?: (width: number, height: number, readback?: boolean) => Surface;
}

export interface Compositor {
  /** The picture changed (another edit was applied under the painting): redrawn at document size, the mask cut out of it again. */
  setPicture(source: CanvasImageSource): void;
  /**
   * The paper sheet to tile under the painting, drawn `scale` times larger than its tile (the paper's
   * `surfaceScale`, as the page and a blank sheet lay it); null leaves a checker where nothing is painted.
   * A display backdrop only: the bake never draws it, so a transparent painting stays transparent.
   */
  setPaper(surface: CanvasImageSource | null, scale?: number): void;
  /** Brings the set of layers up to date: new ones are uploaded whole, removed ones dropped. Call after any layer-list change. */
  syncLayers(layers: readonly Layer[]): void;
  /** Tiles of a layer changed (no keys: the whole layer). Uploaded on the next render. */
  markDirty(layerId: string, keys?: readonly number[]): void;
  /** Uploads what is dirty now (render does this itself). */
  flush(): void;
  render(target: RenderTarget, viewport: Viewport, dpr: number): void;
  /** The composited colour at a document point, or null outside the document or where nothing shows. */
  readPixel(docX: number, docY: number): Rgb | null;
  /**
   * The composited RGBA of a document rectangle, as the stage shows it (paper, picture and every visible layer):
   * the rectangle is widened to whole pixels and clipped to the document. Null when nothing of it is inside.
   */
  readRegion(docX: number, docY: number, w: number, h: number): PixelBuffer | null;
  dispose(): void;
}

interface LayerSurface {
  canvas: Surface;
  ctx: Ctx;
  /** The picture layer's mask, uploaded as-is, so a tile can be redrawn from the picture and cut. */
  mask: Surface | null;
}

const CHECKER = 16;

function defaultCreateCanvas(width: number, height: number, readback = false): Surface {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d", { willReadFrequently: readback });
  if (!ctx) throw new Error("the browser gave no 2d canvas context");
  return { drawable: c, ctx };
}

export function createCompositor(opts: CompositorOptions): Compositor {
  const { width, height, picture, createCanvas = defaultCreateCanvas } = opts;
  const surfaces = new Map<string, LayerSurface>();
  const live = new Map<string, Layer>();
  let order: Layer[] = [];
  const pending = new Map<string, Set<number> | "all">();
  let paper: CanvasImageSource | null = null;
  let paperScale = 1;
  let checker: CanvasPattern | null = null;
  const scratch = new Map<string, PixelBuffer>();

  // The picture at document size, once: a tile is redrawn from it whenever its mask changes.
  let pictureBase: Surface | null = null;
  if (picture) {
    pictureBase = createCanvas(width, height);
    pictureBase.ctx.drawImage(picture, 0, 0, width, height);
  }

  function imageFor(ctx: Ctx, w: number, h: number): PixelBuffer {
    const id = `${w}x${h}`;
    let img = scratch.get(id);
    if (!img) {
      img = ctx.createImageData(w, h);
      scratch.set(id, img);
    }
    return img;
  }

  function putTile(ctx: Ctx, tl: TiledLayer, key: number): void {
    const r = tl.tileRect(key);
    const data = tl.tile(key);
    if (!data) {
      ctx.clearRect(r.x, r.y, r.w, r.h);
      return;
    }
    const img = imageFor(ctx, r.w, r.h);
    const stride = tl.tileSize * 4;
    for (let y = 0; y < r.h; y++) img.data.set(data.subarray(y * stride, y * stride + r.w * 4), y * r.w * 4);
    ctx.putImageData(img, r.x, r.y);
  }

  function uploadPictureTile(ls: LayerSurface, mask: TiledLayer, key: number): void {
    if (!ls.mask || !pictureBase) return;
    putTile(ls.mask.ctx, mask, key);
    const r = mask.tileRect(key);
    const ctx = ls.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(r.x, r.y, r.w, r.h);
    ctx.drawImage(pictureBase.drawable, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(ls.mask.drawable, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    ctx.restore();
  }

  function tilesOf(layer: Layer): TiledLayer {
    return layer.kind === "picture" ? layer.mask : layer.pixels;
  }

  function uploadWhole(layer: Layer, ls: LayerSurface): void {
    const tl = tilesOf(layer);
    if (layer.kind === "picture") {
      if (!ls.mask) return;
      ls.mask.ctx.clearRect(0, 0, width, height);
      ls.ctx.clearRect(0, 0, width, height);
      if (pictureBase) ls.ctx.drawImage(pictureBase.drawable, 0, 0);
      for (const key of tl.keys()) uploadPictureTile(ls, tl, key);
      return;
    }
    ls.ctx.clearRect(0, 0, width, height);
    for (const key of tl.keys()) putTile(ls.ctx, tl, key);
  }

  function flush(): void {
    for (const [id, what] of pending) {
      const layer = live.get(id);
      const ls = surfaces.get(id);
      if (!layer || !ls) continue;
      if (what === "all") {
        uploadWhole(layer, ls);
        continue;
      }
      const tl = tilesOf(layer);
      for (const key of what) {
        if (layer.kind === "picture") uploadPictureTile(ls, tl, key);
        else putTile(ls.ctx, tl, key);
      }
    }
    pending.clear();
  }

  function markDirty(layerId: string, keys?: readonly number[]): void {
    if (keys === undefined) {
      pending.set(layerId, "all");
      return;
    }
    const have = pending.get(layerId);
    if (have === "all") return;
    const set = have ?? new Set<number>();
    for (const k of keys) set.add(k);
    pending.set(layerId, set);
  }

  function syncLayers(layers: readonly Layer[]): void {
    const ids = new Set(layers.map((l) => l.id));
    for (const id of surfaces.keys()) {
      if (!ids.has(id)) {
        surfaces.delete(id);
        live.delete(id);
        pending.delete(id);
      }
    }
    for (const layer of layers) {
      live.set(layer.id, layer);
      if (surfaces.has(layer.id)) continue;
      const canvas = createCanvas(width, height);
      const ls: LayerSurface = { canvas, ctx: canvas.ctx, mask: null };
      if (layer.kind === "picture") ls.mask = createCanvas(width, height);
      surfaces.set(layer.id, ls);
      pending.set(layer.id, "all");
    }
    order = [...layers];
  }

  function checkerPattern(ctx: Ctx): CanvasPattern | null {
    if (checker) return checker;
    const tile = createCanvas(CHECKER * 2, CHECKER * 2);
    const t = tile.ctx;
    t.fillStyle = "#cfcfcf";
    t.fillRect(0, 0, CHECKER * 2, CHECKER * 2);
    t.fillStyle = "#f2f2f2";
    t.fillRect(0, 0, CHECKER, CHECKER);
    t.fillRect(CHECKER, CHECKER, CHECKER, CHECKER);
    checker = ctx.createPattern(tile.drawable, "repeat");
    return checker;
  }

  /** Paper, picture and paint layers in document space; the context's transform is already set. */
  function drawStack(ctx: Ctx): void {
    if (paper) {
      const pattern = ctx.createPattern(paper, "repeat");
      if (pattern) {
        if (paperScale !== 1) pattern.setTransform({ a: paperScale, d: paperScale });
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, width, height);
      }
    }
    for (const layer of order) {
      if (!layer.visible) continue;
      const ls = surfaces.get(layer.id);
      if (!ls) continue;
      if (layer.kind === "picture" && !pictureBase) continue;
      ctx.globalAlpha = layer.kind === "paint" ? layer.opacity : 1;
      ctx.globalCompositeOperation = layer.kind === "paint" ? layer.blend : "source-over";
      ctx.drawImage(ls.canvas.drawable, 0, 0);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function render(target: RenderTarget, vp: Viewport, dpr: number): void {
    flush();
    const ctx = target.getContext("2d");
    if (!ctx) throw new Error("the browser gave no 2d canvas context");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, target.width, target.height);
    if (!paper) {
      const pattern = checkerPattern(ctx);
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(vp.offsetX * dpr, vp.offsetY * dpr, width * vp.scale * dpr, height * vp.scale * dpr);
      }
    }
    ctx.setTransform(vp.scale * dpr, 0, 0, vp.scale * dpr, vp.offsetX * dpr, vp.offsetY * dpr);
    // Zoomed in, a pixel stays a crisp square; zoomed out, it is averaged.
    ctx.imageSmoothingEnabled = vp.scale < 2;
    ctx.imageSmoothingQuality = "high";
    drawStack(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  let probe: Surface | null = null;

  function readPixel(x: number, y: number): Rgb | null {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || py < 0 || px >= width || py >= height) return null;
    flush();
    probe ??= createCanvas(1, 1, true);
    const ctx = probe.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 1, 1);
    ctx.setTransform(1, 0, 0, 1, -px, -py);
    drawStack(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    if (d[3] === 0) return null;
    return { r: d[0], g: d[1], b: d[2] };
  }

  function readRegion(x: number, y: number, w: number, h: number): PixelBuffer | null {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(width, Math.ceil(x + w));
    const y1 = Math.min(height, Math.ceil(y + h));
    const rw = x1 - x0;
    const rh = y1 - y0;
    if (rw <= 0 || rh <= 0) return null;
    flush();
    const area = createCanvas(rw, rh, true);
    const ctx = area.ctx;
    ctx.setTransform(1, 0, 0, 1, -x0, -y0);
    drawStack(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return ctx.getImageData(0, 0, rw, rh);
  }

  return {
    setPicture(source) {
      pictureBase ??= createCanvas(width, height);
      pictureBase.ctx.clearRect(0, 0, width, height);
      pictureBase.ctx.drawImage(source, 0, 0, width, height);
      for (const [id, layer] of live) if (layer.kind === "picture") pending.set(id, "all");
    },
    setPaper(surface, scale = 1) {
      paper = surface;
      paperScale = scale;
    },
    syncLayers,
    markDirty,
    flush,
    render,
    readPixel,
    readRegion,
    dispose() {
      surfaces.clear();
      live.clear();
      pending.clear();
      scratch.clear();
      order = [];
      pictureBase = null;
      probe = null;
    },
  };
}
