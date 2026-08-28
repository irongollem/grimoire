import { computed, type Ref } from "vue";
import {
  useOptionalRules,
  isRuleEffectivelyEnabled,
  resolveRuleConfig,
} from "@/composables/rules/useOptionalRules";

/**
 * Shared wiring for the turn-timer optional rule. Both the DM's EncounterRunner
 * (store-backed) and the player's encounter panel (liveState-backed) render the
 * same TurnTimer component; only the source of "current round" and "active
 * combatant" differs, so the caller passes those in as refs.
 *
 * - `turnTimerSeconds` — the configured duration, or null when the rule is off.
 * - `turnResetKey` — changes whenever the turn advances, restarting the countdown.
 */
export function useTurnTimerConfig(
  round: Ref<number>,
  activeCombatantId: Ref<string | null | undefined>,
) {
  const { data: campaignRules } = useOptionalRules();

  const turnTimerSeconds = computed(() =>
    isRuleEffectivelyEnabled(campaignRules.value, "turn_timer")
      ? resolveRuleConfig(campaignRules.value, "turn_timer").seconds
      : null,
  );

  const turnResetKey = computed(() => `${round.value}:${activeCombatantId.value ?? ""}`);

  return { turnTimerSeconds, turnResetKey };
}
