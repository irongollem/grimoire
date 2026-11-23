// Manual order for the Canon page's lists (#1255 item 11): up and down, one step at a time, as passages and steps
// already have. The list is the one on screen, in the order it is drawn.

export interface Ordered {
  id: string;
  sort_order: number;
}

/** A write the move needs: this row takes this place. */
export interface OrderWrite {
  id: string;
  sort_order: number;
}

/**
 * The writes that move one row a step up (`-1`) or down (`1`) in its list; none when it is already at that end or is
 * not in the list. Two rows swap their values when every value in the list is its own. When two rows share a value
 * (new entries took `length` as their place, so a list that lost a row has doubles) a swap would change nothing, so
 * the list is renumbered from position and only the rows whose place changes are written.
 */
export function moveWithin(list: readonly Ordered[], id: string, direction: -1 | 1): OrderWrite[] {
  const from = list.findIndex((row) => row.id === id);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= list.length) return [];
  const a = list[from];
  const b = list[to];
  const collides = new Set(list.map((row) => row.sort_order)).size !== list.length;
  if (!collides) return [{ id: a.id, sort_order: b.sort_order }, { id: b.id, sort_order: a.sort_order }];
  const next = [...list];
  next[from] = b;
  next[to] = a;
  return next.map((row, place) => ({ id: row.id, sort_order: place })).filter((write) => list.find((row) => row.id === write.id)?.sort_order !== write.sort_order);
}

/** Which ends of its list a row sits at, for the buttons that move it; null for a list of one, which has nowhere to go. */
export function endsOf(list: readonly Ordered[], id: string): { first: boolean; last: boolean } | null {
  if (list.length < 2) return null;
  return { first: list[0]?.id === id, last: list[list.length - 1]?.id === id };
}
