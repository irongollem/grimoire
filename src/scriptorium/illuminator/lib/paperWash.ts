/*
 * The paper wash (#1176): a painting runs to every edge of the page and the
 * text sits on a brushed wash of paper painted over it. Wherever the brush went
 * the picture is erased, so the page's paper shows through; faint light and dark
 * streaks are drawn into the erased area so the wash shows brushwork.
 *
 * Ported from the overseer's browser prototype. The wash is built of broad dry
 * brush strokes, each drawn pixel by pixel: across its width the paint lies in
 * the streaks of the bristles, along its length it runs out, the thin streaks
 * first, so the end breaks up ragged. The edge is made of sweeps that start
 * inside and run out past it by different amounts.
 *
 * Deterministic from step.seed (no Math.random) and sized as fractions of the
 * picture, so a thumbnail preview, the full bake in a Worker and the print redraw
 * all draw the same wash. Pure typed arrays, no canvas: it runs anywhere.
 */
import type { WashSide, WashStep } from "./treatment";

/** Seeded random (mulberry32). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1-D noise over 0 to 1. */
function noise1(r: () => number, n: number): (x: number) => number {
  const pts = Array.from({ length: n + 1 }, () => r());
  return (x) => {
    const i = Math.floor(x * n);
    const f = x * n - i;
    const a = pts[Math.max(0, Math.min(n, i))];
    const b = pts[Math.max(0, Math.min(n, i + 1))];
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };
}

interface Bitmap { data: Uint8ClampedArray; L: number; W: number }

/**
 * One broad dry-brush stroke as an alpha bitmap, L long and W wide.
 * `streak` is how strongly the bristle rows differ (a wet brush is even) and
 * `runScale` how late along its length the paint runs out.
 */
function strokeBitmap(r: () => number, len: number, width: number, load: number, streak: number, runScale: number): Bitmap {
  const L = Math.max(4, Math.round(len));
  const W = Math.max(4, Math.round(width));
  const data = new Uint8ClampedArray(L * W);
  // Bristles clump: the paint per row follows coarse noise (bands a few pixels wide) plus a little fine noise.
  const clump = noise1(r, Math.max(3, Math.round(W / 9)));
  const fine = noise1(r, Math.max(6, Math.round(W / 3)));
  const rows = Array.from({ length: W }, (_, y) => 0.75 * clump(y / W) + 0.25 * fine(y / W));
  const rowNoise = noise1(r, Math.max(3, Math.round(W / 14)));
  const endJitter = noise1(r, 8); // the run-out differs row to row
  const lump = noise1(r, 12);
  const sideA = noise1(r, Math.max(4, Math.round(L / 25)));
  const sideB = noise1(r, Math.max(4, Math.round(L / 25)));
  for (let y = 0; y < W; y++) {
    const across = Math.abs(y / (W - 1) - 0.5) * 2; // 0 middle, 1 edge of the stroke
    const carry = 0.5 + (0.55 * rows[y] + 0.45 * rowNoise(y / W) - 0.5) * streak;
    const runOut = (0.5 + 0.5 * endJitter(y / W)) * (1 - 0.12 * across * across) * runScale;
    for (let x = 0; x < L; x++) {
      const t = x / L;
      const start = Math.min(1, x / (W * 0.4)); // a soft, rounded start
      const dry = (t - runOut * 0.6) / (runOut * 0.5); // above 0 once the paint runs low
      const sideReach = 0.7 + 0.3 * (y < W / 2 ? sideA(t) : sideB(t)); // ragged long edges
      if (across > sideReach) continue;
      let a = carry - Math.max(0, dry) * (0.8 + 0.4 * lump(t)) + 0.35 - across * across * 0.5;
      a = Math.max(0, Math.min(1, a * 2.2)) * start * load;
      data[y * L + x] = Math.round(a * 255);
    }
  }
  return { data, L, W };
}

/** Where a stroke lands: its start, its angle, and a call for every pixel it covers. */
function blit(bmp: Bitmap, U: number, V: number, x0: number, y0: number, angle: number, paint: (idx: number, alpha: number) => void) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const half = bmp.W / 2;
  const xs = [0, bmp.L, 0, bmp.L];
  const ys = [-half, -half, half, half];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < 4; i++) {
    const px = x0 + xs[i] * cos - ys[i] * sin;
    const py = y0 + xs[i] * sin + ys[i] * cos;
    minX = Math.min(minX, px); maxX = Math.max(maxX, px);
    minY = Math.min(minY, py); maxY = Math.max(maxY, py);
  }
  const ax = Math.max(0, Math.floor(minX));
  const bx = Math.min(U - 1, Math.ceil(maxX));
  const ay = Math.max(0, Math.floor(minY));
  const by = Math.min(V - 1, Math.ceil(maxY));
  for (let py = ay; py <= by; py++) {
    for (let px = ax; px <= bx; px++) {
      const dx = px - x0;
      const dy = py - y0;
      const sx = Math.floor(dx * cos + dy * sin);
      const sy = Math.floor(-dx * sin + dy * cos + half);
      if (sx < 0 || sy < 0 || sx >= bmp.L || sy >= bmp.W) continue;
      const a = bmp.data[sy * bmp.L + sx];
      if (a > 0) paint(py * U + px, a / 255);
    }
  }
}

export interface WashLayers {
  w: number;
  h: number;
  /** 0 to 255 per pixel: how much of the picture the paper covers. */
  erase: Uint8ClampedArray;
  /** The brush streaks left in the erased area: their alpha, and their tone from 0 (dark) to 255 (light). */
  streakAlpha: Uint8ClampedArray;
  streakTone: Uint8ClampedArray;
}

const EDGE_WANDER = 0.2;

/** The wash as per-pixel layers, in the picture's own frame. Everything is a fraction of the picture, so size does not change the look. */
export function washLayers(w: number, h: number, step: WashStep): WashLayers {
  const horizontal = step.from === "left" || step.from === "right";
  // The local frame: u runs from the side the paper comes in from, v along that side.
  const U = horizontal ? w : h;
  const V = horizontal ? h : w;
  const m = Math.min(w, h);
  const brush = m * (0.03 + 0.08 * step.brush);
  const R = m * (0.09 + 0.07 * step.brush); // how far a sweep runs past the edge
  // A dry brush streaks hard and runs out early; a wet one is even and carries on.
  const streak = 0.4 + step.dry * 0.9;
  const runScale = 1.5 - step.dry * 0.77;

  const erase = new Uint8ClampedArray(U * V);
  const sAlpha = new Uint8ClampedArray(U * V);
  const sTone = new Uint8ClampedArray(U * V);
  const r = rng(step.seed);
  const edgeAt = noise1(r, 5);
  const topAt = noise1(r, 5);
  const lobes = noise1(r, 14);
  const boundary = (v: number) => U * (step.reach + (edgeAt(v / V) - 0.5) * EDGE_WANDER + (lobes(v / V) - 0.5) * 0.06);
  // Where the wash starts along the side: the top of the picture stays picture.
  const top = V * 0.153;
  const topWander = V * 0.047;
  const topLine = (u: number) => top + (topAt(u / U) - 0.5) * topWander;
  // Strokes start well inside the edge, but never so close to the side that it is left uncovered.
  const inner = (v: number, k: number) => Math.max(boundary(v) - k * R, boundary(v) * 0.3);

  const eraseWith = (idx: number, a: number) => {
    const cur = erase[idx] / 255;
    erase[idx] = Math.round((cur + a * (1 - cur)) * 255);
  };

  // Solid paper well inside, its own edge hidden under the sweeps.
  for (let v = 0; v < V; v++) {
    const uMax = Math.min(U, Math.floor(inner(v, 0.9)));
    for (let u = 0; u < uMax; u++) {
      if (v >= topLine(u) + R * 0.6) erase[v * U + u] = 255;
    }
  }

  // Side edge: sweeps out past it.
  for (let layer = 0; layer < 2; layer++) {
    for (let v = top; v < V + brush; v += brush * (0.3 + r() * 0.2)) {
      const len = R * (0.9 + r() * 1.4);
      const width = brush * (0.7 + r() * 0.9);
      const x0 = inner(v, 1.3) + layer * m * 0.02;
      const bmp = strokeBitmap(r, len, width, layer ? 0.7 : 1, streak, runScale);
      const angle = (r() - 0.5) * 0.45 + (r() - 0.5) * 0.05;
      blit(bmp, U, V, x0, v, angle, eraseWith);
    }
  }
  // Top edge: sweeps pulled sideways along it, each sitting a little higher or lower.
  for (let layer = 0; layer < 3; layer++) {
    for (let u = -R; u < boundary(top) - R * 0.6; u += R * (0.5 + r() * 0.5)) {
      const len = R * (1.6 + r() * 1.6);
      const v = topLine(u) + brush * (0.1 + r() * 0.5) + layer * brush * 0.45;
      const width = brush * (0.8 + r() * 0.7);
      const bmp = strokeBitmap(r, len, width, layer ? 0.8 : 1, streak, runScale);
      const angle = (r() - 0.5) * 0.25 + (r() - 0.5) * 0.05;
      blit(bmp, U, V, u, v, angle, eraseWith);
    }
  }
  // Broad sweeps inside the wash, a shade lighter and a shade darker than the paper, so it shows brushwork.
  for (let i = 0; i < 40; i++) {
    const v = top + r() * (V - top);
    const u = -brush + r() * Math.max(0, inner(v, 1.5));
    const bmp = strokeBitmap(r, R * (2 + r() * 2.5), brush * (1 + r() * 1.2), 0.5, streak, runScale);
    const tone = i % 2 ? 255 : 0;
    const angle = (r() - 0.5) * 0.5;
    blit(bmp, U, V, u, v, angle, (idx, a) => {
      const s = a * 0.3;
      const cur = sAlpha[idx] / 255;
      const out = s + cur * (1 - s);
      sTone[idx] = Math.round((tone * s + sTone[idx] * cur * (1 - s)) / out);
      sAlpha[idx] = Math.round(out * 255);
    });
  }

  return fromLocal(step.from, w, h, erase, sAlpha, sTone);
}

/** Put the local frame's layers back into the picture's frame. */
function fromLocal(from: WashSide, w: number, h: number, erase: Uint8ClampedArray, a: Uint8ClampedArray, t: Uint8ClampedArray): WashLayers {
  if (from === "left") return { w, h, erase, streakAlpha: a, streakTone: t };
  const outE = new Uint8ClampedArray(w * h);
  const outA = new Uint8ClampedArray(w * h);
  const outT = new Uint8ClampedArray(w * h);
  const horizontal = from === "right";
  const U = horizontal ? w : h;
  const V = horizontal ? h : w;
  for (let v = 0; v < V; v++) {
    for (let u = 0; u < U; u++) {
      let x: number, y: number;
      if (from === "right") { x = w - 1 - u; y = v; }
      else if (from === "top") { x = v; y = u; }
      else { x = v; y = h - 1 - u; }
      const to = y * w + x;
      const src = v * U + u;
      outE[to] = erase[src];
      outA[to] = a[src];
      outT[to] = t[src];
    }
  }
  return { w, h, erase: outE, streakAlpha: outA, streakTone: outT };
}

/** The brush streaks' two tones, as the prototype's light and dark paper. */
const LIGHT = [244, 243, 239] as const;
const DARK = [207, 205, 198] as const;
const STREAK_OPACITY = 0.7;

/** Erase the wash out of the canvas and lay the brush streaks over the paper it uncovers. */
export function applyPaperWash(ctx: CanvasRenderingContext2D, w: number, h: number, step: WashStep): void {
  const layers = washLayers(w, h, step);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    let a = (d[o + 3] / 255) * (1 - layers.erase[i] / 255);
    const sa = (layers.streakAlpha[i] / 255) * STREAK_OPACITY;
    if (sa > 0) {
      const k = layers.streakTone[i] / 255;
      const out = sa + a * (1 - sa);
      for (let c = 0; c < 3; c++) {
        const paint = DARK[c] + (LIGHT[c] - DARK[c]) * k;
        d[o + c] = Math.round((paint * sa + d[o + c] * a * (1 - sa)) / out);
      }
      a = out;
    }
    d[o + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
}
