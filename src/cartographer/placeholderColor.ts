// Small colour helpers shared by the hazard/feature glyph placeholders
// (hazardPlaceholders.ts, featurePlaceholders.ts). Kept separate from
// placeholderTile.ts's own lumaJitter/clamp helpers because those exist for a
// different purpose (seeded variance across many repeated background tiles);
// glyphs are single canonical icons and never need per-instance jitter.

export type RgbColor = readonly [number, number, number];

export function rgbStr(c: RgbColor): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function darken(c: RgbColor, factor: number): string {
  return `rgb(${Math.round(c[0] * factor)},${Math.round(c[1] * factor)},${Math.round(c[2] * factor)})`;
}

export function lighten(c: RgbColor, amount: number): string {
  return `rgb(${Math.min(255, c[0] + amount)},${Math.min(255, c[1] + amount)},${Math.min(255, c[2] + amount)})`;
}
