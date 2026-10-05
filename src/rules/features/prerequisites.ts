import type { AbilityKey } from "@/rules/characterCreation";
import type { FeatAbilityIncrease, FeatPrerequisites } from "./mechanics.types";

const ABILITY_NAMES: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

const ARMOR_NAMES = {
  light: "Light armor training",
  medium: "Medium armor training",
  heavy: "Heavy armor training",
  shield: "Shield training",
} as const;

export interface PrerequisiteCharacter {
  level: number;
  abilityScores: Record<AbilityKey, number>;
  canCastSpells: boolean;
  armorProficiencies: ReadonlySet<"light" | "medium" | "heavy" | "shield">;
  hasFightingStyleFeature: boolean;
}

/** Every listed condition must hold; `unmet` names each one that does not, for the picker to show. */
export function featPrerequisitesMet(
  pre: FeatPrerequisites | null,
  character: PrerequisiteCharacter,
): { met: boolean; unmet: string[] } {
  const unmet: string[] = [];
  if (pre) {
    if (pre.level !== undefined && character.level < pre.level) unmet.push(`Level ${pre.level}`);
    if (pre.abilities) {
      const entries = (Object.entries(pre.abilities.any_of) as [AbilityKey, number][]).filter(
        (e) => typeof e[1] === "number",
      );
      if (entries.length > 0 && !entries.some(([ability, min]) => character.abilityScores[ability] >= min)) {
        // The book prints "Strength or Dexterity 13"; a mixed list reads "Strength 13 or Dexterity 15".
        const scores = new Set(entries.map((e) => e[1]));
        const names = entries.map(([a, min]) => (scores.size === 1 ? ABILITY_NAMES[a] : `${ABILITY_NAMES[a]} ${min}`));
        unmet.push(scores.size === 1 ? `${names.join(" or ")} ${entries[0][1]}` : names.join(" or "));
      }
    }
    if (pre.spellcasting && !character.canCastSpells) unmet.push("The ability to cast at least one spell");
    if (pre.armor && !character.armorProficiencies.has(pre.armor)) unmet.push(ARMOR_NAMES[pre.armor]);
    if (pre.fighting_style_feature && !character.hasFightingStyleFeature) unmet.push("The Fighting Style feature");
  }
  return { met: unmet.length === 0, unmet };
}

/**
 * Applies a feat's ability increase. Throws on a pick the feat does not offer
 * (a programming error in the picker); a score at the cap just stops there,
 * because the book says "to a maximum of 20", not "not if it would exceed".
 */
export function applyAbilityIncrease(
  scores: Record<AbilityKey, number>,
  increase: FeatAbilityIncrease,
  pick: { primary: AbilityKey; secondary?: AbilityKey },
): Record<AbilityKey, number> {
  if (!increase.abilities.includes(pick.primary)) {
    throw new Error(`${pick.primary} is not one of the abilities this feat increases`);
  }
  const next = { ...scores };
  const raise = (ability: AbilityKey, by: number) => {
    // A score already above the cap (a magic item) is left alone, never lowered.
    next[ability] = Math.max(next[ability], Math.min(increase.max, next[ability] + by));
  };
  if (!increase.split || pick.secondary === undefined) {
    raise(pick.primary, increase.amount);
    return next;
  }
  if (pick.secondary === pick.primary) throw new Error("A split increase needs two different abilities");
  if (!increase.abilities.includes(pick.secondary)) {
    throw new Error(`${pick.secondary} is not one of the abilities this feat increases`);
  }
  raise(pick.primary, 1);
  raise(pick.secondary, 1);
  return next;
}
