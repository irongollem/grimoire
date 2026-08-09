<template>
  <BaseEdge
    :id="id"
    :path="path"
    :marker-start="markerStart"
    :marker-end="markerEnd"
    :interaction-width="interactionWidth"
  />
  <EdgeLabelRenderer v-if="labelText">
    <span
      class="quest-flow-edge-label nodrag nopan"
      :style="{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }"
    >
      {{ labelText }}
    </span>
  </EdgeLabelRenderer>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Position } from "@vue-flow/core";

const props = withDefaults(defineProps<{
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
  label?: unknown;
}>(), {
  markerStart: undefined,
  markerEnd: undefined,
  interactionWidth: 20,
  label: undefined,
});

const route = computed(() => getSmoothStepPath({
  sourceX: props.sourceX,
  sourceY: props.sourceY,
  sourcePosition: props.sourcePosition,
  targetX: props.targetX,
  targetY: props.targetY,
  targetPosition: props.targetPosition,
  borderRadius: 10,
}));
const labelText = computed(() => typeof props.label === "string" ? props.label : "");
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
</style>
