import { ref, readonly } from "vue";
import type { RollMode } from "@/lib/dice/roller";
import { combineModes } from "@/lib/dice/roller";

/**
 * The roll mode a player picked on the sheet for their NEXT d20 roll. One
 * module-level value, so the control on the sheet and every roll button agree
 * without each call site passing it along: `usePromptedRoll` folds it into the
 * roll and puts it back to Normal, so a pick never lingers into a roll the
 * player did not mean it for.
 */
const next = ref<RollMode>("normal");

/** Read-only, for controls that show the pick. */
export const nextRollMode = readonly(next);

export function setNextRollMode(mode: RollMode): void {
  next.value = mode;
}

/**
 * Fold the pending pick into `base` (a condition-imposed or long-press mode)
 * and reset it. Opposing sources cancel to normal, as 5e says.
 */
export function takeNextRollMode(base: RollMode): RollMode {
  const picked = next.value;
  next.value = "normal";
  return combineModes(base, picked);
}

export function useNextRollMode() {
  return { nextRollMode, setNextRollMode };
}

const HINT_KEY = "grimoire_roll_mode_hint_seen";

/** True once the long-press tip has been shown on this device. */
export function rollModeHintSeen(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function markRollModeHintSeen(): void {
  try {
    localStorage.setItem(HINT_KEY, "1");
  } catch {
    // Storage can be blocked; the tip then shows again, which is harmless.
  }
}
