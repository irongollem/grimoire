import {
  BURDEN_CELL,
  CELL_HEIGHT,
  CELL_WIDTH,
  OUTFIT_CELL,
  parseDollSheets,
  type CellShift,
  type DollBurden,
  type DollCellIndex,
  type DollLayout,
  type DollOutfit,
  type DollSheetKey,
  type DollTemplateSize,
} from "@edge-shared/paperDoll/types.ts";
import { DOLL_TEMPLATE_LAYOUTS, DOLL_TEMPLATE_SHEETS } from "@/data/dollTemplates";

export interface DollArt {
  sheets: Record<DollSheetKey, string>;
  layout: DollLayout;
  source: "character" | "species" | "template";
}

/**
 * The art a doll is drawn from: the character's own, else its species', else
 * the size template. Whole-doll fallback, never per sheet: an outfit's drift
 * correction is measured against its own sheets.
 */
export function pickDollArt(character: unknown, species: unknown, size: DollTemplateSize): DollArt {
  const own = parseDollSheets(character);
  if (own) return { sheets: own.sheets, layout: own.layout, source: "character" };
  const shared = parseDollSheets(species);
  if (shared) return { sheets: shared.sheets, layout: shared.layout, source: "species" };
  return { sheets: DOLL_TEMPLATE_SHEETS[size], layout: DOLL_TEMPLATE_LAYOUTS[size], source: "template" };
}

/**
 * One figure of one sheet: the columns `clip.x0..clip.x1` around its cell (cell
 * pixels, so x0 may be negative and x1 past 512, where the sheet's cuts fell
 * in the gap beside the cell), moved by `shift` into the doll's frame.
 */
export interface DollPicture {
  url: string;
  cell: DollCellIndex;
  clip: { x0: number; x1: number };
  shift: CellShift;
}

const NO_SHIFT: CellShift = { dx: 0, dy: 0 };

function clipOf(art: DollArt, sheet: DollSheetKey, cell: DollCellIndex): DollPicture["clip"] {
  const [left, right] = art.layout.cuts[sheet];
  const origin = cell * CELL_WIDTH;
  const x0 = cell === 0 ? 0 : cell === 1 ? left : right;
  const x1 = cell === 0 ? left : cell === 1 ? right : 3 * CELL_WIDTH;
  return { x0: x0 - origin, x1: x1 - origin };
}

/** The figure in the outfit it wears, in the underclothes cell's frame. */
export function outfitPicture(art: DollArt, outfit: DollOutfit): DollPicture {
  const { sheet, cell } = OUTFIT_CELL[outfit];
  return { url: art.sheets[sheet], cell, clip: clipOf(art, sheet, cell), shift: art.layout.figureShift[outfit] };
}

/** The carry-weight picture: the outfit figure when unencumbered, else a burden cell. */
export function burdenPicture(art: DollArt, outfit: DollOutfit, burden: DollBurden | "unencumbered"): DollPicture {
  if (burden === "unencumbered") return outfitPicture(art, outfit);
  const { sheet, cell } = BURDEN_CELL[burden];
  // Burden pictures stand alone, so they are never shifted into a frame.
  return { url: art.sheets[sheet], cell, clip: clipOf(art, sheet, cell), shift: NO_SHIFT };
}

/** Inline styles for the clip window and the sheet inside it, both relative to a one-cell box. */
export function pictureStyles(picture: DollPicture): { window: Record<string, string>; image: Record<string, string> } {
  const { x0, x1 } = picture.clip;
  const w = x1 - x0;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return {
    window: { left: pct(x0, CELL_WIDTH), width: pct(w, CELL_WIDTH) },
    image: { width: pct(3 * CELL_WIDTH, w), left: pct(-(picture.cell * CELL_WIDTH + x0), w) },
  };
}

/** CSS translate for a box the size of one cell. */
export function shiftTransform(shift: CellShift): string {
  return `translate(${(shift.dx / CELL_WIDTH) * 100}%, ${(shift.dy / CELL_HEIGHT) * 100}%)`;
}
