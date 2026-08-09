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
        :nodes-connectable="true"
        :fit-view-on-init="fitOnOpen"
        @node-click="onNodeClick"
        @node-drag-stop="onNodeDragStop"
        @connect="onConnect"
      >
        <template #node-questBeat="slotProps">
          <QuestFlowNode
            :title="slotProps.data.title"
            :kind="slotProps.data.kind"
            :visibility="slotProps.data.visibility"
            :selected="slotProps.id === selectedBeatId"
            :current="slotProps.id === currentBeatId"
            @select="emit('command', { type: 'select', beatId: slotProps.id })"
            @open="emit('command', { type: 'open', beatId: slotProps.id })"
            @delete="emit('command', { type: 'delete-beat', beatId: slotProps.id })"
          />
        </template>
        <template #edge-questRoute="slotProps">
          <QuestFlowEdge v-bind="slotProps" />
        </template>
      </VueFlow>
    </div>
    <div class="quest-flow-outline"><QuestGraphOutline :beats="beats" :selected-beat-id="selectedBeatId" @command="emit('command', $event)" /></div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick } from "vue";
import { useVueFlow, VueFlow } from "@vue-flow/core";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import QuestFlowNode from "./QuestFlowNode.vue";
import QuestFlowEdge from "./QuestFlowEdge.vue";
import QuestGraphOutline from "./QuestGraphOutline.vue";
import { moveBeatCommand, toQuestFlowGraph, type QuestGraphCommand } from "@/lib/quests/flow";
import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";

const props = withDefaults(defineProps<{ graphId: string; beats: QuestBeat[]; edges: QuestBeatEdge[]; selectedBeatId?: string | null; currentBeatId?: string | null; fitOnOpen?: boolean }>(), { selectedBeatId: null, currentBeatId: null, fitOnOpen: true });
const emit = defineEmits<{ command: [command: QuestGraphCommand] }>();
const flow = useVueFlow(props.graphId);
const graph = computed(() => toQuestFlowGraph(props.beats, props.edges));
const nodes = computed({ get: () => graph.value.nodes, set: () => undefined });
const flowEdges = computed({ get: () => graph.value.edges, set: () => undefined });

function onNodeClick(event: { node: { id: string } }) { emit("command", { type: "select", beatId: event.node.id }); }
function onNodeDragStop(event: { node: { id: string; position: { x: number; y: number } } }) { emit("command", moveBeatCommand(event.node)); }
function onConnect(connection: { source: string | null; target: string | null }) {
  if (connection.source && connection.target && connection.source !== connection.target) emit("command", { type: "link", sourceBeatId: connection.source, targetBeatId: connection.target });
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
.quest-flow-canvas { height: min(70vh, 48rem); min-height: 28rem; border: 1px solid var(--border); border-radius: .75rem; overflow: hidden; background: var(--background); }
.quest-flow-outline { display: none; }
:deep(.vue-flow__edge-path) { stroke: var(--muted-foreground); }
:deep(.vue-flow__edge-text) { fill: var(--foreground); }
:deep(.vue-flow__edge-textbg) { fill: var(--card); }
:deep(.vue-flow__handle) { background: var(--primary); border-color: var(--card); width: .65rem; height: .65rem; }
@media (max-width: 47.99rem) { .quest-flow-canvas { display: none; } .quest-flow-outline { display: block; } }
@media (prefers-reduced-motion: reduce) { :deep(.vue-flow__transformationpane), :deep(.vue-flow__nodes) { transition: none !important; } }
</style>
