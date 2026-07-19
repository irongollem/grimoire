import type { RulesetKey } from "@/types/ruleset.types";

const RITUAL_CASTERS_2014 = new Set(["Artificer", "Bard", "Cleric", "Druid", "Wizard"]);

export function canCastAsRitual(input: {
  ruleset: RulesetKey;
  className: string;
  hasRitualTag: boolean;
  isReadyToCast: boolean;
  isInSpellbook: boolean;
}): boolean {
  if (!input.hasRitualTag) return false;

  // Ritual Adept lets Wizards cast ritual-tagged spells directly from their book.
  if (input.className === "Wizard" && input.isInSpellbook) return true;

  if (input.ruleset === "2024") return input.isReadyToCast;
  return RITUAL_CASTERS_2014.has(input.className) && input.isReadyToCast;
}
