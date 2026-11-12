/*
 * The stock papers (#1181): a seamless colour surface and the grain (height) its tooth makes. Paint brushes
 * catch the grain; books and handouts can lay the surface under a page. Art lives at
 * `public/assets/papers/<id>.webp` and `public/assets/paintbox/grains/<id>.webp`, and the runtime resolves
 * these paths through `artUrl()`.
 */

/** A sheet to paint or write on. */
export interface Paper {
  id: string;
  name: string;
  surfacePath: string;
  grainId: string;
  /**
   * How rough the sheet is (0 to 1). Every grain image is stretched to the full range, so this scales a brush's
   * grain depth on this paper: hot-press barely bites, rough paper breaks a dry brush up.
   */
  tooth: number;
}

/** id, name, tooth. */
const PAPERS: readonly (readonly [string, string, number])[] = [
  ["hot-press", "Hot-press", 0.2],
  ["cold-press", "Cold-press", 0.6],
  ["rough", "Rough", 1],
  ["laid", "Laid", 0.5],
  ["rice-paper", "Rice paper", 0.45],
  ["parchment", "Parchment", 0.3],
  ["treasure-map", "Treasure map", 0.45],
  ["kraft", "Kraft", 0.35],
  ["pastel-grey", "Pastel grey", 0.7],
  ["linen-canvas", "Linen canvas", 0.75],
];

export const STOCK_PAPERS: readonly Paper[] = PAPERS.map(([id, name, tooth]) => ({
  id,
  name,
  surfacePath: `/assets/papers/${id}.webp`,
  grainId: id,
  tooth,
}));

/** Each grain's art path by grain id. Grains are the papers' tooth, so they live with the papers. */
export const STOCK_GRAIN_PATHS: Readonly<Record<string, string>> = Object.fromEntries(
  STOCK_PAPERS.map((p) => [p.grainId, `/assets/paintbox/grains/${p.grainId}.webp`]),
);
