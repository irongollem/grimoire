<template>
  <section class="space-y-3" aria-label="Quest Build mode">
    <div class="flex flex-wrap items-center gap-2">
      <div>
        <h2 class="font-cinzel text-base font-bold text-foreground">Story flow</h2>
        <p class="text-caption text-muted-foreground">Create, connect, label, and arrange narrative beats.</p>
      </div>
      <div class="ml-auto flex gap-2">
        <AppButton :to="`/quests/${questId}`" label="Details" size="sm" variant="subtle" />
        <AppButton label="Add beat" size="sm" variant="primary" @click="openComposer()" />
        <AppButton :icon="IconMaximize" label="Fit" size="sm" variant="subtle" @click="canvas?.fitGraph()" />
        <AppButton v-if="currentBeatId" :icon="IconCenter" label="Current beat" size="sm" variant="subtle" @click="canvas?.focusCurrent()" />
      </div>
    </div>

    <QuestBeatComposer
      v-if="composer"
      :source-beat-id="composer.sourceBeatId"
      :saving="composerSaving"
      :error="composerError"
      @cancel="composer = null"
      @submit="createComposedBeat"
    />

    <div v-if="selectedEdge" class="grid gap-2 rounded-lg border border-border bg-card p-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
      <AppSelect v-model="edgeSource" aria-label="Route source beat">
        <option v-for="beat in beats" :key="beat.id" :value="beat.id">From: {{ beat.title }}</option>
      </AppSelect>
      <AppSelect v-model="edgeTarget" aria-label="Route target beat">
        <option v-for="beat in beats" :key="beat.id" :value="beat.id">To: {{ beat.title }}</option>
      </AppSelect>
      <AppInput v-model="edgeLabel" placeholder="DM-only route condition…" />
      <AppButton label="Save route" size="sm" :loading="edgeSaving" @click="saveEdge" />
      <AppButton label="Delete route" size="sm" variant="destructive" @click="deleteSelectedEdge" />
    </div>

    <div v-if="pendingDeleteBeat" class="rounded-lg border border-destructive/40 bg-card p-3">
      <h3 class="font-cinzel text-sm font-bold">Remove “{{ pendingDeleteBeat.title }}” from the flow?</h3>
      <p class="mt-1 text-caption text-muted-foreground">
        This detaches {{ deletionImpact.edgeCount }} route{{ deletionImpact.edgeCount === 1 ? '' : 's' }} and
        {{ deletionImpact.attachmentCount }} placement{{ deletionImpact.attachmentCount === 1 ? '' : 's' }}. Visit history remains; linked entities, encounters, chat, and inventory are not deleted.
      </p>
      <AppSelect v-if="deletionImpact.isCurrent" v-model="replacementBeatId" class="mt-2" aria-label="Current beat replacement">
        <option value="">Choose replacement or end session…</option>
        <option value="end">End quest runtime</option>
        <option v-for="beat in replacementBeats" :key="beat.id" :value="beat.id">Move current to: {{ beat.title }}</option>
      </AppSelect>
      <div class="mt-3 flex justify-end gap-2">
        <AppButton label="Cancel" size="sm" variant="subtle" @click="pendingDeleteBeatId = null" />
        <AppButton label="Remove beat" size="sm" variant="destructive" :disabled="deletionImpact.isCurrent && !replacementBeatId" :loading="deletingBeat" @click="archivePendingBeat" />
      </div>
    </div>

    <div v-if="mutationError" role="alert" class="flex items-center gap-2 rounded-md border border-destructive/40 p-2 text-caption text-destructive">
      <span class="flex-1">{{ mutationError }}</span>
      <AppButton v-if="retryMutation" label="Retry" size="xs" variant="destructive" @click="retryMutation?.()" />
    </div>

    <div v-if="isLoading" class="flex justify-center py-16"><LoadingSpinner /></div>
    <p v-else-if="!beats.length" class="rounded-lg border border-dashed border-border p-8 text-center text-body text-muted-foreground">
      This quest has no beats yet. Use “Add beat” to begin its story flow.
    </p>
    <div v-else class="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div id="quest-flow-canvas" class="min-w-0">
        <QuestFlowCanvas
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
          :editable="true"
          @command="onCommand"
          @viewport-change="writeQuestViewport(questId, $event)"
        />
      </div>
      <QuestBeatInspector
        v-if="selectedBeat"
        :key="selectedBeat.id"
        :beat="selectedBeat"
        :beats="beats"
        :edges="edges"
        :attachments="selectedAttachments"
        :loot="selectedLoot"
        :presentation="presentations[selectedBeat.id]"
      />
      <div v-else class="hidden rounded-xl border border-dashed border-border p-6 text-center text-caption text-muted-foreground xl:block">
        Select a beat to prepare it without leaving the flow.
      </div>
    </div>

    <p v-if="saveError" role="alert" class="text-caption text-destructive">
      The last position could not be saved and was restored. {{ saveError }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { useRoute, useRouter } from "vue-router";
import { IconCenter, IconMaximize } from "@/lib/icons";
import {
  useQuestBeatAttachmentSummaries,
  useQuestBeatLoot,
  useArchiveQuestBeat,
  useCreateQuestBeat,
  useCreateQuestBeatEdge,
  useDeleteQuestBeat,
  useDeleteQuestBeatEdge,
  useQuestBeatEdges,
  useQuestBeats,
  useQuestBeatTransitionsForQuest,
  useQuestRuntimeState,
  useSetQuestRuntimeCursor,
  useUpdateQuestBeatEdge,
  useUpdateQuestBeat,
} from "@/composables/useQuestFlow";
import { deriveQuestBeatPresentations, visitedRouteEdgeIds } from "@/lib/quests/presentation";
import { summarizeQuestBeatLoot } from "@/lib/quests/loot";
import { readQuestViewport, writeQuestViewport } from "@/lib/quests/viewport";
import { retainSelectedBeatId, type QuestGraphCommand } from "@/lib/quests/flow";
import { createBeatWithRollback, isDuplicateQuestEdge } from "@/lib/quests/mutations";
import { useCampaignStore } from "@/stores/campaign";
import { useConfirm } from "@/composables/useConfirm";
import { useIsMobile } from "@/composables/useBreakpoint";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import QuestFlowCanvas from "./QuestFlowCanvas.vue";
import QuestBeatComposer from "./QuestBeatComposer.vue";
import QuestBeatInspector from "./QuestBeatInspector.vue";

const props = withDefaults(defineProps<{ questId: string; focusCurrentOnOpen?: boolean }>(), { focusCurrentOnOpen: false });
const canvas = ref<InstanceType<typeof QuestFlowCanvas> | null>(null);
const route = useRoute();
const router = useRouter();
const isMobile = useIsMobile();
const selectedBeatId = ref<string | null>(null);
const selectedEdgeId = ref<string | null>(null);
const saveError = ref("");
const initialViewport = readQuestViewport(props.questId);
const questId = computed(() => props.questId);

const beatsQuery = useQuestBeats(questId);
const edgesQuery = useQuestBeatEdges(questId);
const attachmentsQuery = useQuestBeatAttachmentSummaries(questId);
const lootQuery = useQuestBeatLoot(questId);
const runtimeQuery = useQuestRuntimeState();
const transitionsQuery = useQuestBeatTransitionsForQuest(questId);
const updateBeat = useUpdateQuestBeat();
const createBeat = useCreateQuestBeat();
const deleteBeat = useDeleteQuestBeat();
const archiveBeat = useArchiveQuestBeat();
const createEdge = useCreateQuestBeatEdge();
const updateEdge = useUpdateQuestBeatEdge();
const deleteEdge = useDeleteQuestBeatEdge();
const setRuntimeCursor = useSetQuestRuntimeCursor();
const campaign = useCampaignStore();
const { confirm } = useConfirm();

const beats = computed(() => beatsQuery.data.value ?? []);
const edges = computed(() => edgesQuery.data.value ?? []);
const attachments = computed(() => attachmentsQuery.data.value ?? []);
const transitions = computed(() => transitionsQuery.data.value ?? []);
const lootByBeat = computed(() => summarizeQuestBeatLoot(lootQuery.data.value ?? []));
const selectedBeat = computed(() => beats.value.find((beat) => beat.id === selectedBeatId.value) ?? null);
const selectedAttachments = computed(() => attachments.value.filter((attachment) => attachment.beat_id === selectedBeatId.value));
const selectedLoot = computed(() => (lootQuery.data.value ?? []).filter((entry) => entry.beat_id === selectedBeatId.value));
const currentBeatId = computed(() => runtimeQuery.data.value?.current_quest_id === props.questId ? runtimeQuery.data.value.current_beat_id : null);
const presentations = computed(() => deriveQuestBeatPresentations({ beats: beats.value, edges: edges.value, attachments: attachments.value, runtime: runtimeQuery.data.value, transitions: transitions.value, lootByBeat: lootByBeat.value }));
const visitedEdgeIds = computed(() => visitedRouteEdgeIds(edges.value, transitions.value));
const isLoading = computed(() => beatsQuery.isLoading.value || edgesQuery.isLoading.value || attachmentsQuery.isLoading.value || lootQuery.isLoading.value);
const selectedEdge = computed(() => edges.value.find((edge) => edge.id === selectedEdgeId.value) ?? null);
const edgeSource = ref("");
const edgeTarget = ref("");
const edgeLabel = ref("");
const edgeSaving = ref(false);
watch(selectedEdge, (edge) => { edgeSource.value = edge?.source_beat_id ?? ""; edgeTarget.value = edge?.target_beat_id ?? ""; edgeLabel.value = edge?.label ?? ""; });

const composer = ref<{ sourceBeatId?: string; x: number; y: number } | null>(null);
const composerSaving = ref(false);
const composerError = ref("");
const pendingDeleteBeatId = ref<string | null>(null);
const replacementBeatId = ref("");
const deletingBeat = ref(false);
const mutationError = ref("");
const retryMutation = ref<(() => void) | null>(null);
const pendingDeleteBeat = computed(() => beats.value.find((beat) => beat.id === pendingDeleteBeatId.value) ?? null);
const replacementBeats = computed(() => beats.value.filter((beat) => beat.id !== pendingDeleteBeatId.value));
const deletionImpact = computed(() => ({
  edgeCount: edges.value.filter((edge) => edge.source_beat_id === pendingDeleteBeatId.value || edge.target_beat_id === pendingDeleteBeatId.value).length,
  attachmentCount: attachments.value.filter((attachment) => attachment.beat_id === pendingDeleteBeatId.value).length,
  isCurrent: currentBeatId.value === pendingDeleteBeatId.value,
}));

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
  if (command.type === "open" && isMobile.value) {
    void router.push({ path: `/quests/${props.questId}/beats/${command.beatId}`, query: { returnTo: `/quests/${props.questId}?mode=build&beat=${command.beatId}` } });
    return;
  }
  if (command.type === "select" || command.type === "open") { selectedBeatId.value = command.beatId; selectedEdgeId.value = null; }
  if (command.type === "select-edge") { selectedEdgeId.value = command.edgeId; selectedBeatId.value = null; }
  if (command.type === "create") openComposer(command);
  if (command.type === "link") void linkExisting(command.sourceBeatId, command.targetBeatId);
  if (command.type === "delete-beat") { pendingDeleteBeatId.value = command.beatId; replacementBeatId.value = ""; }
  if (command.type === "move") {
    pendingMoves.set(command.beatId, command);
    void savePositions();
  }
}

function openComposer(command: Extract<QuestGraphCommand, { type: "create" }> = { type: "create" }) {
  const source = command.sourceBeatId ?? selectedBeatId.value ?? undefined;
  const sourceBeat = beats.value.find((beat) => beat.id === source);
  composerError.value = "";
  composer.value = { sourceBeatId: source, x: command.x ?? ((sourceBeat?.canvas_x ?? Math.max(0, ...beats.value.map((beat) => beat.canvas_x))) + 320), y: command.y ?? sourceBeat?.canvas_y ?? 0 };
}

async function createComposedBeat(value: { title: string; kind: string; edgeLabel: string }) {
  if (!composer.value || !campaign.activeCampaignId) return;
  const draft = composer.value;
  composerSaving.value = true;
  composerError.value = "";
  try {
    const created = await createBeatWithRollback(
      () => createBeat.mutateAsync({ quest_id: props.questId, campaign_id: campaign.activeCampaignId!, title: value.title, kind: value.kind, visibility: "hidden", dm_content: null, read_aloud: null, how_it_plays: null, outcomes: null, consequences: null, rumor_text: null, reveal_text: null, presentation_hint: null, canvas_x: draft.x, canvas_y: draft.y, is_improvised: false }),
      draft.sourceBeatId ? (beat) => createEdge.mutateAsync({ quest_id: props.questId, campaign_id: campaign.activeCampaignId!, source_beat_id: draft.sourceBeatId!, target_beat_id: beat.id, label: value.edgeLabel }) : null,
      (beat) => deleteBeat.mutateAsync({ id: beat.id, questId: props.questId }),
    );
    selectedBeatId.value = created.id;
    composer.value = null;
  } catch (error) {
    composerError.value = error instanceof Error ? error.message : "Could not create beat";
  } finally { composerSaving.value = false; }
}

async function linkExisting(sourceBeatId: string, targetBeatId: string) {
  if (!campaign.activeCampaignId || isDuplicateQuestEdge(edges.value, sourceBeatId, targetBeatId)) { mutationError.value = "That route already exists, or points back to the same beat."; return; }
  const retry = () => void linkExisting(sourceBeatId, targetBeatId);
  try {
    mutationError.value = "";
    await createEdge.mutateAsync({ quest_id: props.questId, campaign_id: campaign.activeCampaignId, source_beat_id: sourceBeatId, target_beat_id: targetBeatId, label: "" });
    retryMutation.value = null;
  } catch (error) { mutationError.value = error instanceof Error ? error.message : "Could not create route"; retryMutation.value = retry; }
}

async function saveEdge() {
  if (!selectedEdge.value || edgeSource.value === edgeTarget.value) { mutationError.value = "A route cannot connect a beat to itself."; return; }
  edgeSaving.value = true;
  try { mutationError.value = ""; await updateEdge.mutateAsync({ id: selectedEdge.value.id, questId: props.questId, update: { source_beat_id: edgeSource.value, target_beat_id: edgeTarget.value, label: edgeLabel.value.trim() } }); retryMutation.value = null; }
  catch (error) { mutationError.value = error instanceof Error ? error.message : "Could not save route"; retryMutation.value = () => void saveEdge(); }
  finally { edgeSaving.value = false; }
}

async function deleteSelectedEdge() {
  if (!selectedEdge.value || !(await confirm(`Delete this route${selectedEdge.value.label ? ` (“${selectedEdge.value.label}”)` : ""}?`))) return;
  const edge = selectedEdge.value;
  try { mutationError.value = ""; await deleteEdge.mutateAsync({ id: edge.id, questId: props.questId }); selectedEdgeId.value = null; retryMutation.value = null; }
  catch (error) { mutationError.value = error instanceof Error ? error.message : "Could not delete route"; retryMutation.value = () => void deleteSelectedEdge(); }
}

async function archivePendingBeat() {
  const beat = pendingDeleteBeat.value;
  if (!beat || !campaign.activeCampaignId) return;
  deletingBeat.value = true;
  const wasCurrent = deletionImpact.value.isCurrent;
  try {
    if (wasCurrent) {
      const replacement = replacementBeatId.value === "end" ? null : replacementBeatId.value;
      await setRuntimeCursor.mutateAsync({ campaignId: campaign.activeCampaignId, questId: replacement ? props.questId : null, beatId: replacement });
    }
    await archiveBeat.mutateAsync({ id: beat.id, questId: props.questId });
    pendingDeleteBeatId.value = null;
    selectedBeatId.value = null;
    mutationError.value = "";
    retryMutation.value = null;
  } catch (error) {
    let restoreError: unknown = null;
    if (wasCurrent) {
      try { await setRuntimeCursor.mutateAsync({ campaignId: campaign.activeCampaignId, questId: props.questId, beatId: beat.id }); }
      catch (caught) { restoreError = caught; }
    }
    const message = error instanceof Error ? error.message : "Could not remove beat";
    mutationError.value = restoreError ? `${message} The current-beat cursor also could not be restored; reload before retrying.` : message;
    retryMutation.value = () => void archivePendingBeat();
  } finally { deletingBeat.value = false; }
}

watch(beats, (rows) => {
  selectedBeatId.value = retainSelectedBeatId(selectedBeatId.value, rows);
});

const initialBeatId = typeof route.query.beat === "string" ? route.query.beat : null;
if (initialBeatId) selectedBeatId.value = initialBeatId;

let focusedOnOpen = false;
watch([currentBeatId, beats, canvas], async ([current]) => {
  if (!props.focusCurrentOnOpen || focusedOnOpen || !current) return;
  await nextTick();
  focusedOnOpen = await canvas.value?.focusCurrent() ?? false;
}, { immediate: true });

onBeforeUnmount(() => void flushPositions());
</script>
