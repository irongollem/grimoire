import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useCharacterClasses } from "@/composables/party/useCharacterClasses";
import { useJackOfAllTrades } from "@/composables/party/useJackOfAllTrades";
import { useWildshapeForm } from "@/composables/party/useWildshapeForm";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { checkBonus, type CheckBonus } from "@/lib/table/checkBonus";
import type { RollAsk } from "@/lib/table/soloTypes";
import { effectiveAbilityScores } from "@/rules/characterChecks";
import type { PartyMember } from "@/types/party.types";

/**
 * What the played character adds to the roll the table asked for, from the sheet's own rules (`checkBonus`). Null
 * until the character and its class rows have loaded: Jack of All Trades hangs on them, and a bonus shown short for
 * a moment is a number the player would roll on.
 */
export function useTableCheck(member: MaybeRefOrGetter<PartyMember | null | undefined>, ask: MaybeRefOrGetter<RollAsk | null>) {
  const { ruleset } = useTableRuleset();
  const { activeWildshape, beastMonster } = useWildshapeForm(member);
  const { jack } = useJackOfAllTrades(member);
  const classes = useCharacterClasses(computed(() => toValue(member)?.id ?? null));

  return computed<CheckBonus | null>(() => {
    const m = toValue(member);
    const asked = toValue(ask);
    if (!m || !asked || classes.data.value === undefined) return null;
    const scores = effectiveAbilityScores(m, { active: activeWildshape.value !== null, statBlock: beastMonster.value?.stat_block });
    return checkBonus(asked, { member: m, scores, overrideScores: activeWildshape.value ? scores : undefined, jack: jack.value, ruleset: ruleset.value });
  });
}
