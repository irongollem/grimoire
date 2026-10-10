<!--
  The app's boolean switch.

  It had exactly two consumers while 28 hand-rolled copies of the same track and
  knob lived in 23 other files, and the reason was the size: this shipped only
  `h-6 w-11`, which is the size **one** call site in the whole repo actually
  wanted. Every dense inline toggle — the AI generator panels, the Illuminate
  effect panels, the sharing rows — needed something smaller, could not ask for
  it, and drew its own. That is the recurring failure this sweep keeps finding: a
  primitive forces a value its call sites disagree with, so they route around it.

  The three sizes below are measured, not invented: 19 sites at `md`, 5 at `sm`,
  1 at `lg` (plus three near-misses that were drifting copies of the first two —
  a knob that travelled 3 instead of 3.5, a knob a half-step too big). `md` is
  the default because it is what most call sites mean.
-->
<template>
  <button
    type="button"
    role="switch"
    :class="cn('relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200', SIZES[size].track, modelValue ? 'bg-primary' : 'bg-muted', className)"
    :aria-checked="modelValue"
    :aria-label="ariaLabel"
    :disabled="disabled"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span
      :class="cn('pointer-events-none inline-block rounded-full bg-white shadow transition-transform duration-200', SIZES[size].knob, modelValue ? SIZES[size].on : SIZES[size].off)"
    />
  </button>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { SWITCH_SIZES_MAP as SIZES, type SwitchSize } from "./toggleSwitchVariants";

const {
  modelValue,
  size = "md",
  ariaLabel,
  disabled = false,
  class: className,
} = defineProps<{
  modelValue: boolean;
  /** `md` (default) for panels and inline rows; `lg` for settings rows with a description. */
  size?: SwitchSize;
  ariaLabel?: string;
  disabled?: boolean;
  class?: HTMLAttributes["class"];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();
</script>
