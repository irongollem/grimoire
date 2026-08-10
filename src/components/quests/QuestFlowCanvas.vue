<template>
  <div class="quest-flow-shell">
    <div class="quest-flow-canvas" aria-label="Quest beat graph editor">
      <VueFlow
        :id="graphId"
        v-model:nodes="nodes"
        v-model:edges="flowEdges"
        :min-zoom="0.25"
        :max-zoom="2.5"
        :nodes-draggable="true"
        :nodes-connectable="editable"
        :fit-view-on-init="fitOnOpen"
        :default-viewport="initialViewport ?? undefined"
        @node-click="onNodeClick"
        @edge-click="emit('command', { type: 'select-edge', edgeId: $event.edge.id })"
        @node-drag-stop="onNodeDragStop"
        @connect-start="onConnectStart"
        @connect="onConnect"
        @connect-end="onConnectEnd"
        @viewport-change-end="emit('viewport-change', $event)"
      >
        <template #node-questBeat="slotProps">
          <QuestFlowNode
            :title="slotProps.data.title"
            :kind="slotProps.data.kind"
            :visibility="slotProps.data.visibility"
            :selected="slotProps.id === selectedBeatId"
            :current="slotProps.id === currentBeatId"
            :presentation="slotProps.data.presentation"
            :editable="editable"
            @select="emit('command', { type: 'select', beatId: slotProps.id })"
            @open="emit('command', { type: 'open', beatId: slotProps.id })"
            @delete="editable && emit('command', { type: 'delete-beat', beatId: slotProps.id })"
            @create-next="createNext(slotProps.id)"
          />
        </template>
        <template #edge-questRoute="slotProps">
          <QuestFlowEdge v-bind="slotProps" />
        </template>
      </VueFlow>
    </div>
    <div class="quest-flow-outline"><QuestGraphOutline :beats="beats" :selected-beat-id="selectedBeatId" :editable="editable" @command="emit('command', $event)" /></div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick } from "vue";
import { useVueFlow, VueFlow, type ViewportTransform } from "@vue-flow/core";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import QuestFlowNode from "./QuestFlowNode.vue";
import QuestFlowEdge from "./QuestFlowEdge.vue";
import QuestGraphOutline from "./QuestGraphOutline.vue";
import { moveBeatCommand, toQuestFlowGraph, type QuestGraphCommand } from "@/lib/quests/flow";
import type { QuestBeatPresentation } from "@/lib/quests/presentation";
import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";

const props = withDefaults(defineProps<{ graphId: string; beats: QuestBeat[]; edges: QuestBeatEdge[]; presentations?: Record<string, QuestBeatPresentation>; visitedEdgeIds?: ReadonlySet<string>; selectedBeatId?: string | null; currentBeatId?: string | null; fitOnOpen?: boolean; initialViewport?: ViewportTransform | null; editable?: boolean }>(), { presentations: () => ({}), visitedEdgeIds: () => new Set(), selectedBeatId: null, currentBeatId: null, fitOnOpen: true, initialViewport: null, editable: true });
const emit = defineEmits<{ command: [command: QuestGraphCommand]; "viewport-change": [viewport: ViewportTransform] }>();
const flow = useVueFlow(props.graphId);
const graph = computed(() => toQuestFlowGraph(props.beats, props.edges, props.presentations, props.visitedEdgeIds));
const nodes = computed({ get: () => graph.value.nodes, set: () => undefined });
const flowEdges = computed({ get: () => graph.value.edges, set: () => undefined });
let pendingConnectionSource: string | null = null;
let connectionCompleted = false;

function onNodeClick(event: { node: { id: string } }) { emit("command", { type: "select", beatId: event.node.id }); }
function createNext(beatId: string) {
  const beat = props.beats.find((candidate) => candidate.id === beatId);
  emit("command", { type: "create", sourceBeatId: beatId, x: (beat?.canvas_x ?? 0) + 320, y: beat?.canvas_y ?? 0 });
}
function onNodeDragStop(event: { node: { id: string; position: { x: number; y: number } } }) { emit("command", moveBeatCommand(event.node)); }
function onConnect(connection: { source: string | null; target: string | null }) {
  connectionCompleted = true;
  if (props.editable && connection.source && connection.target && connection.source !== connection.target) emit("command", { type: "link", sourceBeatId: connection.source, targetBeatId: connection.target });
}
function onConnectStart(event: { nodeId?: string | null }) { pendingConnectionSource = event.nodeId ?? null; connectionCompleted = false; }
function onConnectEnd(event?: MouseEvent | TouchEvent) {
  if (!props.editable || connectionCompleted || !pendingConnectionSource || !event) { pendingConnectionSource = null; return; }
  const point = "changedTouches" in event ? event.changedTouches[0] : event;
  if (point) {
    const position = flow.project({ x: point.clientX, y: point.clientY });
    emit("command", { type: "create", sourceBeatId: pendingConnectionSource, x: position.x, y: position.y });
  }
  pendingConnectionSource = null;
}

async function fitGraph() {
  await nextTick();
  return flow.fitView({ padding: 0.2, duration: prefersReducedMotion() ? 0 : 200 });
}

async function focusCurrent() {
  if (!props.currentBeatId) return false;
  await nextTick();
  const node = nodes.value.find((candidate) => candidate.id === props.currentBeatId);
  if (!node) return false;
  return flow.setCenter(node.position.x + 120, node.position.y + 60, {
    zoom: 1.25,
    duration: prefersReducedMotion() ? 0 : 200,
  });
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

defineExpose({ fitGraph, focusCurrent });
</script>

<style scoped>
.quest-flow-shell { min-width: 0; }
.quest-flow-canvas { height: min(70vh, 48rem); min-height: 28rem; border: 1px solid var(--border); border-radius: .75rem; overflow: hidden; background: var(--background); }
.quest-flow-outline { display: none; }
:deep(.vue-flow__edge-path) { stroke: var(--muted-foreground); }
:deep(.vue-flow__edge.is-visited .vue-flow__edge-path) { stroke: var(--primary); stroke-width: 2.5; }
:deep(.vue-flow__edge-text) { fill: var(--foreground); }
:deep(.vue-flow__edge-textbg) { fill: var(--card); }
:deep(.vue-flow__handle) { background: var(--primary); border-color: var(--card); width: .65rem; height: .65rem; }
@media (max-width: 47.99rem) { .quest-flow-canvas { display: none; } .quest-flow-outline { display: block; } }
@media (min-width: 80rem) {
  .quest-flow-shell, .quest-flow-canvas { height: 100%; min-height: 0; }
}
@media (prefers-reduced-motion: reduce) { :deep(.vue-flow__transformationpane), :deep(.vue-flow__nodes) { transition: none !important; } }
</style>
