import type { Directive } from "vue";
import { setTooltipText } from "@/lib/tooltip";

/**
 * `v-tooltip="text"` — sets the tooltip text on an element without
 * relying on the `title` attribute promotion path. Useful when the text
 * comes from a computed value and you'd rather not see the native tooltip
 * flicker on first paint before the engine's MutationObserver picks it up.
 *
 * Usage:
 *   <button v-tooltip="`Switch to ${otherView}`">…</button>
 *   <Icon v-tooltip="t.label" />
 */
export const tooltip: Directive<HTMLElement, string | undefined | null> = {
  mounted(el, binding) {
    setTooltipText(el, binding.value);
  },
  updated(el, binding) {
    if (binding.value !== binding.oldValue) {
      setTooltipText(el, binding.value);
    }
  },
  beforeUnmount(el) {
    setTooltipText(el, null);
  },
};
