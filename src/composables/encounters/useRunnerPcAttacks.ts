import { toRef, type Ref } from "vue";
import { computed } from "vue";
import { useCharacterFeatures } from "@/composables/features/useCharacterFeatures";
import { proficiencyBonusOf } from "@/rules/proficiencyBonus";
import type { PartyMember } from "@/types/party.types";

export function abilityModOf(score: number): number {
  return Math.floor((score - 10) / 2);
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
