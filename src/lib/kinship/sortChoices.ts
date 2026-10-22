import { endColumns } from "@/lib/kinship/keys";
import type { KinPerson } from "@/lib/kinship/graph";
import { suggestSort, type SortChoice } from "@/lib/kinship/sortSuggestions";
import type { KinLink, KinLinkUpdate, PersonKey } from "@/types/kinship.types";

/** One old "Family" link, read from both ends. `choice.relation` is what `to` is to `from`. */
export interface SortRow {
  link: KinLink;
  from: KinPerson;
  to: KinPerson;
  suggestion: { choice: SortChoice; reason: string } | null;
}

export const NO_REASON = "no dates, no note";

// The whole name: a first word is often a title or epithet ("Old Bren Thane", "Sister Ama"), not a name.
function nameOf(p: KinPerson): string {
  return p.name.trim();
}

/** The six answers a row offers, in the order the frame draws them. A suggestion keeps its parent role / label. */
export function choicesFor(row: SortRow): { choice: SortChoice; label: string }[] {
  const { from, to, suggestion } = row;
  const pick = (relation: SortChoice["relation"]): SortChoice =>
    suggestion?.choice.relation === relation
      ? suggestion.choice
      : { relation, parentRole: null, label: null };
  const a = nameOf(from);
  const b = nameOf(to);
  const relative = pick("relative");
  return [
    { choice: pick("parent"), label: `${b} is ${a}'s parent` },
    { choice: pick("child"), label: `${a} is ${b}'s parent` },
    { choice: pick("spouse"), label: "Spouses" },
    { choice: pick("former_spouse"), label: "Former spouses" },
    { choice: pick("sibling"), label: "Siblings" },
    { choice: relative, label: relative.label ? `Relatives · ${relative.label}` : "Relatives" },
  ];
}

export function buildSortRows(
  links: readonly KinLink[],
  endsOf: (link: KinLink) => { from: PersonKey; to: PersonKey },
  people: ReadonlyMap<PersonKey, KinPerson>,
): SortRow[] {
  const rows: SortRow[] = [];
  for (const link of links) {
    if (!link.needs_sorting) continue;
    const ends = endsOf(link);
    const from = people.get(ends.from);
    const to = people.get(ends.to);
    if (!from || !to) continue;
    rows.push({ link, from, to, suggestion: suggestSort(from, to, link.note) });
  }
  return rows;
}

/**
 * The update that settles a row. A parent answer rewrites the ends so `from` is
 * the parent, whichever side the old link started on; "relative" keeps the ends
 * and only gives the note its label when the note was empty.
 */
export function sortPatch(row: SortRow, choice: SortChoice): KinLinkUpdate {
  const { link, from, to } = row;
  const base = { needs_sorting: false, adoptive: false } as const;
  switch (choice.relation) {
    case "parent": // `to` is `from`'s parent
      return { ...base, ...endColumns(to.key, from.key), kind: "parent", parent_role: choice.parentRole };
    case "child":
      return { ...base, ...endColumns(from.key, to.key), kind: "parent", parent_role: choice.parentRole };
    case "relative":
      return {
        needs_sorting: false,
        kind: "relative",
        parent_role: null,
        note: link.note.trim() === "" && choice.label ? choice.label : link.note,
      };
    default:
      return { ...base, kind: choice.relation, parent_role: null };
  }
}
