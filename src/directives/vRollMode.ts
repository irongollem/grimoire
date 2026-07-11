import type { Directive, DirectiveBinding } from "vue";
import type { RollMode } from "@/lib/roller";
import { openRollModePicker } from "@/composables/useRollModePicker";

/**
 * `v-roll-mode` — attach advantage/disadvantage selection to a roll trigger (#501).
 *
 * A plain click/tap fires the handler with `null` (roll as normal — any
 * condition-derived mode still applies). A right-click (desktop) or long-press
 * (touch) opens the Normal/Advantage/Disadvantage picker; the chosen mode is
 * passed to the handler, which should combine it with any condition mode via
 * `combineModes` before rolling.
 *
 * Usage: replace `@click="rollSkill(s)"` with
 *        `v-roll-mode="(mode) => rollSkill(s, mode)"`.
 */
export type RollModeHandler = (mode: RollMode | null, ev: Event) => void;

/**
 * Directive value. Pass a bare handler to always enable the picker, or an
 * object to gate it — `enabled: false` keeps the plain click but disables the
 * long-press/right-click picker (used by shared tables that also render in DM /
 * read-only contexts where advantage selection doesn't apply).
 */
export type RollModeBinding = RollModeHandler | { enabled?: boolean; on: RollModeHandler };

function resolveBinding(value: RollModeBinding): { enabled: boolean; on: RollModeHandler } {
  if (typeof value === "function") return { enabled: true, on: value };
  return { enabled: value.enabled !== false, on: value.on };
}

const LONG_PRESS_MS = 450;
/** Movement (px) that cancels a long-press so scrolling never triggers it. */
const MOVE_TOLERANCE = 10;

interface Listeners {
  onClick: (e: MouseEvent) => void;
  onContextMenu: (e: MouseEvent) => void;
  onTouchStart: (e: TouchEvent) => void;
  onTouchMove: (e: TouchEvent) => void;
  onTouchEnd: () => void;
}

const registry = new WeakMap<HTMLElement, Listeners>();

export const vRollMode: Directive<HTMLElement, RollModeBinding> = {
  mounted(el, binding: DirectiveBinding<RollModeBinding>) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let longFired = false;
    let startX = 0;
    let startY = 0;

    // Read fresh each event so a reactive `enabled` toggle is honoured.
    const call = (mode: RollMode | null, ev: Event) => resolveBinding(binding.value).on(mode, ev);
    const pickerEnabled = () => resolveBinding(binding.value).enabled;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const onClick = (e: MouseEvent) => {
      // Swallow the synthetic click that some browsers fire after a long-press.
      if (longFired) {
        longFired = false;
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      call(null, e);
    };

    const onContextMenu = async (e: MouseEvent) => {
      if (!pickerEnabled()) return;
      e.preventDefault();
      const mode = await openRollModePicker(e.clientX, e.clientY);
      if (mode) call(mode, e);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (!pickerEnabled()) return;
      longFired = false;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      clearTimer();
      timer = setTimeout(async () => {
        longFired = true;
        const mode = await openRollModePicker(startX, startY);
        if (mode) call(mode, e);
      }, LONG_PRESS_MS);
    };

    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (
        Math.abs(t.clientX - startX) > MOVE_TOLERANCE ||
        Math.abs(t.clientY - startY) > MOVE_TOLERANCE
      ) {
        clearTimer();
      }
    };

    const onTouchEnd = () => clearTimer();

    el.addEventListener("click", onClick);
    el.addEventListener("contextmenu", onContextMenu);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);

    registry.set(el, { onClick, onContextMenu, onTouchStart, onTouchMove, onTouchEnd });
  },

  unmounted(el) {
    const l = registry.get(el);
    if (!l) return;
    el.removeEventListener("click", l.onClick);
    el.removeEventListener("contextmenu", l.onContextMenu);
    el.removeEventListener("touchstart", l.onTouchStart);
    el.removeEventListener("touchmove", l.onTouchMove);
    el.removeEventListener("touchend", l.onTouchEnd);
    el.removeEventListener("touchcancel", l.onTouchEnd);
    registry.delete(el);
  },
};
