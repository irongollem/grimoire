import { childrenOf, type KinEdgeInput, type KinGraph, parentsOf, spousesOf } from "@/lib/kinship/graph";
import type { Selection } from "@/lib/kinship/select";
import type { HouseDescent, PersonKey } from "@/types/kinship.types";

export interface HouseLineage extends Selection {
  blood: Set<PersonKey>;
  marriedIn: Set<PersonKey>;
}

/** Does a child reached through this parent link count as of the house? An unknown parent role counts. */
export function followsLine(link: KinEdgeInput, descent: HouseDescent): boolean {
  switch (descent) {
    case "father":
      return link.parent_role !== "mother";
    case "mother":
      return link.parent_role !== "father";
    case "either":
      return true;
    case "oath":
      return false;
  }
}

/**
 * A House's people: its blood in full, those who married in beside their
 * spouse, and children reckoned to another line folded under their parent.
 * Ancestors are never pulled in; only the faction's own members seed it.
 */
export function houseLineage(g: KinGraph, seeds: Set<PersonKey>, descent: HouseDescent): HouseLineage {
  const seedKeys = new Set([...seeds].filter((k) => g.people.has(k)));
  const marriedIn = new Set<PersonKey>();
  const blood = new Set<PersonKey>();

  if (descent === "oath") {
    for (const k of seedKeys) blood.add(k);
  } else {
    // A seed with no parent among the seeds, whose spouse does have one, married into the house
    // (Maera, née Holt, wed to Bren). A founding couple, with parents on neither side, are both blood.
    const hasSeedParent = (k: PersonKey): boolean => parentsOf(g, k).some((p) => seedKeys.has(p.key));
    for (const k of seedKeys) {
      if (hasSeedParent(k)) continue;
      if (spousesOf(g, k).some((s) => seedKeys.has(s.key) && hasSeedParent(s.key))) marriedIn.add(k);
    }
    const queue: PersonKey[] = [];
    for (const k of seedKeys) {
      if (!marriedIn.has(k)) {
        blood.add(k);
        queue.push(k);
      }
    }
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      if (p === undefined) break;
      for (const c of childrenOf(g, p)) {
        if (blood.has(c.key) || !followsLine(c.link, descent)) continue;
        blood.add(c.key);
        queue.push(c.key);
      }
    }
    // A marriedIn seed that turned out to be blood through a child link stays blood.
    for (const k of blood) marriedIn.delete(k);
  }

  for (const k of blood) {
    for (const s of spousesOf(g, k)) if (!blood.has(s.key)) marriedIn.add(s.key);
  }

  const members = new Set<PersonKey>([...blood, ...marriedIn]);
  const folds = new Map<PersonKey, PersonKey[]>();
  if (descent !== "oath") {
    for (const p of blood) {
      const hidden = childrenOf(g, p)
        .map((c) => c.key)
        .filter((k) => !members.has(k));
      if (hidden.length > 0) folds.set(p, [...new Set(hidden)]);
    }
  }
  return { members, folds, blood, marriedIn };
}
