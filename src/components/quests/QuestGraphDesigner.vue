<template>
  <section class="space-y-3 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:gap-3 lg:space-y-0 lg:overflow-hidden" aria-label="Quest Build mode">
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <div>
        <h2 class="font-cinzel text-base font-bold text-foreground">Story flow</h2>
        <p class="text-caption text-muted-foreground">Create, connect, label, and arrange narrative beats.</p>
        <p v-if="tallyTotal" class="mt-1 flex flex-wrap items-center gap-1" aria-label="Story flow progress">
          <span v-if="reachTally.visited" class="rounded bg-tone-success/15 px-1.5 py-0.5 text-label uppercase text-ink-success">{{ reachTally.visited }} visited</span>
          <span v-if="liveThreadCount" class="rounded bg-primary/15 px-1.5 py-0.5 text-label uppercase text-primary">{{ liveThreadCount }} live</span>
          <span v-if="reachTally.ahead" class="rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">{{ reachTally.ahead }} ahead</span>
          <span v-if="reachTally.stranded" class="rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">{{ reachTally.stranded }} cut off</span>
          <span v-if="prepGapBeatCount" class="rounded bg-tone-caution/15 px-1.5 py-0.5 text-label uppercase text-ink-caution">{{ prepGapBeatCount }} prep gaps</span>
        </p>
      </div>
      <div class="ml-auto flex gap-2">
        <AppButton :icon="IconAdd" label="Add beat" size="sm" variant="primary" @click="openComposer()" />
        <AppButton :icon="IconLayers" label="Add parallel route" size="sm" @click="openParallelComposer" />
        <AppButton :icon="IconMaximize" label="Fit" size="sm" variant="subtle" @click="canvas?.fitGraph()" />
        <AppButton v-if="currentBeatId" :icon="IconCenter" label="Current beat" size="sm" variant="subtle" @click="canvas?.focusCurrent()" />
      </div>
    </div>

    <QuestBeatComposer
      v-if="composer"
      :source-beat-id="composer.sourceBeatId"
      :parallel="composer.parallel"
      :saving="composerSaving"
      :error="composerError"
      @cancel="composer = null"
      @submit="createComposedBeat"
    />

    <div v-if="pendingDeleteBeat" class="rounded-lg border border-destructive/40 bg-card p-3">
      <h3 class="font-cinzel text-sm font-bold">Remove “{{ pendingDeleteBeat.title }}” from the flow?</h3>
      <p class="mt-1 text-caption text-muted-foreground">
        This detaches {{ deletionImpact.edgeCount }} route{{ deletionImpact.edgeCount === 1 ? '' : 's' }} and
        {{ deletionImpact.attachmentCount }} placement{{ deletionImpact.attachmentCount === 1 ? '' : 's' }}. Visit history remains; linked entities, encounters, chat, and inventory are not deleted.
      </p>
      <AppSelect v-if="deletionImpact.standingThreadIds.length" v-model="replacementBeatId" class="mt-2" aria-label="Current beat replacement">
        <option value="">Choose replacement or end session…</option>
        <option value="end">End quest runtime</option>
        <option v-for="beat in replacementBeats" :key="beat.id" :value="beat.id">Move current to: {{ beat.title }}</option>
      </AppSelect>
      <div class="mt-3 flex justify-end gap-2">
        <AppButton label="Cancel" size="sm" variant="subtle" @click="pendingDeleteBeatId = null" />
        <AppButton label="Remove beat" size="sm" variant="destructive" :disabled="deletionImpact.standingThreadIds.length > 0 && !replacementBeatId" :loading="deletingBeat" @click="archivePendingBeat" />
      </div>
    </div>

    <p v-if="mutationError" role="alert" class="flex items-center gap-2 rounded-md border border-destructive/40 p-2 text-caption text-destructive">
      <span class="flex-1">{{ mutationError }}</span>
      <AppButton v-if="retryMutation" label="Retry" size="xs" variant="destructive" @click="retryMutation?.()" />
    </p>

    <div v-if="isLoading" class="flex justify-center py-16"><LoadingSpinner /></div>
    <p v-else-if="!beats.length" class="rounded-lg border border-dashed border-border p-8 text-center text-body text-muted-foreground">
      This quest has no beats yet. Use “Add beat” to begin its story flow.
    </p>
    <div v-else class="grid min-w-0 max-w-full items-start gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] lg:items-stretch">
      <div id="quest-flow-canvas" class="min-w-0 lg:h-full lg:min-h-0">
        <QuestFlowCanvas
          ref="canvas"
          :graph-id="`quest-${questId}`"
          :beats="beats"
          :edges="edges"
          :presentations="presentations"
          :visited-edge-ids="visitedEdgeIds"
          :edge-gates="routeGates"
          :threads="threads"
          :runtime="runtimeCursors"
          :transitions="transitions"
          :selected-beat-id="selectedBeatId"
          :current-beat-id="currentBeatId"
          :initial-viewport="initialViewport"
          :fit-on-open="!initialViewport"
          :editable="true"
          @command="onCommand"
          @viewport-change="writeQuestViewport(questId, $event)"
        />
      </div>
      <div class="flex min-w-0 max-w-full flex-col gap-3 lg:h-full lg:min-h-0">
        <QuestThreadsPanel
          v-if="threads.length"
          :quest-id="questId"
          :campaign-id="campaign.activeCampaignId ?? ''"
          :threads="threads"
          :beats="beats"
          :edges="edges"
          :current-beat-id-by-thread="currentBeatIdByThread"
          :visited-count-by-thread="visitedCountByThread"
          @focus="focusThread"
        />
        <QuestRoutePanel
          v-if="selectedEdge"
          v-model:route-kind="edgeRouteKind"
          v-model:thread-label="edgeThreadLabel"
          v-model:gate-status="edgeGateStatus"
          v-model:gate-objective-id="edgeGateObjectiveId"
          :source-title="beatTitle(selectedEdge.source_beat_id)"
          :target-title="beatTitle(selectedEdge.target_beat_id)"
          :objective-options="objectiveOptions"
          :effects="selectedEdgeEffects"
          :edit-to="`/quests/${questId}/beats/${selectedEdge.source_beat_id}`"
          :can-be-parallel="canSelectedEdgeBeParallel"
          :saving="edgeSaving"
          :error="mutationError"
          @save="saveEdge"
          @delete="deleteSelectedEdge"
        />
        <QuestSelectedBeatPanel v-else-if="selectedBeat" :beat="selectedBeat" :presentation="presentations[selectedBeat.id]" @preview="openPreview({ draftVisibility: selectedBeat.visibility, savedVisibility: selectedBeat.visibility, unsaved: false })" />
        <div v-else class="hidden rounded-xl border border-dashed border-border p-6 text-center text-caption text-muted-foreground md:block">
          Select a beat or route to see it here without leaving the flow.
        </div>
        <div class="hidden min-h-0 md:flex md:flex-1 md:flex-col">
          <QuestGraphOutline
            class="min-h-0 flex-1 overflow-y-auto"
            :beats="beats"
            :presentations="presentations"
            :edges="edges"
            :transitions="transitions"
            :threads="threads"
            :selected-beat-id="selectedBeatId"
            :editable="true"
            @command="onCommand"
          />
        </div>
      </div>
    </div>

    <p v-if="saveError" role="alert" class="text-caption text-destructive">
      The last position could not be saved and was restored. {{ saveError }}
    </p>
    <QuestPlayerPreviewDrawer
      v-if="previewOpen"
      :quest-id="questId"
      :visible-to="visibleTo"
      :selected-beat-id="selectedBeat?.id"
      :saved-visibility="previewContext?.savedVisibility"
      :draft-visibility="previewContext?.draftVisibility"
      @close="previewOpen = false"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { useRoute, useRouter } from "vue-router";
import { IconAdd, IconCenter, IconLayers, IconMaximize } from "@/lib/icons";
import {
  useQuestBeatAttachmentSummaries,
  useQuestBeatEdgeGates,
  useLootPlacements,
  useArchiveQuestBeat,
  useClearQuestBeatEdgeGate,
  useCreateQuestBeatWithRoute,
  useCreateQuestBeatEdge,
  useDeleteQuestBeatEdge,
  useQuestBeatEdges,
  useQuestBeats,
  useQuestBeatTransitionsForQuest,
  useQuestConsequences,
  useQuestRuntimeContext,
  useSetQuestBeatEdgeGate,
  useUpdateQuestBeatEdge,
  useUpdateQuestBeat,
} from "@/composables/quests/useQuestFlow";
import { useQuestThreads } from "@/composables/quests/useQuestThreads";
import { useQuestObjectives } from "@/composables/quests/useQuests";
import { useAllLocations } from "@/composables/locations/useLocations";
import { questSurfaceReturnTo } from "@/lib/quests/navigation";
import { deriveQuestBeatPresentations, tallyQuestReach, visitedRouteEdgeIds, type QuestBeatSiteInput } from "@/lib/quests/presentation";
import { deriveQuestRouteGates } from "@/lib/quests/gates";
import { summarizeQuestBeatLoot } from "@/lib/quests/loot";
import { readQuestViewport, writeQuestViewport } from "@/lib/quests/viewport";
import { extractTiptapText } from "@/lib/utils";
import { useUiStore } from "@/stores/ui";
import { retainSelectedBeatId, type QuestGraphCommand } from "@/lib/quests/flow";
import { isDuplicateQuestEdge } from "@/lib/quests/mutations";
import { defaultThreadId } from "@/lib/quests/threads";
import { useCampaignStore } from "@/stores/campaign";
import { useConfirm } from "@/composables/useConfirm";
import { useIsMobile } from "@/composables/useBreakpoint";
import { type QuestBeat, type QuestConsequenceObjectiveStatus, type QuestRouteEffect, type QuestRouteKind } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import QuestFlowCanvas from "./QuestFlowCanvas.vue";
import QuestBeatComposer from "./QuestBeatComposer.vue";
import QuestGraphOutline from "./QuestGraphOutline.vue";
import QuestThreadsPanel from "./QuestThreadsPanel.vue";
import QuestRoutePanel from "./QuestRoutePanel.vue";
import QuestSelectedBeatPanel from "./QuestSelectedBeatPanel.vue";
import QuestPlayerPreviewDrawer from "./QuestPlayerPreviewDrawer.vue";

const { questId, visibleTo = [], focusCurrentOnOpen = false } = defineProps<{ questId: string; visibleTo?: string[]; focusCurrentOnOpen?: boolean }>();
const canvas = ref<InstanceType<typeof QuestFlowCanvas> | null>(null);
const route = useRoute();
const router = useRouter();
const isMobile = useIsMobile();
// Switching to the quest overview unmounts this component, so the selection has
// to be held outside it or every flip back lands on a blank inspector.
const ui = useUiStore();
const restoredSelection = ui.questFlowSelectionFor(questId);
const selectedBeatId = ref<string | null>(restoredSelection?.beatId ?? null);
const selectedEdgeId = ref<string | null>(restoredSelection?.edgeId ?? null);
const saveError = ref("");
const previewOpen = ref(false);
const previewContext = ref<{ draftVisibility: QuestBeat["visibility"]; savedVisibility: QuestBeat["visibility"]; unsaved: boolean } | null>(null);
const initialViewport = readQuestViewport(questId);
const questIdRef = computed(() => questId);

const beatsQuery = useQuestBeats(questIdRef);
const edgesQuery = useQuestBeatEdges(questIdRef);
const edgeGatesQuery = useQuestBeatEdgeGates(questIdRef);
const objectivesQuery = useQuestObjectives(questIdRef);
const attachmentsQuery = useQuestBeatAttachmentSummaries(questIdRef);
const lootQuery = useLootPlacements({ questId: questIdRef });
const threadsQuery = useQuestThreads(questIdRef);
const consequencesQuery = useQuestConsequences(questIdRef);
const allLocationsQuery = useAllLocations();
const threads = computed(() => threadsQuery.data.value ?? []);
// The context is fetched by one thread id, but its `threads[]` carries every
// thread's own cursor — this is the one round trip that answers "where does
// each of this quest's threads stand right now."
const focusThreadId = computed(() => defaultThreadId(threads.value) ?? "");
const runtimeContextQuery = useQuestRuntimeContext(questIdRef, focusThreadId);
const transitionsQuery = useQuestBeatTransitionsForQuest(questIdRef);
const updateBeat = useUpdateQuestBeat();
const createBeatWithRoute = useCreateQuestBeatWithRoute();
const archiveBeat = useArchiveQuestBeat();
const createEdge = useCreateQuestBeatEdge();
const updateEdge = useUpdateQuestBeatEdge();
const deleteEdge = useDeleteQuestBeatEdge();
const setEdgeGate = useSetQuestBeatEdgeGate();
const clearEdgeGate = useClearQuestBeatEdgeGate();
const campaign = useCampaignStore();
const { confirm } = useConfirm();

function openPreview(context: { draftVisibility: QuestBeat["visibility"]; savedVisibility: QuestBeat["visibility"]; unsaved: boolean }) {
  previewContext.value = context;
  previewOpen.value = true;
}

const beats = computed(() => beatsQuery.data.value ?? []);
const edges = computed(() => edgesQuery.data.value ?? []);
const edgeGates = computed(() => edgeGatesQuery.data.value ?? []);
const objectives = computed(() => objectivesQuery.data.value ?? []);
const objectiveOptions = computed(() => objectives.value.map((objective) => ({ id: objective.id, name: objective.description })));
const objectiveDescriptionById = computed(() => new Map(objectives.value.map((objective) => [objective.id, objective.description])));
// Joined here rather than server-side (unlike Run mode's `outgoing.gate`)
// because Build mode edits the gate rather than only reading it — the pill
// and the editor's pre-fill share this one derivation.
const routeGates = computed(() => deriveQuestRouteGates(edgeGates.value, objectives.value));
const attachments = computed(() => attachmentsQuery.data.value ?? []);
const transitions = computed(() => transitionsQuery.data.value ?? []);
const lootByBeat = computed(() => summarizeQuestBeatLoot(lootQuery.data.value ?? []));
const consequences = computed(() => consequencesQuery.data.value ?? []);

// The story flow canvas draws a `site · N rooms` fact off a location's own
// room list — the same rooms `SiteRoomsPanel` numbers and the same test for
// "written" (`extractTiptapText`) `SiteRunSurface` uses for its own reveal.
const sites = computed<Record<string, QuestBeatSiteInput>>(() => {
  const allLocations = allLocationsQuery.data.value ?? [];
  const result: Record<string, QuestBeatSiteInput> = {};
  const stagedLocationIds = new Set(beats.value.flatMap((beat) => beat.staged_at_location_id ? [beat.staged_at_location_id] : []));
  for (const locationId of stagedLocationIds) {
    const location = allLocations.find((candidate) => candidate.id === locationId);
    if (!location) continue;
    const rooms = allLocations
      .filter((candidate) => candidate.parent_id === locationId && candidate.location_type === "room")
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const unwrittenRooms = rooms
      .map((room, index) => ({ position: index + 1, written: extractTiptapText(room.description, 1).length > 0 }))
      .filter((room) => !room.written)
      .map((room) => room.position);
    result[locationId] = { locationId, name: location.name, roomCount: rooms.length, unwrittenRooms };
  }
  return result;
});

// Every thread's own cursor, reshaped into the loose shape presentation and
// swimlane geometry both share — a full `QuestRuntimeState` row is one thing
// this quest has one of; this is the roster of everything it has several of.
const runtimeCursors = computed(() => (runtimeContextQuery.data.value?.threads ?? [])
  .map((thread) => ({ quest_id: questId, thread_id: thread.id, current_beat_id: thread.current_beat_id })));
const currentBeatIdByThread = computed(() => Object.fromEntries((runtimeContextQuery.data.value?.threads ?? []).map((thread) => [thread.id, thread.current_beat_id])));
const visitedCountByThread = computed(() => {
  const counts = new Map<string, Set<string>>();
  for (const transition of transitions.value) {
    if (!transition.thread_id || !transition.to_beat_id) continue;
    const set = counts.get(transition.thread_id) ?? new Set<string>();
    set.add(transition.to_beat_id);
    counts.set(transition.thread_id, set);
  }
  return Object.fromEntries([...counts.entries()].map(([threadId, beatIds]) => [threadId, beatIds.size]));
});
// The beat the "Fit"/"Current beat" controls focus on: the oldest live
// thread's own cursor, since a canvas can only centre on one place at a time.
const currentBeatId = computed(() => runtimeContextQuery.data.value?.state?.current_beat_id ?? null);
const liveThreadCount = computed(() => threads.value.filter((thread) => thread.status === "live").length);

const selectedBeat = computed(() => beats.value.find((beat) => beat.id === selectedBeatId.value) ?? null);
const reachTally = computed(() => tallyQuestReach(presentations.value));
const tallyTotal = computed(() => reachTally.value.visited + reachTally.value.ahead + reachTally.value.stranded + liveThreadCount.value + prepGapBeatCount.value);
const prepGapBeatCount = computed(() => Object.values(presentations.value).filter((presentation) => presentation.prepGapCount > 0).length);
const presentations = computed(() => deriveQuestBeatPresentations({
  beats: beats.value,
  edges: edges.value,
  attachments: attachments.value,
  runtime: runtimeCursors.value,
  transitions: transitions.value,
  lootByBeat: lootByBeat.value,
  consequences: consequences.value,
  sites: sites.value,
}));
const visitedEdgeIds = computed(() => visitedRouteEdgeIds(edges.value, transitions.value));
const isLoading = computed(() => beatsQuery.isLoading.value || edgesQuery.isLoading.value || attachmentsQuery.isLoading.value || lootQuery.isLoading.value);
const selectedEdge = computed(() => edges.value.find((edge) => edge.id === selectedEdgeId.value) ?? null);
const edgeRouteKind = ref<QuestRouteKind>("choice");
const edgeThreadLabel = ref("");
const edgeGateStatus = ref<QuestConsequenceObjectiveStatus | "">("");
const edgeGateObjectiveId = ref("");
const edgeSaving = ref(false);
const selectedEdgeEffects = computed<QuestRouteEffect[]>(() => {
  const edge = selectedEdge.value;
  if (!edge) return [];
  return consequences.value
    .filter((consequence) => consequence.on_edge_id === edge.id)
    .map((consequence) => ({
      action: consequence.action,
      objective: consequence.target_objective_id ? objectiveDescriptionById.value.get(consequence.target_objective_id) ?? null : null,
      after_days: consequence.after_days,
    }));
});
// Switching this route to parallel is only safe when the beat it leaves keeps
// somewhere else to send the cursor — the same invariant the composer
// enforces when a route is created from scratch.
const canSelectedEdgeBeParallel = computed(() => {
  const edge = selectedEdge.value;
  if (!edge) return false;
  if (edge.route_kind === "parallel") return true;
  return edges.value.some((candidate) => candidate.id !== edge.id && candidate.source_beat_id === edge.source_beat_id && candidate.route_kind === "choice");
});
watch(selectedEdge, (edge) => {
  edgeRouteKind.value = edge?.route_kind ?? "choice";
  edgeThreadLabel.value = edge?.thread_label ?? "";
  const gate = edge ? routeGates.value[edge.id] : undefined;
  edgeGateStatus.value = gate?.required_status ?? "";
  edgeGateObjectiveId.value = gate?.objective_id ?? "";
});
// Only "No gate" clears the objective. Moving between pending/complete/failed
// keeps it — a DM adjusting when the same route opens should not have to
// re-pick the objective every time.
watch(edgeGateStatus, (status) => {
  if (!status) edgeGateObjectiveId.value = "";
});

const composer = ref<{ sourceBeatId?: string; parallel: boolean; x: number; y: number } | null>(null);
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
  standingThreadIds: presentations.value[pendingDeleteBeatId.value ?? ""]?.currentThreadIds ?? [],
}));

const pendingMoves = new Map<string, Extract<QuestGraphCommand, { type: "move" }>>();
async function flushPositions() {
  const commands = [...pendingMoves.values()];
  pendingMoves.clear();
  for (const command of commands) {
    saveError.value = "";
    try {
      await updateBeat.mutateAsync({ id: command.beatId, questId, update: { canvas_x: command.x, canvas_y: command.y } });
    } catch (error) {
      saveError.value = error instanceof Error ? error.message : "Unknown save error";
    }
  }
}
const savePositions = useDebounceFn(flushPositions, 300, { maxWait: 1000 });

function onCommand(command: QuestGraphCommand) {
  if (command.type === "open" && isMobile.value) {
    void router.push({ path: `/quests/${questId}/beats/${command.beatId}`, query: { returnTo: questSurfaceReturnTo(questId, command.beatId, "work") } });
    return;
  }
  if (command.type === "select" || command.type === "open") { selectedBeatId.value = command.beatId; selectedEdgeId.value = null; }
  if (command.type === "select-edge") { selectedEdgeId.value = command.edgeId; selectedBeatId.value = null; }
  if (command.type === "create") openComposer(command);
  if (command.type === "link") void linkExisting(command.sourceBeatId, command.targetBeatId);
  if (command.type === "delete-beat") {
    pendingDeleteBeatId.value = command.beatId;
    replacementBeatId.value = "";
  }
  if (command.type === "move") {
    pendingMoves.set(command.beatId, command);
    void savePositions();
  }
}

function openComposer(command: Extract<QuestGraphCommand, { type: "create" }> = { type: "create" }) {
  const source = command.sourceBeatId ?? selectedBeatId.value ?? undefined;
  const sourceBeat = beats.value.find((beat) => beat.id === source);
  composerError.value = "";
  mutationError.value = "";
  composer.value = { sourceBeatId: source, parallel: false, x: command.x ?? ((sourceBeat?.canvas_x ?? Math.max(0, ...beats.value.map((beat) => beat.canvas_x))) + 320), y: command.y ?? sourceBeat?.canvas_y ?? 0 };
}

// A parallel route may never be the only way out of a beat — the same
// invariant the design's frame `01 Delta` names. Refusing here, before the
// composer even opens, is cheaper than letting the DM fill in a thread label
// for a route the save would have to reject anyway.
function openParallelComposer() {
  const source = selectedBeatId.value;
  if (!source) { mutationError.value = "Select the beat this parallel route branches from first."; return; }
  const hasChoiceRoute = edges.value.some((edge) => edge.source_beat_id === source && edge.route_kind === "choice");
  if (!hasChoiceRoute) { mutationError.value = "This beat has no choice route yet — add one before opening a parallel route, or its thread would have nowhere to send the cursor."; return; }
  const sourceBeat = beats.value.find((beat) => beat.id === source);
  composerError.value = "";
  mutationError.value = "";
  composer.value = { sourceBeatId: source, parallel: true, x: (sourceBeat?.canvas_x ?? 0) + 320, y: (sourceBeat?.canvas_y ?? 0) + 260 };
}

async function createComposedBeat(value: { title: string; kind: string; threadLabel?: string }) {
  if (!composer.value || !campaign.activeCampaignId) return;
  const draft = composer.value;
  composerSaving.value = true;
  composerError.value = "";
  try {
    const created = await createBeatWithRoute.mutateAsync({
      questId,
      title: value.title,
      kind: value.kind,
      canvasX: draft.x,
      canvasY: draft.y,
      sourceBeatId: draft.sourceBeatId,
    });
    if (draft.parallel && draft.sourceBeatId && value.threadLabel) {
      // `create_quest_beat_with_route` knows nothing of route kinds — it
      // always creates a plain edge — so opening the thread is a second
      // write against the edge the RPC just made. Refetching rather than
      // waiting on the invalidated cache's own background refetch keeps this
      // deterministic: the edge has to be found before it can be updated.
      const refreshed = await edgesQuery.refetch();
      const spawnedEdge = (refreshed.data ?? []).find((edge) => edge.source_beat_id === draft.sourceBeatId && edge.target_beat_id === created.id);
      if (spawnedEdge) {
        await updateEdge.mutateAsync({ id: spawnedEdge.id, questId, update: { route_kind: "parallel", thread_label: value.threadLabel } });
      }
    }
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
    // Drawing a connection on the canvas always makes a plain choice route —
    // a parallel route is only ever created through "Add parallel route",
    // which needs a thread label the canvas gesture has no way to collect.
    await createEdge.mutateAsync({
      quest_id: questId, campaign_id: campaign.activeCampaignId,
      source_beat_id: sourceBeatId, target_beat_id: targetBeatId,
      route_kind: "choice", thread_label: null,
    });
    retryMutation.value = null;
  } catch (error) { mutationError.value = error instanceof Error ? error.message : "Could not create route"; retryMutation.value = retry; }
}

async function saveEdge() {
  if (!selectedEdge.value) return;
  if (edgeGateStatus.value && !edgeGateObjectiveId.value) { mutationError.value = "Choose which objective gates this route, or set it back to No gate."; return; }
  if (edgeRouteKind.value === "parallel" && !edgeThreadLabel.value.trim()) { mutationError.value = "A parallel route needs a thread label — it is shown to the DM and on the player thread."; return; }
  if (edgeRouteKind.value === "parallel" && !canSelectedEdgeBeParallel.value) { mutationError.value = "This beat has no other choice route — switching this one to parallel would leave its thread nowhere to go."; return; }
  const edge = selectedEdge.value;
  edgeSaving.value = true;
  try {
    mutationError.value = "";
    await updateEdge.mutateAsync({ id: edge.id, questId, update: { route_kind: edgeRouteKind.value, thread_label: edgeRouteKind.value === "parallel" ? edgeThreadLabel.value.trim() : null } });
    if (edgeGateStatus.value) {
      await setEdgeGate.mutateAsync({ edgeId: edge.id, questId, campaignId: edge.campaign_id, objectiveId: edgeGateObjectiveId.value, status: edgeGateStatus.value });
    } else {
      // Clearing the gate is its own mutation, not the fallback of skipping
      // the write — an emptied select means "no gate," not "leave it alone."
      await clearEdgeGate.mutateAsync({ edgeId: edge.id, questId });
    }
    retryMutation.value = null;
  }
  catch (error) { mutationError.value = error instanceof Error ? error.message : "Could not save route"; retryMutation.value = () => void saveEdge(); }
  finally { edgeSaving.value = false; }
}

function beatTitle(id: string) {
  return beats.value.find((beat) => beat.id === id)?.title || "Missing beat";
}

async function deleteSelectedEdge() {
  if (!selectedEdge.value || !(await confirm(`Delete this route to “${beatTitle(selectedEdge.value.target_beat_id)}”?`))) return;
  const edge = selectedEdge.value;
  try { mutationError.value = ""; await deleteEdge.mutateAsync({ id: edge.id, questId }); selectedEdgeId.value = null; retryMutation.value = null; }
  catch (error) { mutationError.value = error instanceof Error ? error.message : "Could not delete route"; retryMutation.value = () => void deleteSelectedEdge(); }
}

async function archivePendingBeat() {
  const beat = pendingDeleteBeat.value;
  if (!beat || !campaign.activeCampaignId) return;
  deletingBeat.value = true;
  const standingThreadIds = deletionImpact.value.standingThreadIds;
  const endingRuntime = standingThreadIds.length > 0 && replacementBeatId.value === "end";
  try {
    // Every thread actually standing on the archived beat gets the same
    // disposition — the picker offers one choice, but a converge-all beat can
    // legitimately hold more than one thread at once, and each needs its own
    // replacement row rather than only the first one read.
    await archiveBeat.mutateAsync({
      id: beat.id,
      questId,
      replacements: standingThreadIds.map((threadId) => ({ threadId, beatId: endingRuntime ? null : replacementBeatId.value })),
    });
    pendingDeleteBeatId.value = null;
    selectedBeatId.value = null;
    mutationError.value = "";
    retryMutation.value = null;
  } catch (error) {
    mutationError.value = error instanceof Error ? error.message : "Could not remove beat";
    retryMutation.value = () => void archivePendingBeat();
  } finally { deletingBeat.value = false; }
}

function focusThread(threadId: string) {
  const beatId = currentBeatIdByThread.value[threadId];
  if (!beatId) return;
  selectedBeatId.value = beatId;
  selectedEdgeId.value = null;
  void canvas.value?.focusCurrent();
}

watch(beats, (rows) => {
  selectedBeatId.value = retainSelectedBeatId(selectedBeatId.value, rows);
});

const initialBeatId = typeof route.query.beat === "string" ? route.query.beat : null;
if (initialBeatId) selectedBeatId.value = initialBeatId;

watch([selectedBeatId, selectedEdgeId], ([beatId, edgeId]) => {
  ui.questFlowSelection = { questId, beatId, edgeId };
}, { immediate: true });

let focusedOnOpen = false;
watch([currentBeatId, beats, canvas], async ([current]) => {
  if (!focusCurrentOnOpen || focusedOnOpen || !current) return;
  await nextTick();
  focusedOnOpen = await canvas.value?.focusCurrent() ?? false;
}, { immediate: true });

onBeforeUnmount(() => void flushPositions());
</script>
