/**
 * The arithmetic behind `VirtualGrid`, kept free of the DOM so it can be tested
 * without layout (jsdom has none). A virtualized grid has to know what CSS
 * would have decided on its own: how many columns a row holds, and which items
 * land in which row.
 */
/**
 * What `grid-template-columns: repeat(auto-fill, minmax(min, 1fr))` resolves to
 * for a container `widthPx` wide: as many `minPx` tracks as fit with a gap
 * between each pair. Never fewer than one, as in CSS, where a track wider than
 * the container still gets drawn.
 */
export function autoFillColumns(widthPx: number, minPx: number, gapPx: number): number {
  if (!(widthPx > 0) || !(minPx > 0)) return 1;
  return Math.max(1, Math.floor((widthPx + gapPx) / (minPx + gapPx)));
}

/** Number of rows needed to hold `itemCount` items, `columns` to a row. */
export function rowCount(itemCount: number, columns: number): number {
  if (itemCount <= 0) return 0;
  return Math.ceil(itemCount / Math.max(1, columns));
}

/** The items of row `rowIndex` (the last row may be short). */
export function rowItems<T>(items: readonly T[], columns: number, rowIndex: number): T[] {
  const cols = Math.max(1, columns);
  return items.slice(rowIndex * cols, rowIndex * cols + cols);
}

/** Index of the row an item sits in, e.g. to scroll an item into view. */
export function rowOfItem(itemIndex: number, columns: number): number {
  return Math.floor(itemIndex / Math.max(1, columns));
}
