/**
 * The arithmetic behind the Open Book's page engine (#1085). No DOM in here.
 *
 * An article is laid out once in a fixed-height CSS multi-column box, one column per page. Each visible page is a
 * window onto that same flow, shifted left by `k * pitch`. This module turns "how wide is the flow" into "how many
 * pages", and "which unit is the reader on" into "which pages are on screen".
 *
 * A *unit* is what one turn moves by: a spread (verso + recto) on a wide screen, a single page on a phone. The first
 * page of an article is always a recto, so a spread layout puts a frontispiece on the verso of unit 0.
 */

/** Wide screens show two pages, phones one. */
export type ReadingMode = "spread" | "single";

export type PageSlot =
  | { kind: "front" }
  | { kind: "page"; k: number }
  | { kind: "blank" };

export interface UnitSlots {
  /** `null` in single-page mode, where there is no verso to draw. */
  verso: PageSlot | null;
  recto: PageSlot;
}

/** Distance between two column starts: the page width plus the gap between columns. */
export function columnPitch(width: number, gap: number): number {
  return width + gap;
}

/**
 * How many columns a flow of `scrollWidth` holds. The last column has no trailing gap, so it is added back before
 * dividing; the small tolerance absorbs sub-pixel layout, which would otherwise read 2.0000001 columns as 3 pages.
 */
export function countColumns(scrollWidth: number, width: number, gap: number): number {
  const pitch = columnPitch(width, gap);
  if (!Number.isFinite(scrollWidth) || !(pitch > 0)) return 1;
  return Math.max(1, Math.ceil((scrollWidth + gap) / pitch - 0.02));
}

/** The horizontal shift that brings page `k` of a flow into its window. */
export function columnOffset(k: number, width: number, gap: number): number {
  return Math.max(0, k) * columnPitch(width, gap);
}

/** Which page of a flow an element sits on, from its left edge measured against the flow's own left edge. */
export function pageOfOffset(offsetLeft: number, width: number, gap: number, pageCount: number): number {
  const pitch = columnPitch(width, gap);
  if (!(pitch > 0)) return 0;
  return Math.min(Math.max(0, pageCount - 1), Math.max(0, Math.floor((offsetLeft + 1) / pitch)));
}

/** How many turns an article of `pageCount` pages takes to read. */
export function unitCount(pageCount: number, mode: ReadingMode): number {
  const pages = Math.max(1, Math.floor(pageCount));
  return mode === "single" ? pages : Math.ceil((pages + 1) / 2);
}

export function clampUnit(unit: number, count: number): number {
  if (!Number.isFinite(unit)) return Math.max(0, count - 1);
  return Math.min(Math.max(0, Math.floor(unit)), Math.max(0, count - 1));
}

function slotAt(virtualPage: number, pageCount: number): PageSlot {
  if (virtualPage === 0) return { kind: "front" };
  return virtualPage - 1 < pageCount ? { kind: "page", k: virtualPage - 1 } : { kind: "blank" };
}

/** The pages on screen at `unit`. Spread: virtual pages 2u and 2u+1, where virtual page 0 is the frontispiece. */
export function unitSlots(unit: number, pageCount: number, mode: ReadingMode): UnitSlots {
  const pages = Math.max(1, Math.floor(pageCount));
  const u = Math.max(0, Math.floor(unit));
  if (mode === "single") {
    return { verso: null, recto: u < pages ? { kind: "page", k: u } : { kind: "blank" } };
  }
  return { verso: slotAt(2 * u, pages), recto: slotAt(2 * u + 1, pages) };
}

/** The unit that shows page `k` of an article. */
export function unitOfPage(k: number, mode: ReadingMode): number {
  const page = Math.max(0, Math.floor(k));
  return mode === "single" ? page : Math.floor((page + 1) / 2);
}

/** `?s=` in a URL: a number, or `end` for the last unit of an article whose length is not known yet. */
export function parseUnit(raw: unknown): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "end") return Number.POSITIVE_INFINITY;
  if (typeof value !== "string" || !/^\d{1,4}$/.test(value)) return 0;
  return Number.parseInt(value, 10);
}

/** The query value for a unit: absent for the first one, so an entry's own address stays clean. */
export function formatUnit(unit: number): string | undefined {
  if (unit === Number.POSITIVE_INFINITY) return "end";
  return unit > 0 ? String(Math.floor(unit)) : undefined;
}

/** Rough characters of stored text per page, used until an article has actually been laid out. */
export const CHARS_PER_PAGE = 1500;

/** Pages an article is expected to take before it is measured. Never fewer than one. */
export function estimatePages(charCount: number): number {
  if (!Number.isFinite(charCount) || charCount <= 0) return 1;
  return Math.max(1, Math.ceil(charCount / CHARS_PER_PAGE));
}

/** The first folio of each section, given each one's page count. Folios continue across the book, from 1. */
export function folioStarts(counts: readonly number[]): number[] {
  const starts: number[] = [];
  let next = 1;
  for (const count of counts) {
    starts.push(next);
    next += Math.max(1, Math.floor(count));
  }
  return starts;
}

/** Lower-case roman numerals for front matter folios. Out of range falls back to the plain number. */
export function toRoman(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) return String(n);
  const table: [number, string][] = [
    [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
    [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
  ];
  let rest = n;
  let out = "";
  for (const [value, glyph] of table) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return out;
}
