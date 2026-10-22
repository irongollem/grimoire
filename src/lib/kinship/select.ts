import { childrenOf, type KinGraph, parentsOf, spousesOf } from "@/lib/kinship/graph";
import type { PersonKey } from "@/types/kinship.types";

export interface Selection {
  members: Set<PersonKey>;
  /** parent -> its children folded away into one count card */
  folds: Map<PersonKey, PersonKey[]>;
}

export interface SelectOptions {
  up?: number;
  down?: number;
  /** Folded branches the viewer opened; their children are drawn and follow the same rule again. */
  expanded?: Set<PersonKey>;
}

/**
 * Who appears around a centred person. Ancestors up to `up` generations, every
 * descendant of the focus and of those ancestors down to `down`, and the
 * spouses of all of them. A branch that hangs off the centred line (a
 * sibling's, a cousin's children) folds into a count unless it was expanded.
 */
export function selectAroundFocus(g: KinGraph, focus: PersonKey, opts: SelectOptions = {}): Selection {
  const up = opts.up ?? 2;
  const down = opts.down ?? 2;
  const expanded = opts.expanded ?? new Set<PersonKey>();
  const members = new Set<PersonKey>();
  const folds = new Map<PersonKey, PersonKey[]>();
  if (!g.people.has(focus)) return { members, folds };

  const gen = new Map<PersonKey, number>();
  const line = new Set<PersonKey>(); // the focus and its descendants
  const queue: PersonKey[] = [];

  const add = (key: PersonKey, g0: number, onLine: boolean): void => {
    const known = members.has(key);
    if (!known) {
      members.add(key);
      gen.set(key, g0);
      if (onLine) line.add(key);
      queue.push(key);
    } else if (onLine && !line.has(key)) {
      // Reached first through a spouse, now through the centred line: its children no longer fold.
      line.add(key);
      queue.push(key);
    }
  };

  // Ancestors, breadth first so a person reachable two ways gets the nearer generation.
  const ancestors: [PersonKey, number][] = [];
  const seenUp = new Set<PersonKey>([focus]);
  let frontier: PersonKey[] = [focus];
  for (let depth = 1; depth <= up; depth++) {
    const next: PersonKey[] = [];
    for (const k of frontier) {
      for (const p of parentsOf(g, k)) {
        if (seenUp.has(p.key)) continue;
        seenUp.add(p.key);
        ancestors.push([p.key, -depth]);
        next.push(p.key);
      }
    }
    frontier = next;
  }

  for (const [key, depth] of ancestors) add(key, depth, false);
  add(focus, 0, true);

  const mayDescend = (key: PersonKey, g0: number): boolean => g0 < 0 || line.has(key) || expanded.has(key);

  for (let i = 0; i < queue.length; i++) {
    const key = queue[i];
    if (key === undefined) break;
    const g0 = gen.get(key) ?? 0;
    if (mayDescend(key, g0) && g0 + 1 <= down) {
      for (const c of childrenOf(g, key)) add(c.key, g0 + 1, line.has(key));
    }
    for (const s of spousesOf(g, key)) add(s.key, g0, false);
  }

  for (const key of members) {
    const g0 = gen.get(key) ?? 0;
    if (mayDescend(key, g0) || g0 + 1 > down) continue;
    const hidden = childrenOf(g, key)
      .map((c) => c.key)
      .filter((k) => !members.has(k));
    if (hidden.length > 0) folds.set(key, [...new Set(hidden)]);
  }
  return { members, folds };
}
