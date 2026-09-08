import type { Location, LocationType } from "@/types/location.types";
import { tierIndex } from "./tiers";

export interface AtlasIndex {
  byId: Map<string, Location>;
  /** Child ids per parent, sorted by scale then name. */
  childIds: Map<string, string[]>;
  /** Ids with no resolvable parent, in the same sort order. */
  rootIds: string[];
  /** Total descendants beneath each id, all depths. */
  descendantCount: Map<string, number>;
}

export interface AtlasRow {
  loc: Location;
  depth: number;
  hasChildren: boolean;
  descendantCount: number;
}

/**
 * Canonical sibling order: scale first, then the DM's manual `sort_order`
 * (nulls last — "no order claimed yet"), then name. A region's cities should
 * precede its taverns regardless of arrangement; within one scale, an
 * unordered sibling falls to the bottom rather than jumping alphabetically
 * ahead of arranged ones.
 *
 * Typed against the three fields it actually reads rather than a whole
 * `Location`, which every `Location` satisfies structurally. That lets realtime
 * cache splicing (`campaignRealtimeWorld.ts`) share this one implementation by
 * narrowing its loosely-typed payload honestly, instead of asserting it is a
 * `Location` — an assertion nothing checks and a missing column would break.
 */
export interface SiblingOrder {
  location_type: LocationType;
  sort_order: number | null;
  name: string;
}

export function compareSiblings(a: SiblingOrder, b: SiblingOrder): number {
  const byTier = tierIndex(a.location_type) - tierIndex(b.location_type);
  if (byTier !== 0) return byTier;

  if (a.sort_order !== b.sort_order) {
    if (a.sort_order === null) return 1;
    if (b.sort_order === null) return -1;
    return a.sort_order - b.sort_order;
  }

  return a.name.localeCompare(b.name);
}

/**
 * Builds the parent/child index in one pass.
 *
 * A location whose `parent_id` points at something not in `locations` is
 * promoted to a root rather than dropped. Campaign scoping and player sharing
 * both produce that case, and a place that silently vanishes from the Atlas is
 * far worse than one that appears at the top level.
 */
export function buildAtlasIndex(locations: readonly Location[]): AtlasIndex {
  const byId = new Map<string, Location>();
  for (const loc of locations) byId.set(loc.id, loc);

  const childIds = new Map<string, string[]>();
  const rootIds: string[] = [];

  for (const loc of locations) {
    const parentId = loc.parent_id;
    if (parentId !== null && parentId !== loc.id && byId.has(parentId)) {
      const siblings = childIds.get(parentId);
      if (siblings) siblings.push(loc.id);
      else childIds.set(parentId, [loc.id]);
    } else {
      rootIds.push(loc.id);
    }
  }

  const sortIds = (ids: string[]) =>
    ids.sort((a, b) => compareSiblings(byId.get(a)!, byId.get(b)!));
  for (const ids of childIds.values()) sortIds(ids);
  sortIds(rootIds);

  return { byId, childIds, rootIds, descendantCount: countDescendants(childIds, rootIds) };
}

/**
 * Post-order descendant totals, iterative so a deep hierarchy cannot blow the
 * stack. Nodes reachable only through a parent cycle are never visited, which
 * is deliberate — they are unreachable in the UI too.
 */
function countDescendants(
  childIds: Map<string, string[]>,
  rootIds: readonly string[],
): Map<string, number> {
  const counts = new Map<string, number>();
  const stack: Array<{ id: string; visited: boolean }> = rootIds.map((id) => ({
    id,
    visited: false,
  }));
  const seen = new Set<string>();

  while (stack.length) {
    const frame = stack.pop()!;
    const kids = childIds.get(frame.id) ?? [];
    if (!frame.visited) {
      if (seen.has(frame.id)) continue;
      seen.add(frame.id);
      stack.push({ id: frame.id, visited: true });
      for (const kid of kids) stack.push({ id: kid, visited: false });
    } else {
      let total = kids.length;
      for (const kid of kids) total += counts.get(kid) ?? 0;
      counts.set(frame.id, total);
    }
  }

  return counts;
}

/**
 * Root-to-node chain, inclusive of `id`. Returns an empty array for an unknown
 * id. Guarded against a `parent_id` cycle, which the schema permits.
 */
export function ancestorPath(index: AtlasIndex, id: string): Location[] {
  const path: Location[] = [];
  const seen = new Set<string>();
  let current = index.byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parent_id ? index.byId.get(current.parent_id) : undefined;
  }
  return path;
}

/** Direct children of a node, already in scale order. */
export function childrenOf(index: AtlasIndex, id: string): Location[] {
  return (index.childIds.get(id) ?? []).map((childId) => index.byId.get(childId)!);
}

/**
 * Every place beneath a node at any depth. Feeds the scale rail, which needs to
 * know which rungs the whole subtree occupies rather than just the next one.
 */
export function descendantsOf(index: AtlasIndex, id: string): Location[] {
  const out: Location[] = [];
  const queue = [...(index.childIds.get(id) ?? [])];
  const seen = new Set<string>([id]);
  while (queue.length) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    const loc = index.byId.get(next);
    if (!loc) continue;
    out.push(loc);
    queue.push(...(index.childIds.get(next) ?? []));
  }
  return out;
}

/** Ancestor ids excluding the node itself — what needs opening to reveal it. */
export function ancestorIds(index: AtlasIndex, id: string): string[] {
  return ancestorPath(index, id)
    .slice(0, -1)
    .map((loc) => loc.id);
}

/**
 * Flattens the tree to the rows currently on screen: a node is visible when
 * every ancestor is expanded.
 */
export function visibleRows(index: AtlasIndex, expanded: ReadonlySet<string>): AtlasRow[] {
  const rows: AtlasRow[] = [];

  const walk = (ids: readonly string[], depth: number) => {
    for (const id of ids) {
      const loc = index.byId.get(id);
      if (!loc) continue;
      const kids = index.childIds.get(id) ?? [];
      rows.push({
        loc,
        depth,
        hasChildren: kids.length > 0,
        descendantCount: index.descendantCount.get(id) ?? 0,
      });
      if (kids.length && expanded.has(id)) walk(kids, depth + 1);
    }
  };

  walk(index.rootIds, 0);
  return rows;
}

/*
 * There was an `isStub()` here, rendering a quiet "empty" mark on locations with
 * no description, children, map or tags. It was removed rather than tuned: the
 * predicate reads four fields, three of which the tree does not display, so a
 * row marked "empty" beside an unmarked sibling looked arbitrary — the sibling
 * had a description you simply could not see. A marker that requires knowledge
 * the surface withholds is noise, however accurate it is.
 */
