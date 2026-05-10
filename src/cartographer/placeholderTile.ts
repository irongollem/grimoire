// Procedural placeholder tiles — used when a pack's WebP asset fails to load.
// Each variant gets a stable colour derived from (pack_id, category, side?, variant)
// so maps look consistent across reloads. Real WebP assets replace these once
// the AI generation pipeline ships.

import { BASE_TILE_SIZE, type PackCategory } from "./packSchema";

interface PlaceholderKey {
  pack_id: string;
  category: PackCategory;
  side?: string;
  variant: number;
}

const cache = new Map<string, HTMLCanvasElement>();

function keyString(k: PlaceholderKey): string {
  return `${k.pack_id}|${k.category}|${k.side ?? ""}|${k.variant}`;
}

function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Per-category base colours — placeholder pack feels visually structured even without art.
const CATEGORY_BASE: Record<string, [number, number, number]> = {
  floor:        [82, 76, 68],   // warm grey stone
  wallSegmentH: [40, 36, 32],
  wallSegmentV: [40, 36, 32],
  wallJoint:    [30, 28, 26],
  doorClosedH:  [110, 70, 35],
  doorClosedV:  [110, 70, 35],
  doorOpenH:    [150, 110, 70],
  doorOpenV:    [150, 110, 70],
  solidBlock:   [55, 50, 45],
  stairsUp:     [95, 85, 70],
  stairsDown:   [70, 62, 52],
  rubble:       [90, 80, 65],
  debris:       [90, 80, 65],
};

function jitter(base: number, seed: number, range: number): number {
  return Math.max(0, Math.min(255, base + ((seed % (range * 2)) - range)));
}

export function getPlaceholderTile(k: PlaceholderKey): HTMLCanvasElement {
  const id = keyString(k);
  const cached = cache.get(id);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = BASE_TILE_SIZE;
  canvas.height = BASE_TILE_SIZE;
  const ctx = canvas.getContext("2d")!;

  const seed = hash32(id);
  const base = CATEGORY_BASE[k.category] ?? [120, 120, 120];

  // Fill with jittered base colour for the floor variants and solid blocks.
  if (k.category === "floor" || k.category === "solidBlock") {
    const r = jitter(base[0], seed, 12);
    const g = jitter(base[1], seed >>> 8, 12);
    const b = jitter(base[2], seed >>> 16, 12);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, 0, BASE_TILE_SIZE, BASE_TILE_SIZE);

    // Sprinkle a few darker spots for variance
    ctx.fillStyle = `rgba(0, 0, 0, 0.08)`;
    const dotCount = 6 + (seed % 5);
    for (let i = 0; i < dotCount; i++) {
      const dx = ((seed >>> (i * 3)) % BASE_TILE_SIZE);
      const dy = ((seed >>> (i * 3 + 11)) % BASE_TILE_SIZE);
      const size = 4 + ((seed >>> i) % 8);
      ctx.fillRect(dx, dy, size, size);
    }
    return finalise(canvas, id);
  }

  // Edge segments — transparent except for a strip on the relevant edge.
  if (k.category === "wallSegmentH" || k.category === "wallSegmentV" ||
      k.category === "doorClosedH"  || k.category === "doorClosedV"  ||
      k.category === "doorOpenH"    || k.category === "doorOpenV") {
    ctx.clearRect(0, 0, BASE_TILE_SIZE, BASE_TILE_SIZE);
    ctx.fillStyle = `rgb(${base[0]}, ${base[1]}, ${base[2]})`;
    const isHorizontal = k.category.endsWith("H");
    const thickness = Math.round(BASE_TILE_SIZE * 0.18);
    if (isHorizontal) {
      ctx.fillRect(0, 0, BASE_TILE_SIZE, thickness);
    } else {
      ctx.fillRect(0, 0, thickness, BASE_TILE_SIZE);
    }
    return finalise(canvas, id);
  }

  // Default fallback — flat colour with a label corner so the user notices.
  ctx.fillStyle = "rgb(180, 80, 200)";
  ctx.fillRect(0, 0, BASE_TILE_SIZE, BASE_TILE_SIZE);
  ctx.fillStyle = "rgb(255, 255, 255)";
  ctx.font = "10px sans-serif";
  ctx.fillText(k.category, 4, 14);
  ctx.fillText(`v${k.variant}`, 4, 26);
  return finalise(canvas, id);
}

function finalise(canvas: HTMLCanvasElement, id: string): HTMLCanvasElement {
  cache.set(id, canvas);
  return canvas;
}

// Stale-pack tile — purple/black checker. Used when pack_id is no longer available.
let staleTile: HTMLCanvasElement | null = null;
export function getStalePackTile(): HTMLCanvasElement {
  if (staleTile) return staleTile;
  const canvas = document.createElement("canvas");
  canvas.width = BASE_TILE_SIZE;
  canvas.height = BASE_TILE_SIZE;
  const ctx = canvas.getContext("2d")!;
  const half = BASE_TILE_SIZE / 2;
  ctx.fillStyle = "rgb(40, 0, 60)";
  ctx.fillRect(0, 0, BASE_TILE_SIZE, BASE_TILE_SIZE);
  ctx.fillStyle = "rgb(200, 100, 220)";
  ctx.fillRect(0, 0, half, half);
  ctx.fillRect(half, half, half, half);
  staleTile = canvas;
  return canvas;
}
