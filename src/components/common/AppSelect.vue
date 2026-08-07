<template>
  <select
    v-model="model"
    :disabled="disabled"
    :aria-label="ariaLabel"
    :class="cn(base, sizeClass, block ? 'w-full' : 'shrink-0', className)"
  >
    <slot />
  </select>
</template>

<script setup lang="ts">
/**
 * Native <select> with the app's chrome on it (#561) — the ~49 sites that each
 * re-declared `bg-card border border-border rounded-md … font-cinzel` inline.
 * Generalises ListFilterSelect, which now wraps this.
 *
 * The picker stays native on purpose. reka-ui ships a Select primitive, but
 * swapping to it replaces the OS picker — which is the better control on mobile,
 * and the reason ListFilterSelect was written this way in the first place. That is
 * a product decision, not a refactor.
 *
 * Options come through the default slot so the caller keeps control of the
 * placeholder value ("" vs "all") and the ordering.
 */
import { computed, type HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

const model = defineModel<string | number | null>({ required: true });

const {
  size = "sm",
  block = false,
  disabled = false,
  ariaLabel,
  class: className,
} = defineProps<{
  size?: "xs" | "sm" | "md";
  /** Stretches to the full width of the parent instead of hugging its content. */
  block?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  class?: HTMLAttributes["class"];
}>();

const base =
  "bg-card border border-border text-foreground font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed";

const sizeClass = computed(() => {
  switch (size) {
    case "xs":
      return "rounded px-1.5 py-0.5 text-label";
    // min-h-11 is a ≥44px tap target on touch; ≥md reverts so desktop is unchanged.
    case "md":
      return "rounded-md px-2 py-2 min-h-11 md:min-h-0 text-label-lg";
    case "sm":
    default:
      return "rounded-md px-2 py-1.5 text-label-lg";
  }
});
</script>
