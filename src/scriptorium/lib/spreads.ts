/**
 * Spreads for the Inspect view (#1115): two facing pages, left then right. A
 * book opens on a right-hand page, so page 1 stands alone on the right and
 * pages 2 and 3 face each other. Indices are 0-based physical pages.
 */

/** How many spreads a book of `pageCount` pages has (a lone last page still takes one). */
export function spreadCount(pageCount: number): number {
  return pageCount <= 0 ? 0 : Math.ceil((pageCount + 1) / 2);
}

/** The [left, right] page indices of a spread; null where there is no page on that side. */
export function spreadPages(spread: number, pageCount: number): [number | null, number | null] {
  const pick = (index: number) => (index >= 0 && index < pageCount ? index : null);
  if (spread <= 0) return [null, pick(0)];
  return [pick(2 * spread - 1), pick(2 * spread)];
}

/** The spread a page sits in. */
export function spreadOfPage(index: number): number {
  return index <= 0 ? 0 : Math.ceil(index / 2);
}
