import type { RulesetKey } from "@/types/ruleset.types";

/** Mirrors class_ritual_policies.ritual_style (migration 20260720000043). */
export type RitualStyle = "none" | "prepared" | "known" | "spellbook" | "spellbook_or_prepared";

/** Classes without a class_ritual_policies row fall back to the edition
 * default: 2024 rituals ride on preparation, 2014 rituals need a class feature. */
export function defaultRitualStyle(ruleset: RulesetKey): RitualStyle {
  return ruleset === "2024" ? "prepared" : "none";
}

export function canCastAsRitual(input: {
  ritualStyle: RitualStyle;
  hasRitualTag: boolean;
  isReadyToCast: boolean;
  isInSpellbook: boolean;
}): boolean {
  if (!input.hasRitualTag) return false;
  switch (input.ritualStyle) {
    case "none":
      return false;
    case "known":
      return true;
    case "prepared":
      return input.isReadyToCast;
    // The two spellbook styles differ server-side (2014 requires the book
    // entry itself); in the UI a prepared Wizard spell is always in the book,
    // so both accept either signal.
    case "spellbook":
    case "spellbook_or_prepared":
      return input.isInSpellbook || input.isReadyToCast;
  }
}

/**
 * Effects that depend on an attack or saving throw must wait for that outcome.
 * Healing and explicitly automatic damage can be rolled with the cast; all
 * other damage stays available as a deliberate follow-up action.
 */
export function canAutoRollSpellEffect(
  attackType: string | null,
  effect: "damage" | "healing",
  mechanicsReviewed = true,
): boolean {
  if (!mechanicsReviewed) return false;
  if (effect === "healing") return attackType !== "ranged_spell" && attackType !== "melee_spell" && attackType !== "save";
  return attackType === "automatic";
}
