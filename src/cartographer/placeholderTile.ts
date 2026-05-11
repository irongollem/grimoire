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

// Stone-dungeon defaults — used when a pack's manifest has no palette entry for a category.
// Image generators may also read the manifest palette for colour-aware prompt construction.
const STONE_DEFAULTS: Record<string, [number, number, number]> = {
  floor:         [82, 76, 68],
  wallSegmentH:  [40, 36, 32],
  wallSegmentV:  [40, 36, 32],
  wallJoint:     [30, 28, 26],
  doorClosedH:   [110, 70, 35],
  doorClosedV:   [110, 70, 35],
  doorOpenH:     [150, 110, 70],
  doorOpenV:     [150, 110, 70],
  solidBlock:    [55, 50, 45],
  stairsUp:      [95, 85, 70],
  stairsDown:    [70, 62, 52],
  rubble:        [90, 80, 65],
  debris:        [90, 80, 65],
  objectChest:   [110, 75, 30],
  objectBarrel:  [100, 65, 30],
  objectTable:   [130, 100, 55],
  objectStatue:  [140, 135, 125],
  objectPillar:  [120, 115, 108],
  objectBrazier: [180, 120, 40],
};

type Palette = Partial<Record<string, [number, number, number]>>;

function resolveBase(category: string, palette?: Palette): [number, number, number] {
  return palette?.[category] ?? STONE_DEFAULTS[category] ?? [120, 120, 120];
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v));
}

// Brightness-only jitter — shifts all three channels by the same amount so
// the hue stays locked to the pack palette. Variants look lighter or darker
// but never drift pink/green/blue.
function lumaJitter(base: [number, number, number], seed: number, range: number): [number, number, number] {
  const shift = (seed % (range * 2 + 1)) - range;
  return [clamp(base[0] + shift), clamp(base[1] + shift), clamp(base[2] + shift)];
}

export function getPlaceholderTile(k: PlaceholderKey, palette?: Palette): HTMLCanvasElement {
  const id = keyString(k);
  const cached = cache.get(id);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = BASE_TILE_SIZE;
  canvas.height = BASE_TILE_SIZE;
  const ctx = canvas.getContext("2d")!;

  const seed = hash32(id);
  const base = resolveBase(k.category, palette);

  // Fill with jittered base colour for the floor variants and solid blocks.
  if (k.category === "floor" || k.category === "solidBlock") {
    const [r, g, b] = lumaJitter(base, seed, 12);
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
  // CONVENTION: the wall strip is painted in the CENTER of the 128×128 tile
  // (vertically for H, horizontally for V). The renderer draws each wall tile
  // shifted by half a tile so the painted strip lands ON the gridline,
  // straddling both adjacent cells equally. Real WebP assets must follow the
  // same convention — see public/cartographer/stone-dungeon/v1/README.md.
  if (k.category === "wallSegmentH" || k.category === "wallSegmentV" ||
      k.category === "doorClosedH"  || k.category === "doorClosedV"  ||
      k.category === "doorOpenH"    || k.category === "doorOpenV") {
    ctx.clearRect(0, 0, BASE_TILE_SIZE, BASE_TILE_SIZE);
    ctx.fillStyle = `rgb(${base[0]}, ${base[1]}, ${base[2]})`;
    const isHorizontal = k.category.endsWith("H");
    const thickness = Math.round(BASE_TILE_SIZE * 0.18);
    const offset = Math.round((BASE_TILE_SIZE - thickness) / 2);
    if (isHorizontal) {
      ctx.fillRect(0, offset, BASE_TILE_SIZE, thickness);
    } else {
      ctx.fillRect(offset, 0, thickness, BASE_TILE_SIZE);
    }
    return finalise(canvas, id);
  }

  // ── Wall joint — solid square matching wall colour ──
  if (k.category === "wallJoint") {
    ctx.fillStyle = `rgb(${base[0]}, ${base[1]}, ${base[2]})`;
    ctx.fillRect(0, 0, BASE_TILE_SIZE, BASE_TILE_SIZE);
    return finalise(canvas, id);
  }

  // ── Stairs — filled base colour + banding to suggest step treads + chevron ──
  if (k.category === "stairsUp" || k.category === "stairsDown") {
    const [r, g, b] = lumaJitter(base, seed, 8);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, 0, BASE_TILE_SIZE, BASE_TILE_SIZE);
    const steps = 6;
    const band = Math.round(BASE_TILE_SIZE / steps);
    ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    for (let i = 0; i < steps; i += 2) {
      ctx.fillRect(0, i * band, BASE_TILE_SIZE, Math.round(band * 0.55));
    }
    ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
    ctx.lineWidth = 3;
    const scx = BASE_TILE_SIZE / 2;
    const scy = BASE_TILE_SIZE / 2;
    const dir = k.category === "stairsUp" ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(scx - 14, scy + dir * 9);
    ctx.lineTo(scx, scy - dir * 9);
    ctx.lineTo(scx + 14, scy + dir * 9);
    ctx.stroke();
    return finalise(canvas, id);
  }

  // ── Rubble & debris — transparent overlay, scattered semi-opaque blobs ──
  if (k.category === "rubble" || k.category === "debris") {
    ctx.clearRect(0, 0, BASE_TILE_SIZE, BASE_TILE_SIZE);
    ctx.fillStyle = `rgba(${base[0]}, ${base[1]}, ${base[2]}, 0.55)`;
    const count = 4 + (seed % 5);
    for (let i = 0; i < count; i++) {
      const bx = (seed >>> (i * 5)) % BASE_TILE_SIZE;
      const by = (seed >>> (i * 5 + 7)) % BASE_TILE_SIZE;
      const bw = 8 + ((seed >>> (i * 3)) % 16);
      const bh = 6 + ((seed >>> (i * 3 + 5)) % 12);
      ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);
    }
    return finalise(canvas, id);
  }

  // Object stamps — drawn at cell center on a transparent background.
  if (k.category.startsWith("object")) {
    ctx.clearRect(0, 0, BASE_TILE_SIZE, BASE_TILE_SIZE);
    const cx = BASE_TILE_SIZE / 2;
    const cy = BASE_TILE_SIZE / 2;
    const [r, g, b] = base;
    const fill = `rgb(${r},${g},${b})`;
    const dark = `rgb(${Math.round(r * 0.6)},${Math.round(g * 0.6)},${Math.round(b * 0.6)})`;

    if (k.category === "objectChest") {
      // Rectangle body with a darker lid stripe
      ctx.fillStyle = fill;
      ctx.fillRect(cx - 32, cy - 22, 64, 44);
      ctx.fillStyle = dark;
      ctx.fillRect(cx - 32, cy - 22, 64, 18); // lid
      ctx.fillStyle = "rgb(200,170,80)";
      ctx.fillRect(cx - 6, cy - 6, 12, 10); // latch
    } else if (k.category === "objectBarrel") {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 34, 38, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 4;
      for (const oy of [-14, 0, 14]) {
        ctx.beginPath();
        ctx.ellipse(cx, cy + oy, 34, 12, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (k.category === "objectTable") {
      ctx.fillStyle = fill;
      ctx.fillRect(cx - 38, cy - 24, 76, 48);
      ctx.fillStyle = dark;
      for (const [tx, ty] of [[-34, -20], [30, -20], [-34, 16], [30, 16]] as [number, number][]) {
        ctx.fillRect(cx + tx, cy + ty, 8, 8); // legs
      }
    } else if (k.category === "objectStatue") {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 38);
      ctx.lineTo(cx + 28, cy);
      ctx.lineTo(cx + 18, cy + 36);
      ctx.lineTo(cx - 18, cy + 36);
      ctx.lineTo(cx - 28, cy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (k.category === "objectPillar") {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(cx, cy, 36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(cx, cy, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.fill();
    } else if (k.category === "objectBrazier") {
      // Tripod base
      ctx.strokeStyle = dark;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 8); ctx.lineTo(cx - 22, cy + 30);
      ctx.moveTo(cx, cy - 8); ctx.lineTo(cx + 22, cy + 30);
      ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 30);
      ctx.stroke();
      // Flame
      ctx.fillStyle = "rgb(220,140,30)";
      ctx.beginPath();
      ctx.arc(cx, cy - 18, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgb(255,210,60)";
      ctx.beginPath();
      ctx.arc(cx, cy - 22, 11, 0, Math.PI * 2);
      ctx.fill();
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
