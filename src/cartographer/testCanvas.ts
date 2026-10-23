// Shared fakes for the cartographer render tests: a recording stand-in for
// CanvasRenderingContext2D and a fake tile pack runtime. See renderMap.test.ts.

import { BASE_TILE_SIZE, type PackCategory } from "@/cartographer/packSchema";
import type { TilePackManifest } from "@/cartographer/packSchema";
import type { ValidationResult } from "@/cartographer/validatePack";
import type { TilePackRuntime } from "@/cartographer/packLoader";

// ── Fake canvas context ─────────────────────────────────────────────────────
// happy-dom's canvas.getContext("2d") returns null, and even a real one would
// only tell us pixels were painted, not why. Recording the calls made against
// a narrow structural stand-in for CanvasRenderingContext2D lets these tests
// assert layer ordering and the viewport-culling arithmetic directly, without
// touching pixels — same idiom as src/lib/tokenRenderer.test.ts.

export interface DrawImageCall {
  source: unknown;
  x: number;
  y: number;
  w: number;
  h: number;
  alpha: number;
  /** The source rectangle of the nine-argument form (a slice of a tile); absent for a whole-image draw. */
  src?: { x: number; y: number; w: number; h: number };
  /** The `clip()` calls made before this draw and not yet restored: how many clips were active. */
  clips: number;
}

interface FakeCtx {
  globalAlpha: number;
  globalCompositeOperation: string;
  roundRect(x: number, y: number, w: number, h: number, r: number): void;
  imageSmoothingEnabled: boolean;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap: string;
  textAlign: string;
  textBaseline: string;
  font: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  drawImage(source: CanvasImageSource, ...args: number[]): void;
  clip(): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  closePath(): void;
  fill(): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  setLineDash(segments: number[]): void;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  createImageData(width: number, height: number): { width: number; height: number; data: Uint8ClampedArray };
  putImageData(image: { width: number; height: number; data: Uint8ClampedArray }, x: number, y: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): FakeGradient;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): FakeGradient;
}

interface FakeGradient {
  addColorStop(offset: number, color: string): void;
}

export interface GradientCall {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  stops: [number, string][];
}

export interface RadialGradientCall {
  x0: number;
  y0: number;
  r0: number;
  x1: number;
  y1: number;
  r1: number;
  stops: [number, string][];
  /** The globalCompositeOperation in force when the gradient was made. */
  composite: string;
}

/** A drawImage made while a drop shadow was set: what the shadow passes record. */
export interface ShadowDraw {
  source: unknown;
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface Recorder {
  calls: string[];
  fillRects: { x: number; y: number; w: number; h: number }[];
  drawImages: DrawImageCall[];
  fillStyles: string[];
  strokeStyles: string[];
  texts: string[];
  translates: [number, number][];
  rotates: number[];
  /** Every moveTo/lineTo point, in call order. */
  points: [number, number][];
  /** Number of `clip()` calls. */
  clipCount: number;
  roundRects: number;
  gradients: GradientCall[];
  radialGradients: RadialGradientCall[];
  /** The fillStyle in force at each fillRect (a gradient object or a colour string). */
  fillRectStyles: unknown[];
  shadowDraws: ShadowDraw[];
  /** The alpha bytes of every image put on the canvas (a light's visibility mask). */
  putImages: { width: number; height: number; alpha: number[] }[];
}

export function makeCtx(): { ctx: CanvasRenderingContext2D; rec: Recorder } {
  const rec: Recorder = { calls: [], fillRects: [], drawImages: [], fillStyles: [], strokeStyles: [], texts: [], translates: [], rotates: [], points: [], clipCount: 0, roundRects: 0, gradients: [], radialGradients: [], fillRectStyles: [], shadowDraws: [], putImages: [] };
  let fillStyle: unknown = "";
  let strokeStyle = "";
  const noop = (): void => {};
  const saved: { c: string; b: number; x: number; y: number; op: string; clipDepth: number }[] = [];
  let clipDepth = 0;
  const fake: FakeCtx = {
    imageSmoothingEnabled: true,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    roundRect: () => { rec.roundRects++; },
    lineWidth: 1,
    lineCap: "butt",
    textAlign: "start",
    textBaseline: "alphabetic",
    font: "",
    get fillStyle() { return fillStyle as string; },
    set fillStyle(v: string) { fillStyle = v; if (typeof v === "string") rec.fillStyles.push(v); },
    get strokeStyle() { return strokeStyle; },
    set strokeStyle(v: string) { strokeStyle = v; rec.strokeStyles.push(v); },
    fillRect: (x, y, w, h) => { rec.calls.push("fillRect"); rec.fillRects.push({ x, y, w, h }); rec.fillRectStyles.push(fillStyle); },
    strokeRect: () => rec.calls.push("strokeRect"),
    drawImage: (source, ...a) => {
      rec.calls.push("drawImage");
      const sliced = a.length === 8;
      const [x, y, w, h] = sliced ? a.slice(4) : a;
      rec.drawImages.push({
        source, x, y, w, h, alpha: fake.globalAlpha, clips: clipDepth,
        ...(sliced ? { src: { x: a[0], y: a[1], w: a[2], h: a[3] } } : {}),
      });
      if (fake.shadowColor) {
        rec.shadowDraws.push({ source, color: fake.shadowColor, blur: fake.shadowBlur, offsetX: fake.shadowOffsetX, offsetY: fake.shadowOffsetY });
      }
    },
    shadowColor: "",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: (image) => {
      rec.putImages.push({ width: image.width, height: image.height, alpha: Array.from({ length: image.width * image.height }, (_, k) => image.data[k * 4 + 3]) });
    },
    createLinearGradient: (x0, y0, x1, y1) => {
      const call: GradientCall = { x0, y0, x1, y1, stops: [] };
      rec.gradients.push(call);
      return { addColorStop: (offset, color) => { call.stops.push([offset, color]); }, call } as FakeGradient;
    },
    createRadialGradient: (x0, y0, r0, x1, y1, r1) => {
      const call: RadialGradientCall = { x0, y0, r0, x1, y1, r1, stops: [], composite: fake.globalCompositeOperation };
      rec.radialGradients.push(call);
      return { addColorStop: (offset, color) => { call.stops.push([offset, color]); }, call } as FakeGradient;
    },
    beginPath: () => rec.calls.push("beginPath"),
    moveTo: (x, y) => { rec.calls.push("moveTo"); rec.points.push([x, y]); },
    lineTo: (x, y) => { rec.calls.push("lineTo"); rec.points.push([x, y]); },
    clip: () => { rec.calls.push("clip"); rec.clipCount++; clipDepth++; },
    stroke: () => rec.calls.push("stroke"),
    closePath: noop,
    fill: () => rec.calls.push("fill"),
    arc: () => rec.calls.push("arc"),
    save: () => {
      rec.calls.push("save");
      saved.push({ c: fake.shadowColor, b: fake.shadowBlur, x: fake.shadowOffsetX, y: fake.shadowOffsetY, op: fake.globalCompositeOperation, clipDepth });
    },
    restore: () => {
      rec.calls.push("restore");
      const top = saved.pop();
      if (top) { clipDepth = top.clipDepth; fake.shadowColor = top.c; fake.shadowBlur = top.b; fake.shadowOffsetX = top.x; fake.shadowOffsetY = top.y; fake.globalCompositeOperation = top.op; }
    },
    translate: (x, y) => { rec.translates.push([x, y]); },
    rotate: (angle) => { rec.rotates.push(angle); },
    fillText: (text) => { rec.calls.push("fillText"); rec.texts.push(text); },
    setLineDash: () => rec.calls.push("setLineDash"),
  };
  return { ctx: fake as unknown as CanvasRenderingContext2D, rec };
}

// ── Fake tile pack runtime ──────────────────────────────────────────────────
// getTile's sentinel source carries the category it was drawn for, so a test
// can tell which layer produced a given drawImage call just by inspecting the
// recorded source — that's what makes the layer-ordering assertion possible
// without a real image.

export interface TileSentinel {
  pack: string;
  category: PackCategory;
  variant: number;
  side?: string;
}

export function makeRuntime(
  packId: string,
  opts: {
    variantCount?: number;
    /** Per-category override of `variantCount` (e.g. real wallJoint art). */
    categoryCounts?: Partial<Record<PackCategory, number>>;
    /** Categories whose tiles report `isPlaceholder`. */
    placeholders?: PackCategory[];
    palette?: TilePackManifest["palette"];
    doorLeaf?: TilePackManifest["doorLeaf"];
    continuous?: TilePackManifest["continuous"];
    lights?: TilePackManifest["lights"];
    flush?: TilePackManifest["flush"];
    motion?: TilePackManifest["motion"];
    sway?: TilePackManifest["sway"];
    /** Manifest asset slots (their urls), for what reads a slot rather than a drawn tile. */
    assets?: TilePackManifest["assets"];
    /** Default true, like a library pack. */
    lastingUrls?: boolean;
  } = {},
): TilePackRuntime {
  const manifest: TilePackManifest = {
    pack_id: packId,
    name: packId,
    description: "",
    pack_version: 1,
    schema_version: 2,
    base_tile_size: BASE_TILE_SIZE,
    assets: opts.assets ?? {},
    ...(opts.palette ? { palette: opts.palette } : {}),
    ...(opts.doorLeaf ? { doorLeaf: opts.doorLeaf } : {}),
    ...(opts.continuous ? { continuous: opts.continuous } : {}),
    ...(opts.lights ? { lights: opts.lights } : {}),
    ...(opts.flush ? { flush: opts.flush } : {}),
    ...(opts.motion ? { motion: opts.motion } : {}),
    ...(opts.sway ? { sway: opts.sway } : {}),
  };
  const validation: ValidationResult = { valid: true, missing: [], extras: [], warnings: [] };
  return {
    manifest,
    validation,
    lastingUrls: opts.lastingUrls ?? true,
    getTile: (category, variant, side) => ({
      source: { pack: packId, category, variant, side } satisfies TileSentinel as unknown as CanvasImageSource,
      isPlaceholder: opts.placeholders?.includes(category) ?? false,
    }),
    variantCount: (category) => opts.categoryCounts?.[category] ?? opts.variantCount ?? 0,
  };
}

export function sourceOf(call: DrawImageCall): TileSentinel {
  return call.source as TileSentinel;
}

// ── Fake layer canvases ─────────────────────────────────────────────────────
// What `makeCanvas` returns in a test: every canvas it hands out, with its own
// recorder, so a test can read which tiles went to which shadow class. The
// canvas handed back is a sentinel the compositing drawImage then names.

export interface FakeLayer {
  canvas: { layer: number };
  ctx: CanvasRenderingContext2D;
  rec: Recorder;
  width: number;
  height: number;
}

export function makeLayerFactory(): {
  makeCanvas: (w: number, h: number) => { canvas: CanvasImageSource; ctx: CanvasRenderingContext2D };
  layers: FakeLayer[];
} {
  const layers: FakeLayer[] = [];
  return {
    layers,
    makeCanvas: (width, height) => {
      const { ctx, rec } = makeCtx();
      const canvas = { layer: layers.length };
      layers.push({ canvas, ctx, rec, width, height });
      return { canvas: canvas as unknown as CanvasImageSource, ctx };
    },
  };
}
