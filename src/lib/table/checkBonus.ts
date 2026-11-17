import { abilityMod } from "@/rules/weaponAttack";
import { savingThrowEntries } from "@/rules/characterChecks";
import { getExhaustionD20Penalty, hasCheckDisadvantage, hasSaveDisadvantage } from "@/rules/conditions";
import { jackOfAllTradesBonus, skillCheckBonus, type JackOfAllTrades, type SkillCheckSource } from "@/rules/skillCheck";
import { SKILLS, type PartyMember } from "@/types/party.types";
import type { AbilityScores } from "@/types/multiclass.types";
import type { RulesetKey } from "@/types/ruleset.types";
import type { RollAsk } from "./soloTypes";

export interface CheckBonusInput {
  member: SkillCheckSource & Pick<PartyMember, "saving_throw_proficiencies" | "conditions">;
  /** The scores in effect (a Wild Shape form's STR, DEX and CON replace the character's own). */
  scores: AbilityScores;
  /** Set only while a Wild Shape form overrides the scores, as the skill list passes it. */
  overrideScores?: AbilityScores;
  jack: JackOfAllTrades;
  /** The table's edition: conditions and exhaustion follow the table, not the character. */
  ruleset: RulesetKey;
}

export interface CheckBonus {
  bonus: number;
  /** A condition imposes disadvantage on this roll. */
  forcedDisadvantage: boolean;
}

/**
 * What the character adds to the d20 for the roll the table asked for, scored exactly as the character sheet scores
 * it (`SkillRollList`, `useCharacterRolls`), so the number on the card is the number on the sheet.
 *
 * A skill check is the sheet's skill bonus; when the table asks for a skill with another ability than the skill's
 * own (PHB 2014 "Variant: Skills with Different Abilities", Strength (Intimidation)) the ability modifier is swapped.
 */
export function checkBonus(ask: RollAsk, input: CheckBonusInput): CheckBonus {
  const { member, scores, overrideScores, jack, ruleset } = input;
  const penalty = getExhaustionD20Penalty(member.conditions, ruleset);
  if (ask.kind === "save") {
    const entry = savingThrowEntries(member, scores)?.[ask.ability];
    return {
      bonus: (entry?.bonus ?? abilityMod(scores[ask.ability])) + penalty,
      forcedDisadvantage: hasSaveDisadvantage(member.conditions, ask.ability, ruleset),
    };
  }
  const forcedDisadvantage = hasCheckDisadvantage(member.conditions, ruleset);
  if (ask.skill === null) {
    return { bonus: abilityMod(scores[ask.ability]) + jackOfAllTradesBonus(jack, member.proficiency_bonus, "ability") + penalty, forcedDisadvantage };
  }
  const skill = SKILLS.find((s) => s.key === ask.skill);
  const swap = skill !== undefined && skill.ability !== ask.ability ? abilityMod(scores[ask.ability]) - abilityMod(scores[skill.ability]) : 0;
  return { bonus: skillCheckBonus(member, ask.skill, jack, overrideScores) + swap + penalty, forcedDisadvantage };
}
