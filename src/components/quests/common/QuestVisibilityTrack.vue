<template>
  <span
    class="inline-flex flex-col items-center gap-1"
    :role="isStatic ? 'img' : 'group'"
    :aria-label="isStatic ? current : 'What players know'"
  >
    <!-- What players know, as three circles on a line: the circles on top, the
         current step named and centred beneath them. The beat boxes on the flow
         use "xs", which is the circles alone. -->
    <span class="inline-flex items-center">
      <span v-for="(step, i) in VISIBILITY_STEPS" :key="step" class="flex items-center">
        <span v-if="i > 0" :class="[lineBase, lineWidth]" aria-hidden="true" />
        <span v-if="isStatic" :class="[dotBase, dotSize, fillOf(step)]" />
        <!-- The circle is drawn small; the press area around it is not (padding
             taken back by a negative margin, so the line still meets the circle). -->
        <button
          v-else
          type="button"
          class="-m-1.5 rounded-full p-1.5 focus-visible:outline-2 focus-visible:outline-primary"
          :class="belowFloor(step) ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'"
          :aria-label="step"
          :aria-pressed="step === current"
          :disabled="belowFloor(step)"
          :title="belowFloor(step) ? floorHint : undefined"
          @click="pick(step)"
        >
          <span class="block" :class="[dotBase, dotSize, fillOf(step)]" />
        </button>
      </span>
    </span>
    <span v-if="size !== 'xs'" class="text-caption capitalize" :class="size === 'lg' ? 'font-bold text-foreground' : 'text-muted-foreground'">{{ current }}</span>
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
