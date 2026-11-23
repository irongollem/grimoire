import type { WorldTie } from "@/lib/worldWeb/ties";
import type { CanonEntry } from "@/types/canon.types";

/** The truths ledger's mark filter (#1258 item 22): every truth, one mark, or the truths that belong to no arc. */
export const TRUTH_FILTERS = ["any", "all", "some", "secret", "no-arc"] as const;
export type TruthFilter = (typeof TRUTH_FILTERS)[number];
export const DEFAULT_TRUTH_FILTER: TruthFilter = "any";

export const TRUTH_FILTER_OPTIONS: ReadonlyArray<{ value: TruthFilter; label: string }> = [
  { value: "any", label: "All" },
  { value: "all", label: "Known to all" },
  { value: "some", label: "Some" },
  { value: "secret", label: "Secret" },
  { value: "no-arc", label: "No arc" },
];

export function filterTruths(truths: readonly CanonEntry[], filter: TruthFilter): CanonEntry[] {
  if (filter === "any") return [...truths];
  if (filter === "no-arc") return truths.filter((t) => t.arc_id === null);
  return truths.filter((t) => t.knowledge === filter);
}

/** What a truth is about: the record its `about` link points at. */
export interface TruthAbout {
  kind: string;
  id: string;
  name: string;
}

/** The first `about` link from each truth to a record of the world (a person, a place, a faction), by truth id. */
export function aboutByTruth(ties: readonly WorldTie[]): Map<string, TruthAbout> {
  const about = new Map<string, TruthAbout>();
  for (const tie of ties) {
    if (tie.source !== "link" || tie.type !== "about" || tie.from_kind !== "canon" || about.has(tie.from_id)) continue;
    about.set(tie.from_id, { kind: tie.to_kind, id: tie.to_id, name: tie.to_name });
  }
  return about;
}

export interface TruthGroup {
  key: string;
  /** The record's name, or null for the truths about no one in particular. */
  label: string | null;
  truths: CanonEntry[];
}

/**
 * The truths under what they are about: a group per record, by its name, and the rest last. Each group keeps the
 * order its truths came in.
 */
export function groupTruths(truths: readonly CanonEntry[], aboutOf: ReadonlyMap<string, TruthAbout>): TruthGroup[] {
  const groups = new Map<string, TruthGroup>();
  const rest: TruthGroup = { key: "none", label: null, truths: [] };
  for (const truth of truths) {
    const about = aboutOf.get(truth.id);
    if (!about) {
      rest.truths.push(truth);
      continue;
    }
    const key = `${about.kind}-${about.id}`;
    const group = groups.get(key) ?? { key, label: about.name, truths: [] };
    group.truths.push(truth);
    groups.set(key, group);
  }
  const named = [...groups.values()].sort((a, b) => (a.label ?? "").localeCompare(b.label ?? ""));
  return rest.truths.length > 0 ? [...named, rest] : named;
}
