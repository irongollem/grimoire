import type { KinPerson } from "@/lib/kinship/graph";
import type { ParentRole } from "@/types/kinship.types";

export type SortChoice = {
  relation: "parent" | "child" | "spouse" | "former_spouse" | "sibling" | "relative";
  parentRole: ParentRole | null;
  label: string | null;
};

const RELATIVE_WORDS = [
  "aunt",
  "uncle",
  "cousin",
  "niece",
  "nephew",
  "grandfather",
  "grandmother",
  "grandson",
  "granddaughter",
  "grandparent",
  "grandchild",
];

function has(note: string, words: string[]): boolean {
  return words.some((w) => new RegExp(`\\b${w}\\b`, "i").test(note));
}

function noteChoice(note: string): SortChoice | null {
  const choice = (relation: SortChoice["relation"], parentRole: ParentRole | null = null): SortChoice => ({
    relation,
    parentRole,
    label: null,
  });
  // In-laws and step-kin are family by marriage, not blood: "father-in-law" must not make a parent.
  const byMarriage = /\b(step[- ]?[a-z]+|[a-z]+[- ]in[- ]law)\b/i.exec(note);
  if (byMarriage?.[1]) return { relation: "relative", parentRole: null, label: byMarriage[1].toLowerCase() };
  if (has(note, ["father", "dad"])) return choice("parent", "father");
  if (has(note, ["mother", "mum", "mom"])) return choice("parent", "mother");
  if (has(note, ["parent"])) return choice("parent");
  if (has(note, ["son", "daughter", "child"])) return choice("child");
  const spouseWord = ["husband", "wife", "spouse"];
  const former = ["ex", "former", "late", "first"];
  if (has(note, ["widow", "widower"]) || (has(note, former) && has(note, spouseWord))) return choice("former_spouse");
  if (has(note, [...spouseWord, "married"])) return choice("spouse");
  if (has(note, ["brother", "sister", "sibling", "twin"])) return choice("sibling");
  const found = RELATIVE_WORDS.find((w) => has(note, [w]));
  if (found) return { relation: "relative", parentRole: null, label: found };
  return null;
}

function lastWord(name: string): string {
  const parts = name.trim().toLowerCase().split(/\s+/);
  return parts[parts.length - 1] ?? "";
}

/**
 * A guess at how an old "Family" link should be sorted. `relation` is what
 * `to` is to `from`: the note was written from `from`'s side, so "her first
 * husband" on Odile -> Garrick makes Garrick Odile's former spouse.
 */
export function suggestSort(from: KinPerson, to: KinPerson, note: string): { choice: SortChoice; reason: string } | null {
  const trimmed = note.trim();
  const fromNote = trimmed ? noteChoice(trimmed) : null;
  if (fromNote) return { choice: fromNote, reason: `note: “${trimmed.slice(0, 60)}”` };

  if (from.bornYear === null || to.bornYear === null) return null;
  const gap = Math.abs(from.bornYear - to.bornYear);
  if (gap >= 15) {
    const relation = to.bornYear < from.bornYear ? "parent" : "child";
    return {
      choice: { relation, parentRole: null, label: null },
      reason: `born ${from.bornYear} and ${to.bornYear}: ${gap} years apart`,
    };
  }
  const family = lastWord(from.name);
  if (gap <= 10 && family !== "" && family === lastWord(to.name)) {
    return {
      choice: { relation: "sibling", parentRole: null, label: null },
      reason: `born ${gap} years apart, same family name`,
    };
  }
  return null;
}
