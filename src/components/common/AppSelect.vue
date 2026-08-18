<template>
  <select
    ref="el"
    :value="model"
    :disabled="disabled"
    :aria-label="ariaLabel"
    :class="cn(fieldVariants({ tone, size, control: 'select', weight }), block ? 'w-full' : 'shrink-0', className)"
    @change="onChange"
  >
    <slot />
  </select>
</template>

<script setup lang="ts" generic="T extends string | number | null | undefined">
/**
 * Native <select> with the app's chrome on it (#561) — the ~49 sites that each
 * re-declared `bg-card border border-border rounded-md … font-cinzel` inline.
 * ListFilterSelect wraps this and names the filter-row size.
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
import { useTemplateRef, type HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { fieldVariants, type FieldSize, type FieldTone, type FieldWeight } from "./fieldVariants";

/** Vue stashes a bound `<option :value="x">` on the element as `_value`. */
type OptionWithValue = HTMLOptionElement & { _value?: unknown };

/**
 * `v-model.number` is common on level/count pickers, and a component that ignored
 * the modifier would hand the caller a string — the option value read back as
 * `"3"`, silently failing every `includes()` and arithmetic downstream. Hence the
 * explicit `:value` + `@change` rather than `v-model` on the native element.
 */
const [model, modifiers] = defineModel<T, "number">({ required: true });

const {
  size = "sm",
  tone = "card",
  weight = "semibold",
  block = false,
  disabled = false,
  ariaLabel,
  class: className,
} = defineProps<{
  size?: FieldSize;
  /**
   * Surface it sits on — see fieldVariants. Defaults to `card`, which is what this
   * component hard-coded before: a select nested in a `bg-muted` or `bg-background`
   * panel came out `bg-card` regardless of depth, so call sites were overriding it
   * with a `class="bg-muted"` string — four times in RuleEditView alone. Mirrors
   * AppInput's prop of the same name; the asymmetry was the bug.
   */
  tone?: FieldTone;
  /**
   * Defaults to `semibold`, which this component used to hard-code — so a select
   * that rendered at normal weight before could only get back there with a
   * `class="font-normal"` override at the call site (three of those already
   * exist). `fieldVariants` has carried a `weight` axis all along; not reading it
   * was the bug, exactly as with `tone`.
   */
  weight?: FieldWeight;
  /** Stretches to the full width of the parent instead of hugging its content. */
  block?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  class?: HTMLAttributes["class"];
}>();


function onChange(event: Event) {
  const el = event.target as HTMLSelectElement;
  const option = el.selectedOptions[0] as OptionWithValue | undefined;
  // `select.value` is always a string, and for `<option :value="null">` Vue removes
  // the value attribute entirely so it degrades to the option's TEXT. Vue's own
  // v-model avoids that by reading the `_value` it stashes for bound option values;
  // do the same, or `:value="null"` yields "— pick one —" and `:value="7"` yields "7".
  const raw = option && "_value" in option ? option._value : el.value;
  const coerced = modifiers.number && typeof raw === "string" ? Number(raw) : raw;
  model.value = coerced as T;
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
