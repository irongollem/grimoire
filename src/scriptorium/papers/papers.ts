/*
 * The stock papers (#1181): a seamless colour surface and the grain (height) its tooth makes. Paint brushes
 * catch the grain; books and handouts lay the surface under a page. Art lives at
 * `public/assets/papers/<id>.webp` and `public/assets/paintbox/grains/<id>.webp`, and the runtime resolves
 * these paths through `artUrl()`.
 */

/** A sheet to paint or write on, or to set a page on. */
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
  /**
   * How much larger the surface tile is drawn than its 1024 px: papers with big features repeat less, fine ones
   * keep their detail. On a page the same factor sizes the tile in millimetres (see `paperSurfaceStyle`).
   */
  surfaceScale: number;
}

/** A stock paper: the painting's `Paper`, plus what laying it under a page needs. */
export interface StockPaper extends Paper {
  id: PaperId;
  /**
   * A white wash (0 to 1) laid over the surface on a page, never on a painting: the smallest that keeps the
   * darkest patches of the sheet at WCAG 4.5:1 behind the palest ink of any look (papers.test.ts reads it).
   */
  veil: number;
  /** The surface's mean colour after the veil, for everything on a page that tints from the page colour. */
  tint: string;
}

/** id, name, tooth, veil, tint. The ids are also the SQL check on `scriptorium_documents.paper_tone`. */
const STOCK_TABLE = [
  ["hot-press", "Hot-press", 0.2, 0, "#f6f6f6"],
  ["cold-press", "Cold-press", 0.6, 0, "#ebe8e1"],
  ["rough", "Rough", 1, 0, "#eae6e0"],
  ["laid", "Laid", 0.5, 0, "#e9e1d0"],
  ["rice-paper", "Rice paper", 0.45, 0, "#f2eee8"],
  ["parchment", "Parchment", 0.3, 0, "#eed4ab"],
  ["treasure-map", "Treasure map", 0.45, 0.15, "#e0b16f"],
  ["kraft", "Kraft", 0.35, 0.15, "#ceab86"],
  ["pastel-grey", "Pastel grey", 0.7, 0.15, "#b6b0aa"],
  ["linen-canvas", "Linen canvas", 0.75, 0, "#e0deda"],
  // The maintainer's own handmade scans (1254 px, tileable), not generated. On a page they keep the lift they
  // had as book papers before this module (a printed supplement's light grey, his references near #dcdad5), so a
  // book already on them looks the same; readability needs far less.
  ["grey", "Grey", 0.4, 0.46, "#dbd9d5"],
  ["warm-grey", "Warm grey", 0.4, 0.47, "#d9d5ce"],
] as const;

/** Every paper id, in the order a picker shows them. */
export const PAPER_IDS = STOCK_TABLE.map((row) => row[0]);
export type PaperId = (typeof STOCK_TABLE)[number][0];

/** The two scans are drawn as large as the 627 px tile they replaced (about 166 mm). */
const SURFACE_SCALE: Readonly<Partial<Record<PaperId, number>>> = {
  "treasure-map": 2.5,
  parchment: 2,
  kraft: 1.5,
  "pastel-grey": 1.25,
  rough: 1.25,
  grey: 1.9,
  "warm-grey": 1.9,
};

export const STOCK_PAPERS: readonly StockPaper[] = STOCK_TABLE.map(([id, name, tooth, veil, tint]) => ({
  id,
  name,
  surfacePath: `/assets/papers/${id}.webp`,
  grainId: id,
  tooth,
  surfaceScale: SURFACE_SCALE[id] ?? 1,
  veil,
  tint,
}));

export function paperById(id: PaperId): StockPaper {
  const paper = STOCK_PAPERS.find((p) => p.id === id);
  if (!paper) throw new Error(`Unknown paper ${id}`);
  return paper;
}

/** Each grain's art path by grain id. Grains are the papers' tooth, so they live with the papers. */
export const STOCK_GRAIN_PATHS: Readonly<Record<string, string>> = Object.fromEntries(
  STOCK_PAPERS.map((p) => [p.grainId, `/assets/paintbox/grains/${p.grainId}.webp`]),
);
