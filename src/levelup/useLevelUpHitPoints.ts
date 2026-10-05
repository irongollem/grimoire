import { computed, ref, type ComputedRef } from "vue";
import type { DieSize } from "@/lib/dice/dice";
import { usePromptedRoll } from "@/composables/dice/usePromptedRoll";
import type { PartyMember } from "@/types/party.types";

export type HpMode = "average" | "roll" | "max";

/**
 * Hit points and hit dice for the level being taken. The die comes from the
 * definition the class is pinned to and nowhere else; it is null while that
 * definition loads, and the step waits (Confirm stays disabled) rather than
 * compute hit points with a guessed die.
 */
export function useLevelUpHitPoints(input: {
  member: () => PartyMember;
  hitDie: ComputedRef<number | null>;
  subclassHpBonus: ComputedRef<number>;
  nextLevel: ComputedRef<number>;
}) {
  const { hitDie } = input;
  const conMod = computed(() => Math.floor((input.member().con - 10) / 2));
  const hpAverageValue = computed(() => (hitDie.value === null ? null : Math.ceil(hitDie.value / 2) + 1));

  const hpMode = ref<HpMode>("average");
  const rolledHp = ref<number | null>(null);

  function setHpMode(mode: HpMode) {
    if (hpMode.value === mode) return;
    hpMode.value = mode;
    // Clear any locked roll so switching to "roll" re-exposes the button.
    rolledHp.value = null;
  }

  const { promptRoll } = usePromptedRoll();

  async function rollHp() {
    if (rolledHp.value !== null || hitDie.value === null) return;
    const r = await promptRoll({
      counts: { [hitDie.value as DieSize]: 1 },
      modifier: 0,
      label: `Hit Die (1d${hitDie.value})`,
      silent: true,
    });
    if (r) rolledHp.value = r.total;
  }

  /** HP gained at this level-up. Minimum 1 per 5e guidance (no negative levels). */
  const hpGain = computed(() => {
    // No die yet: nothing to gain. canConfirm refuses to apply until it resolves.
    if (hitDie.value === null || hpAverageValue.value === null) return 0;
    const bonus = input.subclassHpBonus.value;
    if (hpMode.value === "roll") {
      if (rolledHp.value === null) return 0;
      return Math.max(1, rolledHp.value + conMod.value + bonus);
    }
    if (hpMode.value === "max") return Math.max(1, hitDie.value + conMod.value + bonus);
    return Math.max(1, hpAverageValue.value + conMod.value + bonus);
  });

  const currentHitDice = computed(() => {
    const m = input.member();
    return Math.min(m.level, m.hit_dice_remaining ?? m.level);
  });
  const newHitDiceCount = computed(() => Math.min(input.nextLevel.value, currentHitDice.value + 1));

  return { conMod, hpAverageValue, hpMode, rolledHp, setHpMode, rollHp, hpGain, currentHitDice, newHitDiceCount };
}
