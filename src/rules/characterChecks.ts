import type { AbilityScores } from "@/types/multiclass.types";
import { abilityMod } from "@/rules/weaponAttack";
import type { PartyMember, SaveKey } from "@/types/party.types";

export const ABILITY_KEYS: readonly SaveKey[] = ["str", "dex", "con", "int", "wis", "cha"];

export interface SaveEntry {
  bonus: number;
  proficient: boolean;
}

/** The six scores a roll reads: with no member, a flat ten of each. */
const FLAT_SCORES: AbilityScores = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

function scoresOf(member: AbilityScores): AbilityScores {
  return { str: member.str, dex: member.dex, con: member.con, int: member.int, wis: member.wis, cha: member.cha };
}

/**
 * The scores a check or save uses. In a Wild Shape form the beast's STR, DEX and
 * CON replace the character's own while INT, WIS and CHA stay theirs. A form
 * whose stat block is not (yet) known leaves the character's scores alone.
 */
export function effectiveAbilityScores(
  member: AbilityScores | null | undefined,
  form: { active: boolean; statBlock: Pick<AbilityScores, "str" | "dex" | "con"> | null | undefined },
): AbilityScores {
  if (!member) return FLAT_SCORES;
  if (!form.active || !form.statBlock) return scoresOf(member);
  const { str, dex, con } = form.statBlock;
  return { ...scoresOf(member), str, dex, con };
}

/** Saving throw bonus and proficiency for each ability, from the scores in effect. */
export function savingThrowEntries(
  member: Pick<PartyMember, "saving_throw_proficiencies" | "proficiency_bonus"> | null | undefined,
  scores: AbilityScores,
): Record<string, SaveEntry> | undefined {
  if (!member) return undefined;
  return Object.fromEntries(
    ABILITY_KEYS.map((key) => {
      const proficient = member.saving_throw_proficiencies?.includes(key) ?? false;
      return [key, { bonus: abilityMod(scores[key]) + (proficient ? member.proficiency_bonus : 0), proficient }];
    }),
  );
}
