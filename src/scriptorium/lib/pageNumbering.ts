/*
 * Page-number labelling for Scriptorium footers (Phase B, #330).
 *
 * Shared by both preview renderers so numbering behaves identically:
 *   - legacy manual preview / PDF export feed it HTML per page;
 *   - the Paged.js book feeds it each rendered page's innerHTML.
 *
 * Rules (in order, per page):
 *   - a blank page (left empty so a chapter opens on a right-hand page) is
 *     counted, because it is a physical page, but prints no number;
 *   - a front or back cover is never numbered but is counted, like a blank:
 *     the front cover is page 1 of the book without saying so, so the first
 *     printed number (2) falls on a left-hand page and every chapter, which
 *     opens on a right-hand page, opens on an odd number as printed books do
 *     (Jeffrey, 30 Oct 2026, #1115);
 *   - a "reset #" marker resets the counter to the start value;
 *   - a "skip #" marker leaves the page unnumbered and does NOT advance;
 *     it also takes the footer away, unless it keeps the running title
 *     ("Don't count this page", #1176 story 6);
 *   - otherwise the page takes the current counter, which then advances.
 */

export interface PageNumberFlags {
  /** Front or back cover: counted, never numbered. */
  isUnnumberedCover: boolean;
  /** "skip #" marker present — unnumbered, non-advancing. */
  hasSkip: boolean;
  /** The skip marker keeps the footer's running title ("Don't count this page"). */
  keepsFooter?: boolean;
  /** "reset #" marker present — counter resets to start before this page. */
  hasReset: boolean;
  /**
   * A page the book left blank so the next chapter opens on a right-hand page
   * (bookLayout/blankPages.ts). It takes a number from the count, since it is
   * a sheet of paper, but never shows one.
   */
  isBlank?: boolean;
}

/** The marker a blank page carries, for the numbering, the footers and the UI. */
export const BLANK_PAGE_ATTR = "data-blank-page";

export interface PageNumberOptions {
  showPageNumbers: boolean;
  /** First numbered page's value. */
  start: number;
}

/** Derive numbering flags from a page's HTML (works for both renderers). */
export function flagsFromHtml(html: string): PageNumberFlags {
  const isUnnumberedCover =
    html.includes('data-type="coverPage"') &&
    (html.includes('data-variant="front"') || html.includes('data-variant="back"'));
  return {
    isUnnumberedCover,
    hasSkip: html.includes('data-type="skip-counting"'),
    keepsFooter: /data-type="skip-counting"[^>]*data-keep-footer="true"/.test(html),
    hasReset: html.includes('data-type="reset-counting"'),
  };
}

/** The numbering flags of a laid-out page element: its blank marker, else its markup. */
export function flagsFromPage(page: HTMLElement): PageNumberFlags {
  if (page.hasAttribute(BLANK_PAGE_ATTR)) {
    return { isUnnumberedCover: false, hasSkip: false, hasReset: false, isBlank: true };
  }
  return flagsFromHtml(page.innerHTML);
}

/**
 * Compute the footer label for each page (null = no number shown).
 * Pure and deterministic.
 */
export function computePageLabels(
  flags: PageNumberFlags[],
  { showPageNumbers, start }: PageNumberOptions,
): (string | null)[] {
  if (!showPageNumbers) return flags.map(() => null);
  let counter = start;
  return flags.map((f) => {
    if (f.isBlank) {
      counter++;
      return null;
    }
    if (f.isUnnumberedCover) {
      counter++;
      return null;
    }
    if (f.hasReset) counter = start;
    if (f.hasSkip) return null;
    return String(counter++);
  });
}

/**
 * Whether a page draws a footer. A numbered page does; a page the DM left out
 * of the count keeps one (without a number) only when asked to. Covers and
 * blank pages never do, and with page numbers off there are no footers.
 */
export function pageHasFooter(f: PageNumberFlags, label: string | null, showPageNumbers: boolean): boolean {
  if (!showPageNumbers || f.isBlank || f.isUnnumberedCover) return false;
  return label !== null || (f.hasSkip && f.keepsFooter === true);
}
