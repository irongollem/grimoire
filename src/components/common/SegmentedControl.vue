<template>
  <ToggleGroupRoot
    :model-value="modelValue"
    type="single"
    :disabled="disabled"
    :orientation="orientation"
    :class="cn(
      wrap ? 'flex flex-wrap' : 'inline-flex',
      'items-center',
      block ? 'w-full' : '',
      gapClass,
      className,
    )"
    @update:model-value="onUpdate"
  >
    <ToggleGroupItem
      v-for="option in options"
      :key="String(option.value)"
      :value="option.value"
      :disabled="option.disabled"
      as-child
    >
      <AppButton
        :variant="variant"
        :size="size"
        :label="option.label"
        :icon="option.icon"
        :tooltip="option.tooltip"
        :active="modelValue === option.value"
        :class="block ? 'flex-1' : ''"
      />
    </ToggleGroupItem>
  </ToggleGroupRoot>
</template>

<script setup lang="ts" generic="T extends string | number">
/**
 * A row of mutually-exclusive options — source pickers, view switchers, tab bars,
 * ability toggles (#561). It replaces the ~85 hand-rolled toggle buttons that each
 * carried their own `:class="selected ? … : …"` ternary, and with them four rival
 * "selected" treatments (`bg-primary`, `bg-primary/15 ring-1`, `border-primary
 * bg-primary/10`, `bg-muted`); AppButton's `active` variant is now the only one.
 *
 * Built on reka-ui's ToggleGroup, which is the reason to take that dependency:
 * roving focus, arrow-key navigation with wraparound, and the `aria-pressed` /
 * `data-state` wiring all come free. None of the hand-rolled versions had any of it.
 *
 * ToggleGroupItem is `as-child`, so its behaviour merges onto AppButton and the
 * rendered DOM is still a single <button> per option.
 */
import { computed, type Component, type HTMLAttributes } from "vue";
import { ToggleGroupItem, ToggleGroupRoot } from "reka-ui";
import { cn } from "@/lib/utils";
import AppButton from "./AppButton.vue";
import type { ButtonVariants } from "./appButtonVariants";

export interface SegmentedOption<V> {
  value: V;
  label: string;
  icon?: Component;
  tooltip?: string;
  disabled?: boolean;
}

const {
  options,
  variant = "subtle",
  size = "sm",
  block = false,
  wrap = false,
  disabled = false,
  orientation = "horizontal",
  gap = "tight",
  class: className,
} = defineProps<{
  modelValue: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  variant?: ButtonVariants["variant"];
  size?: ButtonVariants["size"];
  /** Stretches the group and divides the width evenly between options. */
  block?: boolean;
  /**
   * Lets the options wrap onto a second line. Needed wherever the option count is
   * data-driven (subrace pickers, tag rows) — the default `inline-flex` would
   * overflow its container instead.
   */
  wrap?: boolean;
  disabled?: boolean;
  orientation?: "horizontal" | "vertical";
  /** `tight` butts the options together; `loose` spaces them like a toolbar. */
  gap?: "tight" | "loose";
  class?: HTMLAttributes["class"];
}>();

const emit = defineEmits<{ (e: "update:modelValue", value: T): void }>();

const gapClass = computed(() => (gap === "loose" ? "gap-2" : "gap-1"));

// ToggleGroup allows deselecting the active item, which for a segmented picker
// would leave no option chosen. Ignore the empty payload and keep the selection.
function onUpdate(value: unknown) {
  if (value === undefined || value === null || value === "") return;
  emit("update:modelValue", value as T);
}
</script>
