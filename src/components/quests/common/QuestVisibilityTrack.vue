<template>
  <span v-if="isStatic" class="inline-flex items-center gap-2" role="img" :aria-label="current">
    <span :class="trackClass">
      <span v-for="(step, i) in VISIBILITY_STEPS" :key="step" class="flex items-center">
        <span v-if="i > 0" :class="[lineBase, lineWidth]" aria-hidden="true" />
        <span :class="[dotBase, dotSize, filled(step) ? 'bg-[var(--live,var(--primary))]' : 'bg-card']" />
      </span>
    </span>
    <span v-if="size === 'sm'" class="text-caption capitalize text-muted-foreground">{{ current }}</span>
  </span>
  <span v-else class="inline-flex items-start gap-2" role="group" aria-label="What players know">
    <span :class="trackClass">
      <span v-for="(step, i) in VISIBILITY_STEPS" :key="step" class="flex flex-col items-center gap-1">
        <span class="flex items-center">
          <span v-if="i > 0" :class="[lineBase, lineWidth]" aria-hidden="true" />
          <button
            type="button"
            :class="[dotBase, dotSize, filled(step) ? 'bg-[var(--live,var(--primary))]' : 'bg-card', belowFloor(step) ? 'cursor-not-allowed opacity-60' : 'cursor-pointer']"
            :aria-label="step"
            :aria-pressed="step === current"
            :disabled="belowFloor(step)"
            :title="belowFloor(step) ? floorHint : undefined"
            @click="pick(step)"
          />
        </span>
        <span v-if="size === 'lg'" class="text-caption capitalize" :class="step === current ? 'font-bold text-foreground' : 'text-muted-foreground'">{{ step }}</span>
      </span>
    </span>
    <span v-if="size === 'sm'" class="text-caption capitalize text-muted-foreground">{{ current }}</span>
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
const trackClass = computed(() => (size === "lg" ? "inline-flex items-start" : "inline-flex items-center"));

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
