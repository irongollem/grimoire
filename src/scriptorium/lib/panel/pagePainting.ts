/*
 * Paint on this page (#1181): a transparent picture the size of the whole page, full bleed behind the text,
 * that the Illuminator opens on so the DM paints onto the page's own paper. This is the maths and the item's
 * shape; the upload is `uploadTransparentSheet`, the quota check and the opening are `usePagePainting`.
 */
import { sheetPresets, blankSheetRecipe, type SheetSize } from "@/scriptorium/lib/panel/newSheet";
import type { IlluminateSettings } from "@/scriptorium/illuminator/lib/treatment";
import { STOCK_PAPERS, type PaperId } from "@/scriptorium/papers/papers";
import type { ScriptoriumTheme } from "@/scriptorium/types";

/**
 * The page colour each look prints on when the book has no paper of its own (`--sc-page-bg` in
 * `styles/theme-*.css`). Kept here because a stylesheet's custom property cannot be read in Node; the test
 * below names every look so a new one cannot be forgotten.
 */
export const LOOK_PAGE_COLOURS: Readonly<Record<ScriptoriumTheme, string>> = {
  grimoire: "#f3ead6",
  onednd2024: "#f9f6ef",
  phb2014: "#eeeadf",
  letter: "#f3e6c8",
  notice: "#ece2cc",
  journal: "#fbf7ec",
  plain: "#f9f6ef",
};

/** A look's page colour is only worth matching to a paper when the two are this close (the RGB distance, 0 to 441). */
const NEAR_ENOUGH = 40;

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * The paper a page painting is made on, so its brushes catch the grain of the sheet underneath: the book's own
 * paper when it has one, else the stock paper whose mean colour is closest to the look's page, else none (a
 * look whose page matches no paper, where a grainless brush is more honest than the wrong grain).
 */
export function pagePaintingPaper(paperTone: PaperId | null, theme: ScriptoriumTheme | null): PaperId | null {
  if (paperTone) return paperTone;
  if (!theme) return null;
  const page = rgb(LOOK_PAGE_COLOURS[theme]);
  let best: { id: PaperId; distance: number } | null = null;
  for (const paper of STOCK_PAPERS) {
    const tint = rgb(paper.tint);
    const distance = Math.hypot(page[0] - tint[0], page[1] - tint[1], page[2] - tint[2]);
    if (!best || distance < best.distance) best = { id: paper.id, distance };
  }
  return best && best.distance <= NEAR_ENOUGH ? best.id : null;
}

/** The page at the size Blank sheet's "Full page" is: its own shape, sharp at print, under the bake cap. */
export function pagePaintingSize(pageAspect: number): SheetSize {
  const full = sheetPresets(pageAspect)[0];
  if (!full) throw new Error("No full page size.");
  return { width: full.width, height: full.height };
}

/** The recipe of a page painting: one empty paint step on the paper. */
export function pagePaintingRecipe(paper: PaperId | null, size: SheetSize, seed: number): IlluminateSettings {
  return blankSheetRecipe(paper, size, seed);
}

/** What the art item carries beyond its `src`: the recipe, full bleed, printed into the paper, at full strength. */
export function pagePaintingProps(url: string, recipe: IlluminateSettings, bakedFor: string): Record<string, unknown> {
  return {
    original: url,
    illuminate: recipe,
    bakedFor,
    fill: "page",
    blend: "paper",
    // Art behind the text is muted to 40% unless told otherwise; a painting is shown as painted.
    opacity: 100,
    painting: 1,
  };
}

/** The item's place: behind the text. Its position is ignored while it fills the page. */
export const PAGE_PAINTING_PLACEMENT = { z: "under", x: 0, y: 0, width: 100 } as const;
