<template>
  <select
    ref="el"
    :value="model"
    :disabled="disabled"
    :aria-label="ariaLabel"
    :class="cn(base, sizeClass, block ? 'w-full' : 'shrink-0', className)"
    @change="onChange"
  >
    <slot />
  </select>
</template>

<script setup lang="ts" generic="T extends string | number | null">
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
 *
 * Generic over the value type so a field typed as a literal union
 * (`"quest_complete" | "objective_done"`) keeps that type through `v-model`
 * instead of widening to `string` and forcing a cast at the call site.
 */
import { computed, useTemplateRef, type HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

/**
 * `v-model.number` is common on level/count pickers, and a component that ignored
 * the modifier would hand the caller a string — the option value read back as
 * `"3"`, silently failing every `includes()` and arithmetic downstream. Hence the
 * explicit `:value` + `@change` rather than `v-model` on the native element.
 */
const [model, modifiers] = defineModel<T, "number">({ required: true });

const {
  size = "sm",
  block = false,
  disabled = false,
  ariaLabel,
  class: className,
} = defineProps<{
  size?: "xs" | "sm" | "md" | "lg";
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
    // Matches AppInput's `lg`: the 14px step, for pickers sitting in a field row
    // next to body text rather than in a dense filter bar.
    case "lg":
      return "rounded-md px-2 py-1.5 text-sm tracking-wider";
    case "sm":
    default:
      return "rounded-md px-2 py-1.5 text-label-lg";
  }
});

function onChange(event: Event) {
  const raw = (event.target as HTMLSelectElement).value;
  // A native <select> only ever yields a string; the cast is the one place that
  // widening is unavoidable, and it is confined here rather than at every call site.
  model.value = (modifiers.number ? Number(raw) : raw) as T;
}

// A bare `ref` on this component would resolve to the component instance, so
// `selectRef.value?.focus()` at a call site would silently do nothing. Expose the
// element and the handful of methods callers actually reach for.
const el = useTemplateRef<HTMLSelectElement>("el");
defineExpose({
  el,
  focus: (options?: FocusOptions) => el.value?.focus(options),
});
</script>
