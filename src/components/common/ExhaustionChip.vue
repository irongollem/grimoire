<template>
  <!--
    Single chip for the Exhaustion condition. Shows six pips (one per SRD
    level); filled pips count from the left. Click a pip to jump to that
    level — clicking the currently-max pip again decrements (same toggle
    behaviour as death-save pips). The `×` removes exhaustion entirely.

    The whole chip carries the SRD rules text in `title=""` so hover /
    long-press gives the DM what each level does.
  -->
  <span :class="wrapperClass" :title="isTouch ? undefined : tooltip">
    <span class="text-label font-semibold">Exhaustion</span>

    <span class="flex items-center gap-0.5">
      <button
        v-for="i in MAX_EXHAUSTION"
        :key="i"
        type="button"
        class="h-2.5 w-2.5 rounded-full border transition-colors focus:outline-none"
        :class="pipClass(i)"
        :aria-label="`Set exhaustion level ${i}`"
        @click.stop="onPipClick(i)"
      />
    </span>

    <button
      type="button"
      class="ml-0.5 text-base leading-none opacity-70 hover:opacity-100 transition-opacity"
      :class="variant === 'amber' ? 'text-ink-caution ' : 'text-destructive'"
      aria-label="Remove exhaustion"
      title="Remove exhaustion"
      @click.stop="emit('update', 0)"
    >×</button>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { MAX_EXHAUSTION, getConditionDescription } from "@/rules/conditions";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { useIsTouch } from "@/composables/useBreakpoint";

const isTouch = useIsTouch();

type Variant = "amber" | "destructive";

const { level, variant = "destructive" } = defineProps<{
  level: number;
  /** Chip colour scheme — matches the host-view's condition palette. */
  variant?: Variant;
}>();

const emit = defineEmits<{
  (e: "update", newLevel: number): void;
}>();

const { ruleset } = useTableRuleset();

const tooltip = computed(() => getConditionDescription(`Exhausted ${level}`, ruleset.value));

const wrapperClass = computed(() => {
  const base = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5";
  if (variant === "amber") {
    return `${base} bg-tone-caution/15 border-tone-caution/40 text-ink-caution `;
  }
  return `${base} bg-destructive/10 border-destructive/30 text-destructive`;
});

function pipClass(i: number) {
  const isFilled = i <= level;
  if (variant === "amber") {
    return isFilled
      ? "bg-tone-caution border-tone-caution hover:bg-tone-caution"
      : "border-tone-caution/40 hover:border-tone-caution/70";
  }
  return isFilled
    ? "bg-destructive border-destructive hover:opacity-80"
    : "border-destructive/40 hover:border-destructive";
}

function onPipClick(i: number) {
  // Click a pip to set the level; clicking the current max toggles it down
  // by one (same affordance as the death-save pips).
  emit("update", i === level ? i - 1 : i);
}
</script>
