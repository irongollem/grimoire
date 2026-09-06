<template>
  <BaseEdge
    :id="id"
    :path="path"
    :marker-start="markerStart"
    :marker-end="markerEnd"
    :interaction-width="interactionWidth"
  />
  <EdgeLabelRenderer v-if="gate">
    <span
      class="quest-flow-edge-label nodrag nopan"
      :class="{ 'is-closed': !gate.is_open }"
      :title="gateTooltip"
      :style="{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }"
    >
      {{ pillText }}
    </span>
  </EdgeLabelRenderer>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Position } from "@vue-flow/core";
import type { QuestRouteGate } from "@/types/quest.types";
import { describeQuestRouteGate, questRouteGateLabel } from "@/lib/quests/gates";

const {
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  interactionWidth = 20,
  data,
} = defineProps<{
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  markerStart?: string;
  markerEnd?: string;
  interactionWidth?: number;
  data?: { edgeId: string; visited: boolean; gate: QuestRouteGate | null };
}>();

const route = computed(() => getSmoothStepPath({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  borderRadius: 10,
}));
// An ungated edge shows no pill at all — the old "Continue" fallback claimed
// there was always something to say about a route, and 39 of 44 production
// edges prove there usually isn't (#795).
const gate = computed(() => data?.gate ?? null);
const pillText = computed(() => gate.value ? questRouteGateLabel(gate.value) : "");
const gateTooltip = computed(() => gate.value ? describeQuestRouteGate(gate.value) : undefined);
const path = computed(() => route.value[0]);
const labelX = computed(() => route.value[1]);
const labelY = computed(() => route.value[2]);
</script>

<style scoped>
.quest-flow-edge-label {
  position: absolute;
  padding: 0.2rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--card);
  color: var(--foreground);
  font-size: 0.75rem;
  line-height: 1;
  pointer-events: all;
}
.quest-flow-edge-label.is-closed {
  border-color: var(--destructive);
  color: var(--destructive);
}
</style>
