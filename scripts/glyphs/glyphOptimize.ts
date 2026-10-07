/**
 * Shrink a glyph's inner markup without changing how it draws.
 *
 * potrace writes integer coordinates in a x10 space inside two nested,
 * transformed groups, one `c` curve per few pixels of outline, with newlines
 * throughout. svgo re-expresses every segment in its shortest form (relative,
 * shorthand, no redundant zeros) and drops the empty wrappers. It must not
 * simplify the shape, so the lossy-by-design path steps (arc fitting, removal
 * of "useless" short segments) are switched off: each of them moved edges by a
 * visible fraction of a pixel on its own.
 *
 * Rounding is the other risk. Baking the transforms into the path at one
 * decimal place of the 100-unit box is the smallest form (about half the
 * original) but its error accumulates along a long outline, and on some glyphs
 * it shows. So there is a ladder of candidates, smallest first, and each glyph
 * takes the first one that `glyphCompare` finds visually identical at every
 * size we draw; the last rung keeps potrace's own integer coordinates and
 * transforms, which cannot differ at all.
 */
import { optimize } from "svgo";
import { COMPARE_SIZES, diffGlyph, MAX_DIFF_PIXELS } from "./glyphCompare";

const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">';
const CLOSE = "</svg>";

interface Rung {
  name: string;
  floatPrecision: number;
  applyTransforms: boolean;
  straightCurves: boolean;
}

export const OPTIMIZE_LADDER: readonly Rung[] = [
  { name: "baked, 1 decimal", floatPrecision: 1, applyTransforms: true, straightCurves: true },
  { name: "baked, 1 decimal, curves kept", floatPrecision: 1, applyTransforms: true, straightCurves: false },
  { name: "potrace units, lossless", floatPrecision: 0, applyTransforms: false, straightCurves: true },
];

export function runRung(inner: string, rung: Rung): string {
  // Typed loosely on purpose: svgo's declarations type `makeArcs` as its
  // options object, but the plugin documents (and honours) `false` to turn arc
  // fitting off, which is the setting we need.
  const convertPathData: Record<string, unknown> = {
    floatPrecision: rung.floatPrecision,
    applyTransforms: rung.applyTransforms,
    transformPrecision: 5,
    straightCurves: rung.straightCurves,
    makeArcs: false,
    removeUseless: false,
  };
  const { data } = optimize(`${OPEN}${inner}${CLOSE}`, {
    // One pass is enough; multipass is minutes per set on traced outlines.
    multipass: false,
    plugins: [{ name: "preset-default", params: { overrides: { convertPathData } } }],
  });
  if (!data.startsWith(OPEN) || !data.endsWith(CLOSE)) {
    throw new Error("svgo changed the wrapper element; cannot unwrap the optimised glyph");
  }
  return data.slice(OPEN.length, data.length - CLOSE.length);
}

export interface OptimizedGlyph {
  markup: string;
  /** Which rung produced it, or "unchanged" when nothing both shrank and matched. */
  rung: string;
}

/** The smallest candidate that renders the same as `inner`; `inner` if none does. */
export async function optimizeGlyph(inner: string): Promise<OptimizedGlyph> {
  for (const rung of OPTIMIZE_LADDER) {
    const candidate = runRung(inner, rung);
    if (candidate.length >= inner.length) continue;
    let same = true;
    for (const size of COMPARE_SIZES) {
      if ((await diffGlyph(inner, candidate, size)).pixels > MAX_DIFF_PIXELS) same = false;
    }
    if (same) return { markup: candidate, rung: rung.name };
  }
  return { markup: inner, rung: "unchanged" };
}
