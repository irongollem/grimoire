/**
 * The paper doll's data contract (#975), shared by the generator
 * (generate-character-doll), the doll script (templates and species dolls), and
 * the app (inventory doll, carry-weight figure and battle-map token). Pure TS
 * with no Deno or Vue imports, so the browser reads it through the
 * @edge-shared alias.
 *
 * A doll is three sprite sheets of three 512x1024 cells each, one figure per
 * cell:
 *
 *   garb    underclothes | clothes             | robes
 *   armour  light        | medium              | heavy
 *   burden  encumbered   | heavily encumbered  | over-encumbered
 *
 * The doll shows ONE outfit cell, chosen from what is worn; worn items are
 * shown by the slot buttons, never drawn on the figure (layered kit pieces
 * were tried and dropped: placing them per character needs judgement the
 * alpha mask cannot supply). The carry-weight figure shows a burden cell, or
 * the outfit figure when the character is unencumbered.
 */

export const SHEET_WIDTH = 1536;
export const SHEET_HEIGHT = 1024;
export const CELL_WIDTH = 512;
export const CELL_HEIGHT = 1024;

export const DOLL_SHEET_KEYS = ["garb", "armour", "burden"] as const;
export type DollSheetKey = (typeof DOLL_SHEET_KEYS)[number];

export type DollCellIndex = 0 | 1 | 2;

export interface DollCell {
  sheet: DollSheetKey;
  cell: DollCellIndex;
}

/** What the figure is wearing: one cell of the garb or armour sheet. */
export const DOLL_OUTFITS = [
  "underclothes",
  "clothes",
  "robes",
  "armour_light",
  "armour_medium",
  "armour_heavy",
] as const;
export type DollOutfit = (typeof DOLL_OUTFITS)[number];

export const OUTFIT_CELL: Record<DollOutfit, DollCell> = {
  underclothes: { sheet: "garb", cell: 0 },
  clothes: { sheet: "garb", cell: 1 },
  robes: { sheet: "garb", cell: 2 },
  armour_light: { sheet: "armour", cell: 0 },
  armour_medium: { sheet: "armour", cell: 1 },
  armour_heavy: { sheet: "armour", cell: 2 },
};

/** A burden band that has its own picture; unencumbered shows the outfit figure. */
export type DollBurden = "encumbered" | "heavily_encumbered" | "over_encumbered";

export const BURDEN_CELL: Record<DollBurden, DollCell> = {
  encumbered: { sheet: "burden", cell: 0 },
  heavily_encumbered: { sheet: "burden", cell: 1 },
  over_encumbered: { sheet: "burden", cell: 2 },
};

/** A box in cell pixels (0..CELL_WIDTH, 0..CELL_HEIGHT), inclusive edges. */
export interface CellBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Where the figure's body is, measured from the underclothes cell's alpha. */
export interface DollAnatomy {
  /** Crown (y0) to the narrowest row of the neck (y1), hair included. */
  head: CellBox;
  /** The widest row just below the neck. */
  shoulders: { x0: number; x1: number; y: number };
  /** The lowest opaque row: the soles. */
  feetY: number;
  /** Horizontal centre of the crown (the topmost rows): the figure's axis. */
  centerX: number;
}

/** A translation in cell pixels. */
export interface CellShift {
  dx: number;
  dy: number;
}

export interface DollLayout {
  /** Measured on the underclothes cell: the frame every outfit is drawn in. */
  anatomy: DollAnatomy;
  /**
   * Moves each outfit cell's figure into the underclothes cell's frame. The
   * model honours the grid vertically but drifts each figure sideways (about
   * 14 px per cell on a medium sheet), so without this the doll jumps sideways
   * when the outfit changes and the slot buttons miss the body.
   */
  figureShift: Record<DollOutfit, CellShift>;
  /**
   * Where each sheet is cut between its cells, as two sheet x positions (the
   * left|centre and centre|right boundaries). Found in the empty gap between
   * the figures rather than at 512 and 1024: a laden figure's pile can start
   * 40 px inside its neighbour's cell, and a fixed cut would clip it.
   */
  cuts: Record<DollSheetKey, [number, number]>;
}

/** The stored value of `party_members.doll` and `library_species.doll`. */
export interface DollSheets {
  version: 1;
  /** Public URL of each sheet. */
  sheets: Record<DollSheetKey, string>;
  layout: DollLayout;
  /** The image model that drew it, e.g. "gpt-image-2.5-sunburst". */
  model: string;
  /** ISO timestamp. */
  generatedAt: string;
}

/** The size template a species of this size starts from. */
export type DollTemplateSize = "small" | "medium";

/** Use the small template for lowercase tiny/small sizes; all other or missing sizes use medium. */
export function templateSizeFor(speciesSize: string | null | undefined): DollTemplateSize {
  return speciesSize === "tiny" || speciesSize === "small" ? "small" : "medium";
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Copy finite box coordinates, or return null; coordinate order and cell bounds are not checked. */
function parseBox(v: unknown): CellBox | null {
  if (!isRecord(v) || !isNum(v.x0) || !isNum(v.y0) || !isNum(v.x1) || !isNum(v.y1)) return null;
  return { x0: v.x0, y0: v.y0, x1: v.x1, y1: v.y1 };
}

/**
 * Reads a stored doll, or null when the value is absent or not a complete
 * version-1 doll. A malformed value is treated as no doll at all (the doll
 * falls back to the species, then the template) rather than half-drawn.
 * Checks shape and finite coordinates, not geometric bounds, URL validity,
 * model support, or timestamp formatting.
 */
export function parseDollSheets(value: unknown): DollSheets | null {
  if (!isRecord(value) || value.version !== 1) return null;
  const { sheets, layout, model, generatedAt } = value;
  if (!isRecord(sheets) || !isRecord(layout) || typeof model !== "string" || typeof generatedAt !== "string") return null;

  const urls = {} as Record<DollSheetKey, string>;
  for (const key of DOLL_SHEET_KEYS) {
    const url = sheets[key];
    if (typeof url !== "string" || !url) return null;
    urls[key] = url;
  }

  const { anatomy, figureShift } = layout;
  if (!isRecord(anatomy) || !isRecord(figureShift)) return null;
  const head = parseBox(anatomy.head);
  const shoulders = anatomy.shoulders;
  if (!head || !isRecord(shoulders) || !isNum(shoulders.x0) || !isNum(shoulders.x1) || !isNum(shoulders.y)) return null;
  if (!isNum(anatomy.feetY) || !isNum(anatomy.centerX)) return null;

  const shifts = {} as Record<DollOutfit, CellShift>;
  for (const outfit of DOLL_OUTFITS) {
    const shift = figureShift[outfit];
    if (!isRecord(shift) || !isNum(shift.dx) || !isNum(shift.dy)) return null;
    shifts[outfit] = { dx: shift.dx, dy: shift.dy };
  }

  const { cuts } = layout;
  if (!isRecord(cuts)) return null;
  const cutPairs = {} as Record<DollSheetKey, [number, number]>;
  for (const key of DOLL_SHEET_KEYS) {
    const pair = cuts[key];
    if (!Array.isArray(pair) || pair.length !== 2 || !isNum(pair[0]) || !isNum(pair[1])) return null;
    cutPairs[key] = [pair[0], pair[1]];
  }

  return {
    version: 1,
    sheets: urls,
    layout: {
      anatomy: {
        head,
        shoulders: { x0: shoulders.x0, x1: shoulders.x1, y: shoulders.y },
        feetY: anatomy.feetY,
        centerX: anatomy.centerX,
      },
      figureShift: shifts,
      cuts: cutPairs,
    },
    model,
    generatedAt,
  };
}
