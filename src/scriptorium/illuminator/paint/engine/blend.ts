import type { BrushBlend } from "./types";

/*
 * Per-pixel compositing of a colour at a coverage onto a straight RGBA pixel, written in place.
 * The separable modes and "colour" follow the W3C compositing spec: the blended colour replaces the
 * source colour in proportion to how much backdrop there is, then source-over does the rest.
 */

const multiply = (cb: number, cs: number): number => cb * cs;
const screen = (cb: number, cs: number): number => cb + cs - cb * cs;
const hardLight = (cb: number, cs: number): number => (cs <= 0.5 ? multiply(cb, 2 * cs) : screen(cb, 2 * cs - 1));
const overlay = (cb: number, cs: number): number => hardLight(cs, cb);
function softLight(cb: number, cs: number): number {
  if (cs <= 0.5) return cb - (1 - 2 * cs) * cb * (1 - cb);
  const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb);
  return cb + (2 * cs - 1) * (d - cb);
}

const lum = (r: number, g: number, b: number): number => 0.3 * r + 0.59 * g + 0.11 * b;

/** W3C SetLum: the colour moved to the given luminosity, clipped back into gamut. */
function setLum(r: number, g: number, b: number, l: number, out: number[]): void {
  const d = l - lum(r, g, b);
  let nr = r + d;
  let ng = g + d;
  let nb = b + d;
  const ll = lum(nr, ng, nb);
  const n = Math.min(nr, ng, nb);
  const x = Math.max(nr, ng, nb);
  if (n < 0) {
    nr = ll + ((nr - ll) * ll) / (ll - n);
    ng = ll + ((ng - ll) * ll) / (ll - n);
    nb = ll + ((nb - ll) * ll) / (ll - n);
  }
  if (x > 1) {
    nr = ll + ((nr - ll) * (1 - ll)) / (x - ll);
    ng = ll + ((ng - ll) * (1 - ll)) / (x - ll);
    nb = ll + ((nb - ll) * (1 - ll)) / (x - ll);
  }
  out[0] = nr;
  out[1] = ng;
  out[2] = nb;
}

/** The W3C "color" mode takes hue and saturation from the source: the source with the backdrop's luminosity. */
const scratch = [0, 0, 0];

type Separable = (cb: number, cs: number) => number;
const SEPARABLE: Partial<Record<BrushBlend, Separable>> = {
  multiply,
  screen,
  overlay,
  "soft-light": softLight,
};

/**
 * Composites (r, g, b) (0 to 255) at `coverage` (0 to 1) onto the pixel at `o` in `dst`.
 * "clear" lowers alpha and leaves colour alone; "behind" fills only what is not already opaque.
 */
export function blendPixel(
  dst: Uint8ClampedArray,
  o: number,
  blend: BrushBlend,
  r: number,
  g: number,
  b: number,
  coverage: number,
): void {
  if (coverage <= 0) return;
  const as = coverage > 1 ? 1 : coverage;
  const ad = dst[o + 3] / 255;

  if (blend === "clear") {
    dst[o + 3] = Math.round(dst[o + 3] * (1 - as));
    return;
  }

  let sr = r / 255;
  let sg = g / 255;
  let sb = b / 255;

  if (blend === "behind") {
    const ao = ad + as * (1 - ad);
    if (ao <= 0) return;
    const w = (as * (1 - ad)) / ao;
    dst[o] = Math.round(dst[o] * (1 - w) + r * w);
    dst[o + 1] = Math.round(dst[o + 1] * (1 - w) + g * w);
    dst[o + 2] = Math.round(dst[o + 2] * (1 - w) + b * w);
    dst[o + 3] = Math.round(ao * 255);
    return;
  }

  if (blend !== "normal" && ad > 0) {
    const cbr = dst[o] / 255;
    const cbg = dst[o + 1] / 255;
    const cbb = dst[o + 2] / 255;
    let mr: number;
    let mg: number;
    let mb: number;
    const fn = SEPARABLE[blend];
    if (fn) {
      mr = fn(cbr, sr);
      mg = fn(cbg, sg);
      mb = fn(cbb, sb);
    } else {
      setLum(sr, sg, sb, lum(cbr, cbg, cbb), scratch);
      mr = scratch[0] ?? 0;
      mg = scratch[1] ?? 0;
      mb = scratch[2] ?? 0;
    }
    sr = (1 - ad) * sr + ad * mr;
    sg = (1 - ad) * sg + ad * mg;
    sb = (1 - ad) * sb + ad * mb;
  }

  const ao = as + ad * (1 - as);
  if (ao <= 0) return;
  const wd = (ad * (1 - as)) / ao;
  const ws = as / ao;
  dst[o] = Math.round((dst[o] / 255 * wd + sr * ws) * 255);
  dst[o + 1] = Math.round((dst[o + 1] / 255 * wd + sg * ws) * 255);
  dst[o + 2] = Math.round((dst[o + 2] / 255 * wd + sb * ws) * 255);
  dst[o + 3] = Math.round(ao * 255);
}
