<template>
  <div class="quest-flow-swimlanes" :style="layerStyle" aria-hidden="true">
    <div
      v-for="lane in lanes"
      :key="lane.threadId"
      class="quest-flow-swimlane"
      :class="lane.tone.bgFaint"
      :style="{
        left: `${lane.x}px`, top: `${lane.y}px`, width: `${lane.w}px`, height: `${lane.h}px`,
        borderColor: `color-mix(in oklab, ${lane.tone.cssVar} 38%, transparent)`,
      }"
    >
      <span
        class="quest-flow-swimlane__tag"
        :class="lane.tone.text"
        :style="{ borderColor: `color-mix(in oklab, ${lane.tone.cssVar} 52%, transparent)` }"
      >
        <IconNavigate class="h-3 w-3" aria-hidden="true" />
        {{ lane.letter }} — {{ lane.label }} · {{ lane.stateLabel }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ViewportTransform } from "@vue-flow/core";
import { IconNavigate } from "@/lib/icons";
import type { QuestFlowSwimlane } from "@/lib/quests/swimlanes";

const { lanes, viewport } = defineProps<{ lanes: QuestFlowSwimlane[]; viewport: ViewportTransform }>();

// A dashed frame behind the nodes, moved by the same transform Vue Flow
// applies to its own node layer — the lanes have to pan and zoom exactly in
// step with the beats they frame, or they drift off them the moment the DM
// scrolls the canvas.
const layerStyle = computed(() => ({
  transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
  transformOrigin: "0 0",
}));
</script>

<style scoped>
.quest-flow-swimlanes { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
.quest-flow-swimlane { position: absolute; border: 0.1rem dashed; border-radius: .75rem; }
.quest-flow-swimlane__tag {
  position: absolute;
  top: -0.6875rem;
  left: 0.875rem;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: var(--background);
  border: 0.0625rem solid;
  border-radius: 999px;
  padding: 0.125rem 0.5625rem;
  font-family: var(--font-cinzel);
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .05em;
  white-space: nowrap;
}
</style>
