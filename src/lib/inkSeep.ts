import { WATERCOLOR_COUNT, watercolorSrc } from "@/data/watercolorAssets";

/**
 * Placement for the Vellum themes' ink seep (`.ink-seep` in vellum.css): which
 * of the watercolour assets to paint, where, how large, at what angle and how
 * strong.
 *
 * Seeded rather than random so a component keeps the same splotch across
 * re-renders and reloads (a stain that jumps on every keystroke reads as a
 * glitch, not as paper), while different screens get different ones. Seed it
 * with something that identifies the place, such as an empty state's title.
 *
 * Returned as custom properties for a `:style` binding; the CSS only reads
 * them under `[data-theme^="vellum"]`, so other themes ignore them.
 */
export function inkSeepStyle(seed: string): Record<string, string> {
  const rand = mulberry32(fnv1a(seed));
  const variant = 1 + Math.floor(rand() * WATERCOLOR_COUNT);
  const x = 15 + rand() * 70; // % across, kept off the extreme edges
  const y = 10 + rand() * 60; // % down
  const size = 12 + rand() * 9; // rem
  const rotation = Math.floor(rand() * 360);
  const flip = rand() < 0.5 ? -1 : 1;
  const alpha = 0.15 + rand() * 0.15; // 15–30% on parchment; vellum.css scales it for Lamplight
  return {
    "--ink-src": `url("${watercolorSrc(variant)}")`,
    "--ink-x": `${x.toFixed(1)}%`,
    "--ink-y": `${y.toFixed(1)}%`,
    "--ink-size": `${size.toFixed(1)}rem`,
    "--ink-rot": `${rotation}deg`,
    "--ink-flip": String(flip),
    "--ink-alpha": alpha.toFixed(3),
  };
}

/** FNV-1a, 32-bit: a stable string hash for seeding. */
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a tiny seeded PRNG, uniform in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
