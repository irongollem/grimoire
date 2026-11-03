/**
 * Which row of a scrolled deck is "in view" (#1136): keys 1 to 8 fire it. With
 * more than one row on screen it is the top one, counted once at least half of
 * it shows below the lane headers, so a row scrolled nearly away hands over to
 * the next.
 *
 * Vue-free and DOM-free: the dock measures, this decides.
 */

export interface RowBox {
  top: number;
  bottom: number;
}

/** The first row whose middle is at or below `viewTop`; the last row when all are above it, 0 for none. */
export function firstRowInView(rows: readonly RowBox[], viewTop: number): number {
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (row !== undefined && (row.top + row.bottom) / 2 >= viewTop) return index;
  }
  return Math.max(0, rows.length - 1);
}
