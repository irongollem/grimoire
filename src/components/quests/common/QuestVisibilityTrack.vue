<template>
  <span
    class="inline-flex flex-col items-center gap-1"
    :role="isStatic ? 'img' : 'group'"
    :aria-label="isStatic ? current : 'What players know'"
  >
    <!-- Flow nodes stay a compact static track; interactive controls name each
         state so the DM can see that Hidden, Rumored and Revealed are actions. -->
    <span v-if="isStatic" class="inline-flex items-center">
      <span v-for="(step, i) in VISIBILITY_STEPS" :key="step" class="flex items-center">
        <span v-if="i > 0" :class="[lineBase, lineWidth]" aria-hidden="true" />
        <span :class="[dotBase, dotSize, fillOf(step)]" />
      </span>
    </span>
    <span v-else class="inline-flex flex-wrap items-center gap-1">
      <button
        v-for="step in VISIBILITY_STEPS"
        :key="step"
        type="button"
        class="rounded-md border text-caption font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
        :class="[
          size === 'lg' ? 'min-h-9 px-3' : 'min-h-8 px-2',
          step === current ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted',
        ]"
        :aria-label="step"
        :aria-pressed="step === current"
        :disabled="belowFloor(step)"
        :title="belowFloor(step) && size !== 'lg' ? floorHint : undefined"
        @click="pick(step)"
      >{{ stepLabel(step) }}</button>
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { QuestBeatVisibility } from "@/types/quest.types";
import { VISIBILITY_STEPS, visibilityRank } from "@/lib/quests/visibility";

const {
  size = "sm",
  floor = "hidden",
  interactive = true,
} = defineProps<{
  size?: "xs" | "sm" | "lg";
  /** The lowest step the DM may choose; lower steps are disabled. */
  floor?: QuestBeatVisibility;
  interactive?: boolean;
}>();

const current = defineModel<QuestBeatVisibility>({ required: true });

const isStatic = computed(() => size === "xs" || !interactive);

const dotBase = "box-border shrink-0 rounded-full border border-foreground";
const lineBase = "h-px bg-foreground";
const dotSize = computed(() => ({ xs: "h-2 w-2", sm: "h-3 w-3", lg: "h-5 w-5" })[size]);
const lineWidth = computed(() => ({ xs: "w-1.5", sm: "w-3", lg: "w-8" })[size]);

function stepLabel(step: QuestBeatVisibility): string {
  return step === "revealed" ? "Revealed" : step === "rumored" ? "Rumored" : "Hidden";
}

function fillOf(step: QuestBeatVisibility): string {
  return filled(step) ? "bg-[var(--live,var(--primary))]" : "bg-card";
}
function filled(step: QuestBeatVisibility): boolean {
  return visibilityRank(step) <= visibilityRank(current.value);
}
function belowFloor(step: QuestBeatVisibility): boolean {
  return visibilityRank(step) < visibilityRank(floor);
}
const floorHint = computed(() => (floor === "revealed" ? "The party has been here" : "One route away"));

function pick(step: QuestBeatVisibility) {
  if (belowFloor(step) || step === current.value) return;
  current.value = step;
}
</script>
