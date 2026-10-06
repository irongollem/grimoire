/**
 * Does an optimised glyph still look like the original? Render both black on
 * white and count the pixels that differ.
 *
 * "Differ" means a grey-level gap above `LEVEL_TOLERANCE`, so the faint
 * anti-aliasing shimmer that any re-expressed outline produces on its edge
 * pixels is not counted, but a moved edge, a closed-up counter or a lost speck
 * is. The CLI's `compare` and `optimize` commands report the worst glyph per set
 * and fail past `MAX_DIFF_PIXELS` at the large size.
 */
import sharp from "sharp";

export const COMPARE_SIZES = [24, 96] as const;

/** Grey levels (of 255) a pixel may move before it counts as different. */
export const LEVEL_TOLERANCE = 32;

/** "A handful of anti-aliasing pixels" at 96px, as a ceiling. */
export const MAX_DIFF_PIXELS = 12;

function page(inner: string, size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" color="#000"><rect width="100%" height="100%" fill="#fff"/>${inner}</svg>`;
}

async function render(inner: string, size: number): Promise<Buffer> {
  return sharp(Buffer.from(page(inner, size))).flatten({ background: "#fff" }).greyscale().raw().toBuffer();
}

export interface GlyphDiff {
  /** Pixels whose grey level moved by more than the tolerance. */
  pixels: number;
  /** Largest grey-level move of any pixel. */
  maxLevel: number;
}

export async function diffGlyph(before: string, after: string, size: number): Promise<GlyphDiff> {
  const [a, b] = await Promise.all([render(before, size), render(after, size)]);
  let pixels = 0;
  let maxLevel = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > maxLevel) maxLevel = d;
    if (d > LEVEL_TOLERANCE) pixels++;
  }
  return { pixels, maxLevel };
}

export interface SetComparison {
  /** The glyph with the most differing pixels at each size. */
  worst: Record<number, { name: string } & GlyphDiff>;
  /** True when no glyph breaks `MAX_DIFF_PIXELS` at the largest size. */
  ok: boolean;
}

export async function compareSets(
  before: ReadonlyArray<readonly [string, string]>,
  after: ReadonlyArray<readonly [string, string]>,
): Promise<SetComparison> {
  // Walk the `after` side so a set that was split in two can be compared half
  // at a time against the whole original.
  const beforeByName = new Map(before);
  const worst: SetComparison["worst"] = {};
  for (const size of COMPARE_SIZES) worst[size] = { name: "", pixels: -1, maxLevel: 0 };
  for (const [name, other] of after) {
    const inner = beforeByName.get(name);
    if (inner === undefined) throw new Error(`glyph '${name}' has no original to compare against`);
    for (const size of COMPARE_SIZES) {
      const d = await diffGlyph(inner, other, size);
      if (d.pixels > worst[size].pixels) worst[size] = { name, ...d };
    }
  }
  const largest = Math.max(...COMPARE_SIZES);
  return { worst, ok: worst[largest].pixels <= MAX_DIFF_PIXELS };
}
