/**
 * What fades when a faction is focused.
 *
 * Split out of the graph computed because it carries a rule with an edge case,
 * and a rule with an edge case buried inside a Vue computed is a rule nobody can
 * test.
 */

export interface Dimmable {
  nodeColor: string;
  dimmed: boolean;
}

/**
 * Fade everything outside the focused faction — but only if the faction has
 * anyone here to focus on.
 *
 * The gate is the whole point. Narrow the search until no member of the focused
 * faction is left on screen and an ungated version fades every node and lights
 * none, which looks like a broken graph rather than an empty result. Focus is
 * meant to be a comparison, and there is nothing to compare against when one
 * side of it is absent.
 *
 * Mutates in place: the caller has just built this map and nothing else has seen
 * it yet, and copying every node to change one field on some of them buys
 * nothing here.
 */
export function dimNonMembers<T extends Dimmable>(
  nodes: Record<string, T>,
  focusedKeys: ReadonlySet<string>,
  dim: (color: string) => string,
): Record<string, T> {
  if (!focusedKeys.size) return nodes;

  const keys = Object.keys(nodes);
  if (!keys.some((key) => focusedKeys.has(key))) return nodes;

  for (const key of keys) {
    if (focusedKeys.has(key)) continue;
    nodes[key].dimmed = true;
    nodes[key].nodeColor = dim(nodes[key].nodeColor);
  }
  return nodes;
}
