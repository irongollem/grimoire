/*
 * Page-number labelling for Scriptorium footers (Phase B, #330).
 *
 * Shared by both preview renderers so numbering behaves identically:
 *   - legacy manual preview / PDF export feed it HTML per page;
 *   - the Paged.js book feeds it each rendered page's innerHTML.
 *
 * Rules (in order, per page):
 *   - front/back cover pages are never numbered (and don't advance);
 *   - a "reset #" marker resets the counter to the start value;
 *   - a "skip #" marker leaves the page unnumbered and does NOT advance;
 *   - otherwise the page takes the current counter, which then advances.
 */

export interface PageNumberFlags {
  /** Front or back cover — unnumbered, non-advancing. */
  isUnnumberedCover: boolean;
  /** "skip #" marker present — unnumbered, non-advancing. */
  hasSkip: boolean;
  /** "reset #" marker present — counter resets to start before this page. */
  hasReset: boolean;
}

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
    hasReset: html.includes('data-type="reset-counting"'),
  };
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
    if (f.isUnnumberedCover) return null;
    if (f.hasReset) counter = start;
    if (f.hasSkip) return null;
    return String(counter++);
  });
}
