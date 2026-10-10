/**
 * What a player may roll from a revealed stat-block entry (#1017).
 *
 * The numbers come from the entry's `structured` payload, never from its prose.
 * A structure with a `review` is `kind: "other"` and offers nothing to roll.
 * Players do not roll a monster's save DC: they read it, so it is a label.
 */
import { parseExpression } from "@/lib/dice/dice";
import type { ParsedExpression } from "@/lib/dice/dice";
import { saveLabel } from "@/lib/statBlock/describeStructure";
import type { ActionOption, ActionStructure, DamagePart } from "@/types/statBlock.types";

/** The attack bonus to roll against, or null when this entry is not an attack. */
export function structuredAttackBonus(structure: ActionStructure): number | null {
  if (structure.review || structure.kind !== "attack" || !structure.attack) return null;
  return structure.attack.bonus;
}

/** "DC 14 Dex" for a save the player reads, or null. */
export function structuredSaveLabel(structure: ActionStructure): string | null {
  if (structure.review || !structure.save) return null;
  return saveLabel(structure.save);
}

/**
 * The choices of an "options" entry, each as a standalone structure so the same
 * helpers (save label, damage parts) read it as they read any attack or save.
 * Empty for any other kind or a reviewed entry.
 */
export function structuredOptionEntries(structure: ActionStructure): Array<{ name: string; structure: ActionStructure }> {
  if (structure.review || structure.kind !== "options") return [];
  return (structure.options ?? []).map((o: ActionOption) => ({
    name: o.name,
    structure: { kind: o.kind, attack: o.attack, save: o.save, source: structure.source },
  }));
}

/** The damage a player rolls: an attack's hit, or a save entry's failed-save damage. */
export function structuredDamageParts(structure: ActionStructure): DamagePart[] {
  if (structure.review) return [];
  if (structure.kind === "attack" && structure.attack) return structure.attack.hit;
  if (structure.kind === "save" && structure.save) return structure.save.fail;
  return [];
}

export interface CombinedDamage {
  parsed: ParsedExpression;
  /** "2d6+3 piercing + 2d6 poison" */
  label: string;
}

/** Merges every part into one roll; null when there are no parts or one cannot be parsed. */
export function combineDamageParts(parts: DamagePart[]): CombinedDamage | null {
  if (parts.length === 0) return null;
  const terms: ParsedExpression["terms"] = [];
  let modifier = 0;
  for (const part of parts) {
    const parsed = parseExpression(part.dice);
    if (!parsed) return null;
    terms.push(...parsed.terms);
    modifier += parsed.modifier;
  }
  const label = parts.map((p) => (p.type ? `${p.dice} ${p.type}` : p.dice)).join(" + ");
  return { parsed: { terms, modifier }, label };
}
