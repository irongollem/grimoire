import { impliedSiblings, parentDateProblem, wouldCycle } from "@/lib/kinship/checks";
import { buildKinGraph, linkBetween, parentsOf, relationTo, type KinEdgeInput, type KinGraph } from "@/lib/kinship/graph";
import { kinInsertFor } from "@/lib/kinship/keys";
import type { GeneratorKinRelation } from "@/lib/npcGenerator/kinPrompt";
import type { KinLinkInsert, KinLinkUpdate, KinRelation, PersonKey } from "@/types/kinship.types";

export const RELATION_OPTIONS: { value: KinRelation; label: string }[] = [
  { value: "parent", label: "Parent of" },
  { value: "child", label: "Child of" },
  { value: "spouse", label: "Spouse of" },
  { value: "former_spouse", label: "Former spouse of" },
  { value: "sibling", label: "Sibling of" },
  { value: "relative", label: "Relative of" },
];

/** What the button says and the eyebrow under the title ("Adding a child"), by the relation the subject has. */
export const SAVE_LABELS: Record<KinRelation, string> = {
  parent: "Add child",
  child: "Add parent",
  spouse: "Add spouse",
  former_spouse: "Add former spouse",
  sibling: "Add sibling",
  relative: "Add relative",
};

/** What the other person becomes to the subject, in the words of the eyebrow. */
export const OTHER_NOUNS: Record<KinRelation, string> = {
  parent: "child",
  child: "parent",
  spouse: "spouse",
  former_spouse: "former spouse",
  sibling: "sibling",
  relative: "relative",
};

/** Only these four can be drafted with the generator; it offers no "former spouse" or "relative". */
export function draftKinFor(relation: KinRelation): GeneratorKinRelation | null {
  switch (relation) {
    case "parent":
      return "child"; // the subject is the parent, so the new NPC is their child
    case "child":
      return "parent";
    case "spouse":
      return "spouse";
    case "sibling":
      return "sibling";
    default:
      return null;
  }
}

export function flipRelation(relation: KinRelation): KinRelation {
  return relation === "parent" ? "child" : relation === "child" ? "parent" : relation;
}

export type Verdict =
  | { kind: "ok" }
  | { kind: "cycle" }
  | { kind: "existing"; link: KinEdgeInput; same: boolean }
  | { kind: "implied-sibling"; sharedParents: PersonKey[] }
  | { kind: "dates"; parentBorn: number; childBorn: number };

/** The checks before a save, in the order they matter: a loop, a pair already linked, siblings already implied, then the dates. */
export function checkRelation(graph: KinGraph, subject: PersonKey, relation: KinRelation, other: PersonKey): Verdict {
  const isParentLink = relation === "parent" || relation === "child";
  const parent = relation === "parent" ? subject : other;
  const child = relation === "parent" ? other : subject;
  const existing = linkBetween(graph, subject, other);
  // A pair's own link is about to be replaced, so it cannot be what makes the loop.
  const without = existing
    ? buildKinGraph([...graph.people.values()], graph.links.filter((l) => l.id !== existing.id))
    : graph;
  if (isParentLink && wouldCycle(without, parent, child)) return { kind: "cycle" };

  if (existing) {
    const wanted = kinInsertFor(subject, relation, other);
    const sameKind = existing.kind === wanted.kind;
    const sameWay = existing.kind !== "parent" || relationTo(existing, subject) === flipRelation(relation);
    return { kind: "existing", link: existing, same: sameKind && sameWay };
  }

  if (relation === "sibling" && impliedSiblings(graph, subject, other)) {
    const theirs = new Set(parentsOf(graph, other).map((p) => p.key));
    return { kind: "implied-sibling", sharedParents: parentsOf(graph, subject).map((p) => p.key).filter((k) => theirs.has(k)) };
  }

  if (isParentLink) {
    const p = graph.people.get(parent);
    const c = graph.people.get(child);
    const problem = p && c ? parentDateProblem(p, c) : null;
    if (problem) return { kind: "dates", ...problem };
  }
  return { kind: "ok" };
}

/** Why a second-parent link is refused, in a clause for "<name> will not be added as a parent: <reason>". Null when it is fine. */
export function parentRefusal(v: Verdict, parentName: string, childName: string): string | null {
  switch (v.kind) {
    case "ok":
      return null;
    case "cycle":
      return "that would make someone their own ancestor";
    case "existing":
      return `${parentName} is already linked to ${childName}`;
    case "implied-sibling":
      return "they are already siblings";
    case "dates":
      return `${parentName} was born ${yearsAfter(v.parentBorn, v.childBorn)} ${childName}`;
  }
}

/** "31 years after", "the same year as": the years in words for the date warning. */
export function yearsAfter(parentBorn: number, childBorn: number): string {
  const gap = parentBorn - childBorn;
  if (gap === 0) return "the same year as";
  return `${gap} ${gap === 1 ? "year" : "years"} after`;
}

/** The existing link's word for what `other` is to `subject`, for "X is already Y's ...". */
export function existingWord(link: KinEdgeInput, subject: PersonKey): string {
  const rel = relationTo(link, subject);
  return rel === "former_spouse" ? "former spouse" : rel;
}

/** The columns a "Change it" writes over an existing row: the new kind, ends and details. */
export function updateFor(row: KinLinkInsert): KinLinkUpdate {
  return {
    from_npc_id: row.from_npc_id,
    from_party_member_id: row.from_party_member_id,
    to_npc_id: row.to_npc_id,
    to_party_member_id: row.to_party_member_id,
    kind: row.kind,
    parent_role: row.parent_role ?? null,
    adoptive: row.adoptive ?? false,
    note: row.note ?? "",
    needs_sorting: false,
  };
}
