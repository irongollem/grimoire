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
}

interface FakeCtx {
  globalAlpha: number;
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
  drawImage(source: CanvasImageSource, x: number, y: number, w: number, h: number): void;
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
}

export interface Recorder {
  calls: string[];
  fillRects: { x: number; y: number; w: number; h: number }[];
  drawImages: DrawImageCall[];
  fillStyles: string[];
  strokeStyles: string[];
  texts: string[];
  translates: [number, number][];
  roundRects: number;
}

export function makeCtx(): { ctx: CanvasRenderingContext2D; rec: Recorder } {
  const rec: Recorder = { calls: [], fillRects: [], drawImages: [], fillStyles: [], strokeStyles: [], texts: [], translates: [], roundRects: 0 };
  let fillStyle = "";
  let strokeStyle = "";
  const noop = (): void => {};
  const fake: FakeCtx = {
    imageSmoothingEnabled: true,
    globalAlpha: 1,
    roundRect: () => { rec.roundRects++; },
    lineWidth: 1,
    lineCap: "butt",
    textAlign: "start",
    textBaseline: "alphabetic",
    font: "",
    get fillStyle() { return fillStyle; },
    set fillStyle(v: string) { fillStyle = v; rec.fillStyles.push(v); },
    get strokeStyle() { return strokeStyle; },
    set strokeStyle(v: string) { strokeStyle = v; rec.strokeStyles.push(v); },
    fillRect: (x, y, w, h) => { rec.calls.push("fillRect"); rec.fillRects.push({ x, y, w, h }); },
    strokeRect: () => rec.calls.push("strokeRect"),
    drawImage: (source, x, y, w, h) => {
      rec.calls.push("drawImage");
      rec.drawImages.push({ source, x, y, w, h, alpha: fake.globalAlpha });
    },
    beginPath: () => rec.calls.push("beginPath"),
    moveTo: () => rec.calls.push("moveTo"),
    lineTo: () => rec.calls.push("lineTo"),
    stroke: () => rec.calls.push("stroke"),
    closePath: noop,
    fill: () => rec.calls.push("fill"),
    arc: () => rec.calls.push("arc"),
    save: () => rec.calls.push("save"),
    restore: () => rec.calls.push("restore"),
    translate: (x, y) => { rec.translates.push([x, y]); },
    rotate: noop,
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
    /** Per-category override of `variantCount` (e.g. real wallRoundJoint art). */
    categoryCounts?: Partial<Record<PackCategory, number>>;
    /** Categories whose tiles report `isPlaceholder`. */
    placeholders?: PackCategory[];
    palette?: TilePackManifest["palette"];
  } = {},
): TilePackRuntime {
  const manifest: TilePackManifest = {
    pack_id: packId,
    name: packId,
    description: "",
    pack_version: 1,
    schema_version: 2,
    base_tile_size: BASE_TILE_SIZE,
    assets: {},
    ...(opts.palette ? { palette: opts.palette } : {}),
  };
  const validation: ValidationResult = { valid: true, missing: [], extras: [], warnings: [] };
  return {
    manifest,
    validation,
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
