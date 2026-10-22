import { type KinGraph, parentsOf } from "@/lib/kinship/graph";
import type { KinPerson } from "@/lib/kinship/graph";
import type { PersonKey } from "@/types/kinship.types";

/** Set when both birth years are known and the parent was not born before the child. */
export function parentDateProblem(parent: KinPerson, child: KinPerson): { parentBorn: number; childBorn: number } | null {
  if (parent.bornYear === null || child.bornYear === null) return null;
  if (parent.bornYear < child.bornYear) return null;
  return { parentBorn: parent.bornYear, childBorn: child.bornYear };
}

/** Two people who share at least one parent are siblings whether or not a link says so. */
export function impliedSiblings(g: KinGraph, a: PersonKey, b: PersonKey): boolean {
  if (a === b) return false;
  const theirs = new Set(parentsOf(g, b).map((p) => p.key));
  return parentsOf(g, a).some((p) => theirs.has(p.key));
}

/** Making `parent` a parent of `child` would loop when the child is the parent or one of the parent's ancestors. */
export function wouldCycle(g: KinGraph, parent: PersonKey, child: PersonKey): boolean {
  if (parent === child) return true;
  const seen = new Set<PersonKey>([parent]);
  const stack: PersonKey[] = [parent];
  while (stack.length > 0) {
    const next = stack.pop();
    if (next === undefined) break;
    for (const p of parentsOf(g, next)) {
      if (p.key === child) return true;
      if (!seen.has(p.key)) {
        seen.add(p.key);
        stack.push(p.key);
      }
    }
  }
  return false;
}
