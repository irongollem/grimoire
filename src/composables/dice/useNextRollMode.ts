import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { ref, readonly } from "vue";
import { NORMAL_ROLL, type RollModeKey } from "@/lib/dice/diceRules";
import { activeDiceRules } from "@/systems/registry";

/**
 * The roll option (5e: advantage/disadvantage) a player picked on the sheet for their NEXT roll
 * it applies to. One
 * module-level value, so the control on the sheet and every roll button agree
 * without each call site passing it along: `usePromptedRoll` folds it into the
 * roll and puts it back to a normal roll, so a pick never lingers into a roll the
 * player did not mean it for.
 */
const next = ref<RollModeKey>(NORMAL_ROLL);

/** Read-only, for controls that show the pick. */
export const nextRollMode = readonly(next);

export function setNextRollMode(mode: RollModeKey): void {
  next.value = mode;
}

/**
 * Fold the pending pick into `base` (a condition-imposed or long-press option)
 * and reset it. The active system decides how two options combine (5e: opposing
 * sources cancel to normal).
 */
export function takeNextRollMode(base: RollModeKey): RollModeKey {
  const picked = next.value;
  next.value = NORMAL_ROLL;
  return activeDiceRules().combine(base, picked);
}

const HINT_KEY = "grimoire_roll_mode_hint_seen";

/** True once the long-press tip has been shown on this device. */
export function rollModeHintSeen(): boolean {
  try {
    return safeLocalStorage().getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function markRollModeHintSeen(): void {
  try {
    safeLocalStorage().setItem(HINT_KEY, "1");
  } catch {
    // Storage can be blocked; the tip then shows again, which is harmless.
  }
}
