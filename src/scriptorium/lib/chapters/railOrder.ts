/**
 * The chapter rail's order arithmetic (#1115), kept pure so a drop, a menu move
 * and a delete agree on what "next" means.
 */

/** The insertion slot (0..n, in the list as it stands) a pointer at `y` is over: how many row midpoints lie above it. */
export function dropSlot(midpoints: number[], y: number): number {
  return midpoints.filter((mid) => y > mid).length;
}

/** Moves `id` to `slot` (an insertion point in the original list). Same array back when nothing would change. */
export function moveToSlot(ids: string[], id: string, slot: number): string[] {
  const from = ids.indexOf(id);
  if (from === -1 || slot === from || slot === from + 1) return ids;
  const rest = ids.filter((other) => other !== id);
  rest.splice(slot > from ? slot - 1 : slot, 0, id);
  return rest;
}

/** One step up (-1) or down (+1). Same array back at either end. */
export function moveBy(ids: string[], id: string, delta: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/** Where the editor goes when `id` is deleted: the chapter after it, or the one before when it was last. Null for the only chapter. */
export function neighbourAfterDelete(ids: string[], id: string): string | null {
  const at = ids.indexOf(id);
  if (at === -1) return null;
  return ids[at + 1] ?? ids[at - 1] ?? null;
}

/** "Pages 175 to 191", "Page 12" for a one-page chapter, null while the layout has not said. */
export function pagesLine(range: { first: string | null; last: string | null } | undefined): string | null {
  if (!range || range.first === null) return null;
  if (range.last === null || range.last === range.first) return `Page ${range.first}`;
  return `Pages ${range.first} to ${range.last}`;
}
