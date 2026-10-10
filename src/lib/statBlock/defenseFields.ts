/**
 * Editing one defense category as the text a DM types ("fire; bludgeoning from
 * nonmagical attacks") while the stat block keeps the typed `Defenses` (#1017).
 */
import { formatConditionImmunities, formatDefenseList, parseDefenses } from "@/rules/statBlock/parseDefenses";
import type { Defenses } from "@/types/statBlock.types";

export type DefenseField = "resistances" | "immunities" | "vulnerabilities" | "condition_immunities";

const INPUT_KEY = {
  resistances: "damage_resistances",
  immunities: "damage_immunities",
  vulnerabilities: "damage_vulnerabilities",
  condition_immunities: "condition_immunities",
} as const;

export function defenseText(defenses: Defenses, field: DefenseField): string {
  return field === "condition_immunities"
    ? formatConditionImmunities(defenses.condition_immunities)
    : formatDefenseList(defenses[field]);
}

/**
 * Parses `raw` as one category and returns defenses with only that category
 * replaced. Words that name no damage type or condition join `notes`, so
 * nothing the DM typed is lost.
 */
export function applyDefenseText(defenses: Defenses, field: DefenseField, raw: string): Defenses {
  const parsed = parseDefenses({ [INPUT_KEY[field]]: raw });
  const next: Defenses = { ...defenses, [field]: parsed[field] };
  if (parsed.notes) {
    const have = (defenses.notes ?? "").split("; ").filter((s) => s.length > 0);
    for (const note of parsed.notes.split("; ")) if (!have.includes(note)) have.push(note);
    next.notes = have.join("; ");
  }
  return next;
}
