import { toRef, type Ref } from "vue";
import { computed } from "vue";
import { useCharacterFeatures } from "@/composables/features/useCharacterFeatures";
import type { PartyMember } from "@/types/party.types";

export function abilityModOf(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** The member's proficiency bonus: the stored one, else the level's (PHB "Proficiency Bonus" table). */
export function proficiencyBonusOf(member: Pick<PartyMember, "proficiency_bonus" | "level">): number {
  if (member.proficiency_bonus) return member.proficiency_bonus;
  const l = member.level;
  if (l >= 17) return 6;
  if (l >= 13) return 5;
  if (l >= 9) return 4;
  if (l >= 5) return 3;
  return 2;
}

/**
 * What `RunnerPcAttacks` needs besides the member, in one place: the full sheet's panel and the Play turn card
 * both mount that list, so they must derive its inputs identically.
 */
export function useRunnerPcAttacks(member: Ref<PartyMember> | (() => PartyMember)) {
  const source = toRef(member);
  return {
    features: useCharacterFeatures(source),
    profBonus: computed(() => proficiencyBonusOf(source.value)),
    abilityMod: abilityModOf,
  };
}
