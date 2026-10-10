import { computed, onBeforeUnmount, ref, toValue, type MaybeRefOrGetter } from "vue";
import { usePromptedRoll } from "@/composables/dice/usePromptedRoll";
import { setNextRollMode } from "@/composables/dice/useNextRollMode";
import { useWildshapeForm } from "@/composables/party/useWildshapeForm";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import type { RollResult } from "@/components/common/feedback/RollToast.vue";
import { combineModes, type RollMode } from "@/lib/dice/dice";
import { effectiveAbilityScores, savingThrowEntries } from "@/rules/characterChecks";
import {
  getExhaustionD20Penalty,
  hasAttackDisadvantage,
  hasCheckDisadvantage,
  hasSaveDisadvantage,
} from "@/rules/conditions";
import type { PartyMember } from "@/types/party.types";

/**
 * Everything that rolls a d20 for a character, in one place: Wild Shape scores,
 * conditions (disadvantage, 2024 Exhaustion), roll modes and the roll toast.
 * The character sheet and Hearth both read it, so an ability check or a save
 * cannot behave differently on the two. Skills roll through `SkillRollList`,
 * which takes `effectiveScores`, `checkDisadvantage` and `exhaustionD20Penalty`
 * from here and reports its result to `onChildRoll`.
 */
export function useCharacterRolls(member: MaybeRefOrGetter<PartyMember | null | undefined>) {
  const { promptRoll } = usePromptedRoll();
  // Only used for condition-effect helpers (table rules).
  const { ruleset } = useTableRuleset();
  const { activeWildshape, beastMonster } = useWildshapeForm(member);

  // Beast's ability scores override STR/DEX/CON; player keeps INT/WIS/CHA.
  const effectiveScores = computed(() =>
    effectiveAbilityScores(toValue(member), {
      active: activeWildshape.value !== null,
      statBlock: beastMonster.value?.stat_block,
    }),
  );
  /** What a skill list takes as `override-scores`: only a Wild Shape form overrides. */
  const overrideScores = computed(() => (activeWildshape.value ? effectiveScores.value : undefined));
  const saves = computed(() => savingThrowEntries(toValue(member), effectiveScores.value));

  const conditions = computed(() => toValue(member)?.conditions ?? []);
  const attackDisadvantage = computed(() => hasAttackDisadvantage(conditions.value, ruleset.value));
  const checkDisadvantage = computed(() => hasCheckDisadvantage(conditions.value, ruleset.value));
  // 2024-only flat penalty (0 under 2014, which uses the disadvantage flags above instead).
  const exhaustionD20Penalty = computed(() => getExhaustionD20Penalty(conditions.value, ruleset.value));

  // Roll toast (shared across all rolling children).
  const lastRoll = ref<RollResult | null>(null);
  function onChildRoll(result: RollResult) {
    lastRoll.value = { ...result };
  }

  async function doRoll(label: string, modifier: number, mode: RollMode = "normal") {
    const modeTag = mode === "advantage" ? " (Adv)" : mode === "disadvantage" ? " (Dis)" : "";
    const result = await promptRoll({ counts: { 20: 1 }, modifier, label: label + modeTag, mode });
    if (!result) return;
    const kept = result.breakdown.find((d) => !d.dropped)!;
    lastRoll.value = { label: result.label, dice: kept.val, modifier, total: result.total };
  }

  function rollAbility(_key: string, label: string, mod: number, override: RollMode | null = null) {
    return doRoll(
      `${label} Check`,
      mod + exhaustionD20Penalty.value,
      combineModes(override ?? "normal", checkDisadvantage.value ? "disadvantage" : "normal"),
    );
  }
  function rollSave(key: string, label: string, bonus: number, override: RollMode | null = null) {
    const saveDisadvantage = hasSaveDisadvantage(conditions.value, key, ruleset.value);
    return doRoll(
      `${label} Save`,
      bonus + exhaustionD20Penalty.value,
      combineModes(override ?? "normal", saveDisadvantage ? "disadvantage" : "normal"),
    );
  }

  // A pick made on this surface is for its next roll, not a stranger's.
  onBeforeUnmount(() => setNextRollMode("normal"));

  return {
    activeWildshape,
    beastMonster,
    effectiveScores,
    overrideScores,
    saves,
    attackDisadvantage,
    checkDisadvantage,
    exhaustionD20Penalty,
    lastRoll,
    onChildRoll,
    rollAbility,
    rollSave,
  };
}
