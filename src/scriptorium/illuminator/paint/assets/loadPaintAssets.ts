/*
 * Loads the paint engine's art (#1181): image tips (alpha = coverage) and grains (greyscale, luminance = height),
 * and a paper's surface for the compositor. The engine reads tips and grains synchronously, so the store hands
 * out what has loaded and the caller preloads what a brush needs before the pen goes down.
 *
 * Every path goes through `artUrl()`: production serves art only from the CDN. The decoder is injected so the
 * loader runs in tests without a DOM.
 */
import { artUrl } from "@/lib/assets/artUrl";
import { loadDomImage } from "../../lib/loadImage";
import { STOCK_GRAIN_PATHS, type Paper } from "@/scriptorium/papers/papers";
import { STOCK_TIP_PATHS } from "../brushes/stockBrushes";
import type { GrainImage, PaintAssets, TipImage } from "../engine/types";

/** Straight RGBA pixels, row by row. */
export interface DecodedPixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type PixelDecoder = (url: string) => Promise<DecodedPixels>;

/** The browser decoder: the image read with CORS (the CDN allows it), drawn to a canvas and read back. */
export const decodeInBrowser: PixelDecoder = async (url) => {
  const img = await loadDomImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error(`no 2d context to decode ${url}`);
  ctx.drawImage(img, 0, 0);
  const { width, height, data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width, height, data };
};

export function tipFromPixels(px: DecodedPixels): TipImage {
  const alpha = new Uint8Array(px.width * px.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = px.data[i * 4 + 3];
  return { width: px.width, height: px.height, alpha };
}

export function grainFromPixels(px: DecodedPixels): GrainImage {
  const value = new Uint8Array(px.width * px.height);
  for (let i = 0; i < value.length; i++) {
    const o = i * 4;
    value[i] = Math.round(0.2126 * px.data[o] + 0.7152 * px.data[o + 1] + 0.0722 * px.data[o + 2]);
  }
  return { width: px.width, height: px.height, value };
}

export interface PaintAssetStore extends PaintAssets {
  /** Loads one tip (once; concurrent and repeated calls share the fetch). Rejects for an id with no art. */
  loadTip(id: string): Promise<TipImage>;
  loadGrain(id: string): Promise<GrainImage>;
  /** Every stock tip and grain. */
  preloadStock(): Promise<void>;
  /** Tells the store where a painter's own tip / grain lives (an absolute URL, not an art path). */
  addUserTipUrl(id: string, url: string): void;
  addUserGrainUrl(id: string, url: string): void;
  /** Hands over an image already decoded (a just-imported brush paints before its upload finishes). */
  putTip(id: string, tip: TipImage): void;
  putGrain(id: string, grain: GrainImage): void;
}

export interface LoadPaintAssetsOptions {
  decode?: PixelDecoder;
  tipPaths?: Readonly<Record<string, string>>;
  grainPaths?: Readonly<Record<string, string>>;
}

function cachedLoader<T>(
  kind: string,
  paths: Readonly<Record<string, string>>,
  decode: PixelDecoder,
  convert: (px: DecodedPixels) => T,
): { load(id: string): Promise<T>; done: Map<string, T>; addUrl(id: string, url: string): void; put(id: string, value: T): void } {
  const done = new Map<string, T>();
  const pending = new Map<string, Promise<T>>();
  // A painter's own files are absolute URLs; `artUrl` maps build paths to the CDN and would mangle them.
  const own = new Map<string, string>();
  function load(id: string): Promise<T> {
    const hit = pending.get(id);
    if (hit) return hit;
    const ownUrl = own.get(id);
    const path = paths[id];
    if (ownUrl === undefined && path === undefined) return Promise.reject(new Error(`no ${kind} art for "${id}"`));
    const p = decode(ownUrl ?? artUrl(path as string)).then(
      (px) => {
        const value = convert(px);
        done.set(id, value);
        return value;
      },
      (err: unknown) => {
        // A failed load is not remembered, so the next try fetches again.
        pending.delete(id);
        throw err;
      },
    );
    pending.set(id, p);
    return p;
  }
  return {
    load,
    done,
    addUrl: (id, url) => {
      own.set(id, url);
    },
    put: (id, value) => {
      done.set(id, value);
      pending.set(id, Promise.resolve(value));
    },
  };
}

export function loadPaintAssets(opts: LoadPaintAssetsOptions = {}): PaintAssetStore {
  const { decode = decodeInBrowser, tipPaths = STOCK_TIP_PATHS, grainPaths = STOCK_GRAIN_PATHS } = opts;
  const tips = cachedLoader("tip", tipPaths, decode, tipFromPixels);
  const grains = cachedLoader("grain", grainPaths, decode, grainFromPixels);
  return {
    tip: (id) => tips.done.get(id),
    grain: (id) => grains.done.get(id),
    loadTip: tips.load,
    loadGrain: grains.load,
    addUserTipUrl: tips.addUrl,
    addUserGrainUrl: grains.addUrl,
    putTip: tips.put,
    putGrain: grains.put,
    async preloadStock() {
      await Promise.all([
        ...Object.keys(tipPaths).map((id) => tips.load(id)),
        ...Object.keys(grainPaths).map((id) => grains.load(id)),
      ]);
    },
  };
}

export type PaperSurface = ImageBitmap | HTMLImageElement;

const surfaces = new Map<string, Promise<PaperSurface>>();

/** A paper's picture for the compositor to tile under the painting; loaded once per paper. */
export function loadPaperSurface(
  paper: Pick<Paper, "id" | "surfacePath">,
  load: (url: string) => Promise<PaperSurface> = loadDomImage,
): Promise<PaperSurface> {
  const hit = surfaces.get(paper.id);
  if (hit) return hit;
  const p = load(artUrl(paper.surfacePath)).catch((err: unknown) => {
    surfaces.delete(paper.id);
    throw err;
  });
  surfaces.set(paper.id, p);
  return p;
}
