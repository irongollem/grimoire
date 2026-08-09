<template>
  <section class="space-y-3" aria-label="Quest Build mode">
    <div class="flex flex-wrap items-center gap-2">
      <div>
        <h2 class="font-cinzel text-base font-bold text-foreground">Story flow</h2>
        <p class="text-caption text-muted-foreground">Select and arrange narrative beats. Editing arrives in the next authoring story.</p>
      </div>
      <div class="ml-auto flex gap-2">
        <AppButton :to="`/quests/${questId}`" label="Details" size="sm" variant="subtle" />
        <AppButton :icon="IconMaximize" label="Fit" size="sm" variant="subtle" @click="canvas?.fitGraph()" />
        <AppButton v-if="currentBeatId" :icon="IconCenter" label="Current beat" size="sm" variant="subtle" @click="canvas?.focusCurrent()" />
      </div>
    </div>

    <div v-if="isLoading" class="flex justify-center py-16"><LoadingSpinner /></div>
    <p v-else-if="!beats.length" class="rounded-lg border border-dashed border-border p-8 text-center text-body text-muted-foreground">
      This quest has no beats yet. Beat creation is part of the next Build-mode story.
    </p>
    <QuestFlowCanvas
      v-else
      ref="canvas"
      :graph-id="`quest-${questId}`"
      :beats="beats"
      :edges="edges"
      :presentations="presentations"
      :visited-edge-ids="visitedEdgeIds"
      :selected-beat-id="selectedBeatId"
      :current-beat-id="currentBeatId"
      :initial-viewport="initialViewport"
      :fit-on-open="!initialViewport"
      :editable="false"
      @command="onCommand"
      @viewport-change="writeQuestViewport(questId, $event)"
    />

    <p v-if="saveError" role="alert" class="text-caption text-destructive">
      The last position could not be saved and was restored. {{ saveError }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { IconCenter, IconMaximize } from "@/lib/icons";
import {
  useQuestBeatAttachmentSummaries,
  useQuestBeatEdges,
  useQuestBeats,
  useQuestBeatTransitionsForQuest,
  useQuestRuntimeState,
  useUpdateQuestBeat,
} from "@/composables/useQuestFlow";
import { deriveQuestBeatPresentations, visitedRouteEdgeIds } from "@/lib/quests/presentation";
import { readQuestViewport, writeQuestViewport } from "@/lib/quests/viewport";
import { retainSelectedBeatId, type QuestGraphCommand } from "@/lib/quests/flow";
import AppButton from "@/components/common/AppButton.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import QuestFlowCanvas from "./QuestFlowCanvas.vue";

const props = withDefaults(defineProps<{ questId: string; focusCurrentOnOpen?: boolean }>(), { focusCurrentOnOpen: false });
const canvas = ref<InstanceType<typeof QuestFlowCanvas> | null>(null);
const selectedBeatId = ref<string | null>(null);
const saveError = ref("");
const initialViewport = readQuestViewport(props.questId);
const questId = computed(() => props.questId);

const beatsQuery = useQuestBeats(questId);
const edgesQuery = useQuestBeatEdges(questId);
const attachmentsQuery = useQuestBeatAttachmentSummaries(questId);
const runtimeQuery = useQuestRuntimeState();
const transitionsQuery = useQuestBeatTransitionsForQuest(questId);
const updateBeat = useUpdateQuestBeat();

const beats = computed(() => beatsQuery.data.value ?? []);
const edges = computed(() => edgesQuery.data.value ?? []);
const attachments = computed(() => attachmentsQuery.data.value ?? []);
const transitions = computed(() => transitionsQuery.data.value ?? []);
const currentBeatId = computed(() => runtimeQuery.data.value?.current_quest_id === props.questId ? runtimeQuery.data.value.current_beat_id : null);
const presentations = computed(() => deriveQuestBeatPresentations({ beats: beats.value, edges: edges.value, attachments: attachments.value, runtime: runtimeQuery.data.value, transitions: transitions.value }));
const visitedEdgeIds = computed(() => visitedRouteEdgeIds(edges.value, transitions.value));
const isLoading = computed(() => beatsQuery.isLoading.value || edgesQuery.isLoading.value || attachmentsQuery.isLoading.value);

const pendingMoves = new Map<string, Extract<QuestGraphCommand, { type: "move" }>>();
async function flushPositions() {
  const commands = [...pendingMoves.values()];
  pendingMoves.clear();
  for (const command of commands) {
    saveError.value = "";
    try {
      await updateBeat.mutateAsync({ id: command.beatId, questId: props.questId, update: { canvas_x: command.x, canvas_y: command.y } });
    } catch (error) {
      saveError.value = error instanceof Error ? error.message : "Unknown save error";
    }
  }
}
const savePositions = useDebounceFn(flushPositions, 300, { maxWait: 1000 });

function onCommand(command: QuestGraphCommand) {
  if (command.type === "select" || command.type === "open") selectedBeatId.value = command.beatId;
  if (command.type === "move") {
    pendingMoves.set(command.beatId, command);
    void savePositions();
  }
}

watch(beats, (rows) => {
  selectedBeatId.value = retainSelectedBeatId(selectedBeatId.value, rows);
});

let focusedOnOpen = false;
watch([currentBeatId, beats, canvas], async ([current]) => {
  if (!props.focusCurrentOnOpen || focusedOnOpen || !current) return;
  await nextTick();
  focusedOnOpen = await canvas.value?.focusCurrent() ?? false;
}, { immediate: true });

onBeforeUnmount(() => void flushPositions());
</script>
