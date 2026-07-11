import { ref, readonly } from "vue";
import type { RollMode } from "@/lib/roller";

/**
 * Shared state for the long-press / right-click advantage-disadvantage picker
 * (#501). A single <RollModePicker> is mounted once (in the player layout) and
 * reads this module-level state; any roll trigger opens it via the `v-roll-mode`
 * directive, which resolves the returned promise with the chosen mode.
 */
interface PickerState {
  visible: boolean;
  /** Viewport coordinates to anchor the popover to. */
  x: number;
  y: number;
  resolve: ((mode: RollMode | null) => void) | null;
}

const state = ref<PickerState>({ visible: false, x: 0, y: 0, resolve: null });

/** Read-only view for the picker component. */
export const rollModePickerState = readonly(state);

/**
 * Open the picker at the given viewport coordinates. Resolves with the chosen
 * mode, or `null` if dismissed without a choice. Opening again first dismisses
 * any picker already showing.
 */
export function openRollModePicker(x: number, y: number): Promise<RollMode | null> {
  state.value.resolve?.(null);
  return new Promise((resolve) => {
    state.value = { visible: true, x, y, resolve };
  });
}

/** Resolve the open picker with `mode` (or `null` to dismiss) and close it. */
export function resolveRollModePicker(mode: RollMode | null): void {
  const resolve = state.value.resolve;
  state.value = { visible: false, x: 0, y: 0, resolve: null };
  resolve?.(mode);
}
