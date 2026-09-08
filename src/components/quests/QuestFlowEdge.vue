<template>
  <BaseEdge
    :id="id"
    :path="path"
    :marker-start="markerStart"
    :marker-end="markerEnd"
    :interaction-width="interactionWidth"
  />
  <!--
    A parallel route reads as a two-rail track: the coloured stroke is drawn
    by the base edge's own CSS (`.is-parallel .vue-flow__edge-path`), and this
    second path — the same "d", a hairline of the page background on top —
    cuts the thin gap down the middle. That gives the "two lines" look the
    design asks for without computing an offset curve, which a smoothstep
    path has no cheap way to do. It never draws for a closed or stranded
    route: the dashed muted-foreground look wins outright there, and a rail
    on top of it would just muddy a state that is supposed to read as "no
    longer open."
  -->
  <path v-if="showRail" :d="path" class="quest-flow-edge-rail nodrag nopan" aria-hidden="true" />
  <EdgeLabelRenderer>
    <span
      class="quest-flow-edge-label text-eyebrow nodrag nopan"
      :class="labelClass"
      :title="labelTooltip"
      :style="{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }"
    >
      <IconLayers v-if="kindLabel === 'parallel'" class="h-3 w-3" aria-hidden="true" />
      <IconLock v-else-if="kindLabel === 'gate'" class="h-3 w-3" aria-hidden="true" />
      {{ pillText }}
    </span>
  </EdgeLabelRenderer>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Position } from "@vue-flow/core";

// Two roots (the path and the teleported label), so VueFlow's edge attributes
// (`sourceNode`, `label`, `style`, …) have nowhere to fall through to and Vue
// warned on every render. Everything this edge draws comes through its props.
defineOptions({ inheritAttrs: false });
import { IconLayers, IconLock } from "@/lib/icons";
import type { QuestFlowEdgeData } from "@/lib/quests/flow";
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
  data?: QuestFlowEdgeData;
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
const gate = computed(() => data?.gate ?? null);
const isClosed = computed(() => Boolean(gate.value && !gate.value.is_open));
// Every edge shows a pill now (#850) — the old "nothing to say" ungated case
// still has something to say: which beat it leads to. A gate takes priority
// over the route kind's own label because knowing why a route might be shut
// matters more than knowing it also opens a thread.
const kindLabel = computed<"gate" | "parallel" | "choice">(() => {
  if (gate.value) return "gate";
  return data?.routeKind === "parallel" ? "parallel" : "choice";
});
const pillText = computed(() => {
  if (kindLabel.value === "gate" && gate.value) return `gate · ${questRouteGateLabel(gate.value)}`;
  if (kindLabel.value === "parallel") return `parallel · opens ${data?.threadLabel || data?.targetTitle || "a new thread"}`;
  return `choice · ${data?.targetTitle ?? "?"}`;
});
const labelTooltip = computed(() => gate.value ? describeQuestRouteGate(gate.value) : undefined);
const labelClass = computed(() => ({
  "is-gate": kindLabel.value === "gate",
  "is-parallel": kindLabel.value === "parallel",
  // A choice route that is still open reads as the "pri" pill (Story flow
  // frame): gold border and text. A stranded sibling drops the accent
  // entirely — the default muted pill — which is why this is checked first.
  "is-stranded": kindLabel.value === "choice" && Boolean(data?.stranded),
  "is-choice": kindLabel.value === "choice" && !data?.stranded,
}));
// The double-rail look is the "open, parallel" state only — a closed gate or
// a stranded target already reads as dashed muted-foreground, and drawing
// the rail on top of that would say two contradictory things about the same
// wire at once.
const showRail = computed(() => data?.routeKind === "parallel" && !isClosed.value && !data?.stranded);
const path = computed(() => route.value[0]);
// Not the midpoint: the pill sits a little way out of the source, so a short
// wire's label is not swallowed by the node it enters (the frame draws them
// nearer the source too).
const LABEL_T = 0.38;
const labelX = computed(() => sourceX + (route.value[1] - sourceX) * 2 * LABEL_T);
const labelY = computed(() => sourceY + (route.value[2] - sourceY) * 2 * LABEL_T);
</script>

<style scoped>
.quest-flow-edge-label {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.1875rem 0.5625rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--card);
  color: var(--muted-foreground);
  pointer-events: all;
}
/* An open choice route is the "pri" pill in the Story flow frame — gold
   border and text. Stranded siblings and gates keep the muted default. */
.quest-flow-edge-label.is-choice { border-color: color-mix(in oklab, var(--primary) 55%, transparent); color: var(--primary); }
.quest-flow-edge-label.is-parallel { border-color: color-mix(in oklab, var(--color-tone-info) 55%, transparent); color: var(--color-ink-info); }
.quest-flow-edge-label.is-gate { border-color: var(--muted-foreground); color: var(--muted-foreground); }
.quest-flow-edge-label.is-stranded { color: var(--muted-foreground); }
</style>
