import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useArmorClass } from "@/composables/party/useArmorClass";
import { useWildshapeForm } from "@/composables/party/useWildshapeForm";
import { useHpDisplay } from "@/composables/play/useHpDisplay";
import { walkingSpeed } from "@/lib/movement";
import { effectiveAbilityScores } from "@/rules/characterChecks";
import { memberInitiativeModifier } from "@/rules/initiative";
import { passiveScore } from "@/rules/skillCheck";
import type { PartyMember } from "@/types/party.types";

/**
 * The numbers a player reads off their character at a glance (AC, initiative,
 * speed, passive Perception, hit points), as they stand right now. While Wild
 * Shaped they are the form's: its AC, walking speed and hit points (a 2024 form
 * keeps the character's own, `beast_hp` is null) and its DEX for initiative.
 * Shared by both Hearth cards so the two can never disagree.
 */
export function useMemberVitals(member: MaybeRefOrGetter<PartyMember>) {
  const { activeWildshape: wildshape, beastMonster } = useWildshapeForm(member);
  const { acFor } = useArmorClass();

  const scores = computed(() =>
    effectiveAbilityScores(toValue(member), {
      active: wildshape.value !== null,
      statBlock: beastMonster.value?.stat_block,
    }),
  );

  const armorClass = computed(() => wildshape.value?.beast_ac ?? acFor(toValue(member)));
  const initiative = computed(() => memberInitiativeModifier(toValue(member), scores.value.dex));
  const speed = computed(
    () => (wildshape.value ? walkingSpeed(beastMonster.value?.stat_block?.speed) : null) ?? toValue(member).speed,
  );
  const passivePerception = computed(() =>
    passiveScore(toValue(member), "perception", wildshape.value ? scores.value : undefined),
  );

  const current = computed(() => wildshape.value?.beast_hp ?? toValue(member).current_hp);
  const max = computed(() => wildshape.value?.beast_max_hp ?? toValue(member).max_hp);
  const temp = computed(() => toValue(member).temp_hp);
  const { hpColor: textClass, hpBarColor: barClass } = useHpDisplay(current, max);
  const pct = computed(() => (max.value > 0 ? Math.min(100, Math.max(0, (current.value / max.value) * 100)) : 0));
  const tempPct = computed(() => (max.value > 0 ? Math.min(100 - pct.value, (temp.value / max.value) * 100) : 0));

  return {
    wildshape,
    beastMonster,
    armorClass,
    initiative,
    speed,
    passivePerception,
    hp: computed(() => ({
      current: current.value,
      max: max.value,
      temp: temp.value,
      pct: pct.value,
      tempPct: tempPct.value,
      textClass: textClass.value,
      barClass: barClass.value,
    })),
  };
}
