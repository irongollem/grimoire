/**
 * The order a keyboard and a screen reader meet a board's notices in: what is up, in the DM's order, then the stubs of
 * what was taken, then drafts (which only the DM sees). get_player_notice_boards orders the same way
 * (20261016002013), so a taken stub never lands between two notices the DM arranged, whatever its sort_order says.
 */
const STATUS_RANK = { up: 0, taken: 1, draft: 2 } as const;

interface Ordered {
  id: string;
  status: keyof typeof STATUS_RANK;
  sort_order: number;
}

/** Stable, so rows that tie keep the order they arrived in (the queries break ties by created_at). */
export function inReadingOrder<T extends Ordered>(pins: readonly T[]): T[] {
  return [...pins].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.sort_order - b.sort_order);
}

/**
 * The sort_order writes that move one up notice a step earlier or later among the up notices. Two notices with their
 * own numbers trade them: two writes, nothing else moves. Ties (rows made before the order mattered) would swallow a
 * trade, so then the up notices are renumbered from zero and only the rows whose number changes are written.
 */
export function reorderWrites(pins: readonly Ordered[], id: string, direction: -1 | 1): { id: string; sort_order: number }[] {
  const up = inReadingOrder(pins.filter((p) => p.status === "up"));
  const from = up.findIndex((p) => p.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= up.length) return [];
  const distinct = new Set(up.map((p) => p.sort_order)).size === up.length;
  if (distinct) {
    return [
      { id: up[from].id, sort_order: up[to].sort_order },
      { id: up[to].id, sort_order: up[from].sort_order },
    ];
  }
  const order = [...up];
  [order[from], order[to]] = [order[to], order[from]];
  return order.flatMap((p, index) => (p.sort_order === index ? [] : [{ id: p.id, sort_order: index }]));
}
