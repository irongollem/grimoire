import type { RulesetKey } from "@/types/ruleset.types";

const RITUAL_CASTERS_2014 = new Set(["Artificer", "Bard", "Cleric", "Druid", "Wizard"]);

export function canCastAsRitual(input: {
  ruleset: RulesetKey;
  className: string;
  hasRitualTag: boolean;
  isReadyToCast: boolean;
  isInSpellbook: boolean;
  isOfficialClass?: boolean;
}): boolean {
  if (!input.hasRitualTag) return false;

  // Ritual Adept lets Wizards cast ritual-tagged spells directly from their book.
  const official = input.isOfficialClass !== false;
  if (official && input.className === "Wizard" && input.isInSpellbook) return true;

  if (input.ruleset === "2024") return input.isReadyToCast;
  return official && RITUAL_CASTERS_2014.has(input.className) && input.isReadyToCast;
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
