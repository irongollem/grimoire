/**
 * Space-aware text fitting for fixed-height cards.
 *
 * Card Forge cards have a fixed frame, so a stat block's ability list must be
 * clamped to whatever vertical space is left after the header/stats. We render
 * every entry, measure each one's position, then decide which fit whole and
 * which final entry should be line-clamped — instead of cutting every entry at
 * an arbitrary character count that wastes space on sparse cards.
 */

/** A measured child entry, relative to the top of its scroll container. */
export interface FitChild {
  /** offsetTop of the entry within the container (includes preceding gaps). */
  top: number;
  /** full rendered height of the entry. */
  height: number;
  /** computed line-height of the entry in px (used to clamp the last one). */
  lineHeight: number;
}

export interface FitResult {
  /** number of leading entries that fit in full. */
  visibleCount: number;
  /** index of the entry to line-clamp, or -1 if every entry fits whole. */
  partialIndex: number;
  /** number of lines to show for the clamped entry (>= 1 when partialIndex >= 0). */
  clampLines: number;
}

/**
 * Decide which entries fit in `available` px of vertical space.
 *
 * Entries that fit whole are counted in `visibleCount`. The first entry that
 * overflows becomes the `partialIndex` and is clamped to however many whole
 * lines still fit in the remaining space (at least one). Everything after is
 * dropped.
 */
export function computeFit(
  children: FitChild[],
  available: number,
  tolerance = 1,
): FitResult {
  let visibleCount = 0;

  for (let i = 0; i < children.length; i++) {
    const { top, height, lineHeight } = children[i];
    if (top + height <= available + tolerance) {
      visibleCount = i + 1;
      continue;
    }
    // This entry overflows — see how many of its lines fit in what's left.
    const remaining = available - top;
    const lines =
      lineHeight > 0 ? Math.floor((remaining + tolerance) / lineHeight) : 0;
    if (lines >= 1) {
      return { visibleCount, partialIndex: i, clampLines: lines };
    }
    break;
  }

  return { visibleCount, partialIndex: -1, clampLines: 0 };
}
