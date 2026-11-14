<template>
  <section class="space-y-3 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:gap-3 lg:space-y-0 lg:overflow-hidden" aria-label="Quest Build mode">
    <!-- One toolbar row: the active tab already names the surface, so no
         heading of its own above the tally (12 Nov 2026). -->
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <h2 class="sr-only">Story flow</h2>
      <div>
        <p v-if="tallyTotal" class="flex flex-wrap items-center gap-1" aria-label="Story flow progress">
          <span v-if="reachTally.visited" class="rounded bg-tone-success/15 px-1.5 py-0.5 text-label uppercase text-ink-success">{{ reachTally.visited }} visited</span>
          <span v-if="liveThreadCount" class="rounded bg-primary/15 px-1.5 py-0.5 text-label uppercase text-primary">{{ liveThreadCount }} live</span>
          <TagChip v-if="reachTally.ahead" class="uppercase">{{ reachTally.ahead }} ahead</TagChip>
          <TagChip v-if="reachTally.stranded" class="uppercase">{{ reachTally.stranded }} cut off</TagChip>
          <QuestGapMenu v-if="gapRows.length" :rows="gapRows" @select="select({ beat: $event })" />
        </p>
      </div>
      <!-- Wraps rather than squeezes: four labels in one non-wrapping row at
           390px became four two-line blocks (#872). Fit and Current beat act
           on the canvas, which the outline replaces below 48rem, so they do
           not exist there. -->
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <QuestFlowMarksBar :quest-id="questId" :transitions="transitions" :beats="beats" />
        <AppButton :icon="IconAdd" label="Add beat" size="sm" variant="primary" class="whitespace-nowrap" @click="openComposer()" />
        <AppButton :icon="IconLayers" label="Add parallel route" size="sm" class="whitespace-nowrap" @click="openParallelComposer" />
        <AppButton :icon="IconMaximize" label="Fit" size="sm" variant="subtle" class="hidden whitespace-nowrap md:inline-flex" @click="canvas?.fitGraph()" />
        <AppButton v-if="currentBeatId" :icon="IconCenter" label="Current beat" size="sm" variant="subtle" class="hidden whitespace-nowrap md:inline-flex" @click="canvas?.focusCurrent()" />
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
      <h3 class="text-heading-sm font-bold">Remove “{{ pendingDeleteBeat.title }}” from the flow?</h3>
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
    <div v-else class="relative grid min-w-0 max-w-full items-start gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-stretch">
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
          :entry-beat-id="entryBeatId"
          :initial-viewport="initialViewport"
          :frame-on-open="!initialViewport"
          :editable="true"
          @command="onCommand"
          @viewport-change="writeQuestViewport(questId, $event)"
        />
      </div>
      <QuestDrawer
        :quest-id="questId"
        :mode="drawerMode"
        :open="drawerOpened"
        :title="drawerTitle"
        :subtitle="drawerSubtitle"
        @update:open="setOpened"
        @deselect="select({})"
      >
        <template #column>
          <QuestRouteColumn
            v-if="drawerMode === 'route' && selectedEdgeId"
            :key="selectedEdgeId"
            :quest-id="questId"
            :edge-id="selectedEdgeId"
            :thread-id="focusThreadId"
            :session-id="markSession.sessionId.value"
            @deselect="select({})"
            @deleted="select({})"
            @select-beat="select({ beat: $event, open: drawerOpened })"
          />
          <QuestBeatColumn
            v-else-if="drawerMode === 'beat' && selectedBeatId"
            :key="selectedBeatId"
            ref="beatColumn"
            v-model:editing="editingBeatText"
            :quest-id="questId"
            :beat-id="selectedBeatId"
            :quest="quest"
            :threads="threads"
            :focus-thread-id="focusThreadId"
            :current-beat-id-by-thread="currentBeatIdByThread"
            :presentations="presentations"
            :entry-beat-id="entryBeatId"
            :session-id="markSession.sessionId.value"
            :staging="selectedBeatStaging"
            @deselect="select({})"
            @select-beat="select({ beat: $event, open: drawerOpened })"
            @select-edge="select({ edge: $event })"
          />
          <QuestColumn v-else-if="quest" :quest="quest" @select-beat="select({ beat: $event, open: drawerOpened })" />
        </template>
        <template #wide>
          <QuestBeatWide
            v-if="drawerMode === 'beat' && selectedBeatId"
            :key="selectedBeatId"
            :quest-id="questId"
            :beat-id="selectedBeatId"
            :quest="quest"
            :threads="threads"
            :focus-thread-id="focusThreadId"
            :current-beat-id-by-thread="currentBeatIdByThread"
            :presentations="presentations"
            @edit-text="editingBeatText = true"
            @advance="beatColumn?.openAdvance()"
          />
          <QuestWide v-else-if="drawerMode === 'quest' && quest" :quest="quest" :current-beat-id-by-thread="currentBeatIdByThread" :visited-count-by-thread="visitedCountByThread" @focus-thread="focusThread" />
        </template>
      </QuestDrawer>
    </div>

    <p v-if="saveError" role="alert" class="text-caption text-destructive">
      The last position could not be saved and was restored. {{ saveError }}
    </p>
  </section>
</template>

<script setup lang="ts">
import TagChip from "@/components/common/TagChip.vue";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { IconAdd, IconCenter, IconLayers, IconMaximize } from "@/lib/icons";
import {
  useQuestBeatAttachmentSummaries,
  useQuestBeatEdgeGates,
  useLootPlacements,
  useArchiveQuestBeat,
  useCreateQuestBeatWithRoute,
  useCreateQuestBeatEdge,
  useQuestBeatEdges,
  useQuestBeats,
  useQuestBeatTransitionsForQuest,
  useQuestConsequences,
  useQuestRuntimeContext,
  useUpdateQuestBeatEdge,
  useSetQuestBeatPositions,
} from "@/composables/quests/useQuestFlow";
import { useQuestThreads } from "@/composables/quests/useQuestThreads";
import { useQuest, useQuestObjectives } from "@/composables/quests/useQuests";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useLocationDescriptions } from "@/composables/locations/useLocationDescriptions";
import { useSiteBeatGaps } from "@/composables/quests/useSiteBeatGaps";
import { isInteriorType, isSiteType } from "@/lib/locations/tiers";
import { deriveQuestBeatPresentations, presentableBeatOf, tallyQuestReach, visitedRouteEdgeIds, type QuestBeatSiteInput, type QuestBeatStaging } from "@/lib/quests/presentation";
import { deriveQuestRouteGates } from "@/lib/quests/gates";
import { summarizeQuestBeatLoot } from "@/lib/quests/loot";
import { readQuestViewport, writeQuestViewport } from "@/lib/quests/viewport";
import { extractTiptapText } from "@/lib/utils";
import { useQuestSelection } from "@/composables/quests/useQuestSelection";
import { retainSelectedBeatId, type QuestGraphCommand } from "@/lib/quests/flow";
import { isDuplicateQuestEdge } from "@/lib/quests/mutations";
import { defaultThreadId } from "@/lib/quests/threads";
import { deriveQuestConsistency } from "@/lib/quests/consistency";
import { useCampaignStore } from "@/stores/campaign";
import { useQuestMarkSession } from "@/composables/quests/useQuestMarkSession";
import type { LocationSummary } from "@/types/location.types";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import QuestFlowCanvas from "./QuestFlowCanvas.vue";
import QuestBeatComposer from "../inspector/QuestBeatComposer.vue";
import QuestGapMenu, { type QuestGapRow } from "./QuestGapMenu.vue";
import QuestFlowMarksBar from "./QuestFlowMarksBar.vue";
import QuestDrawer from "./QuestDrawer.vue";
import QuestColumn from "../drawer/QuestColumn.vue";
import QuestWide from "../drawer/QuestWide.vue";
import QuestBeatColumn from "../drawer/QuestBeatColumn.vue";
import QuestBeatWide from "../drawer/QuestBeatWide.vue";
import QuestRouteColumn from "../drawer/QuestRouteColumn.vue";

const { questId, focusCurrentOnOpen = false, entryBeatId = null } = defineProps<{ questId: string; focusCurrentOnOpen?: boolean; entryBeatId?: string | null }>();
const canvas = ref<InstanceType<typeof QuestFlowCanvas> | null>(null);
const beatColumn = ref<InstanceType<typeof QuestBeatColumn> | null>(null);
/** The beat column's text form is open; the wide part's "Edit text" asks for it. */
const editingBeatText = ref(false);
const saveError = ref("");
const initialViewport = readQuestViewport(questId);
const questIdRef = computed(() => questId);

const beatsQuery = useQuestBeats(questIdRef);
const edgesQuery = useQuestBeatEdges(questIdRef);
const edgeGatesQuery = useQuestBeatEdgeGates(questIdRef);
const questQuery = useQuest(questIdRef);
const objectivesQuery = useQuestObjectives(questIdRef);
const attachmentsQuery = useQuestBeatAttachmentSummaries(questIdRef);
const lootQuery = useLootPlacements({ questId: questIdRef });
const threadsQuery = useQuestThreads(questIdRef);
const consequencesQuery = useQuestConsequences(questIdRef);
const allLocationsQuery = useAllLocations();
const markSession = useQuestMarkSession();
const quest = computed(() => questQuery.data.value ?? null);
const threads = computed(() => threadsQuery.data.value ?? []);
// The context is fetched by one thread id, but its `threads[]` carries every
// thread's own cursor — this is the one round trip that answers "where does
// each of this quest's threads stand right now."
const focusThreadId = computed(() => defaultThreadId(threads.value));
const runtimeContextQuery = useQuestRuntimeContext(questIdRef, focusThreadId);
const transitionsQuery = useQuestBeatTransitionsForQuest(questIdRef);
const setPositions = useSetQuestBeatPositions();
const createBeatWithRoute = useCreateQuestBeatWithRoute();
const archiveBeat = useArchiveQuestBeat();
const createEdge = useCreateQuestBeatEdge();
const updateEdge = useUpdateQuestBeatEdge();
const campaign = useCampaignStore();

const beats = computed(() => beatsQuery.data.value ?? []);
const edges = computed(() => edgesQuery.data.value ?? []);
const edgeGates = computed(() => edgeGatesQuery.data.value ?? []);
const objectives = computed(() => objectivesQuery.data.value ?? []);
// Joined here rather than server-side (unlike Run mode's `outgoing.gate`)
// because Build mode edits the gate rather than only reading it — the pill
// and the editor's pre-fill share this one derivation.
const routeGates = computed(() => deriveQuestRouteGates(edgeGates.value, objectives.value, edges.value));
const attachments = computed(() => attachmentsQuery.data.value ?? []);
const transitions = computed(() => transitionsQuery.data.value ?? []);
const lootByBeat = computed(() => summarizeQuestBeatLoot(lootQuery.data.value ?? []));
const consequences = computed(() => consequencesQuery.data.value ?? []);

const allLocationsRef = computed(() => allLocationsQuery.data.value ?? []);

// A beat can now be staged at a room, not only a site itself (#868 S12 —
// `staged_at_location_id` always accepted any location, and a room *is* a
// location; the site panel just stops restricting the picker). This resolves
// "the site" a staged location actually belongs to — itself if it's already
// site-tier, else its parent — once, shared by the room-count fact below and
// the readiness batch feeding it. Keyed by the STAGED id (what a beat's
// `staged_at_location_id` and `deriveQuestBeatPresentations`'s `sites` lookup
// both use), not the resolved site's own id.
const stagedSites = computed(() => {
  const allLocations = allLocationsRef.value;
  const result = new Map<string, LocationSummary>();
  for (const stagedId of new Set(beats.value.flatMap((beat) => beat.staged_at_location_id ? [beat.staged_at_location_id] : []))) {
    const staged = allLocations.find((candidate) => candidate.id === stagedId);
    if (!staged) continue;
    const site = isSiteType(staged.location_type) ? staged : allLocations.find((candidate) => candidate.id === staged.parent_id);
    if (site) result.set(stagedId, site);
  }
  return result;
});
// Where the selected beat happens, for the summary panel's links: the staged
// location itself, and the site it sits in when it is a room. Built for any
// staged location — a tavern or a city, not only a site with rooms — since
// the panel's job is to get the DM there without opening the beat first.
// The route panel reads the same for the route's target, where taking the
// route puts the party.
function stagingFor(stagedId: string | null | undefined): QuestBeatStaging | null {
  if (!stagedId) return null;
  const staged = allLocationsRef.value.find((candidate) => candidate.id === stagedId);
  if (!staged) return null;
  const site = stagedSites.value.get(stagedId);
  const inSite = site && site.id !== staged.id ? site : null;
  return { locationId: staged.id, name: staged.name, siteId: inSite?.id ?? null, siteName: inSite?.name ?? null };
}
const selectedBeatStaging = computed<QuestBeatStaging | null>(() => {
  return stagingFor(selectedBeat.value?.staged_at_location_id);
});
const stagedSiteIds = computed(() => [...new Set([...stagedSites.value.values()].map((site) => site.id))]);
const { readinessBySite } = useSiteBeatGaps(stagedSiteIds, allLocationsRef);

// The story flow canvas draws a `site · N rooms` fact off a location's own
// room list — the same rooms `SiteRoomsPanel` numbers and the same test for
// "written" (`extractTiptapText`) the explore screen (`SiteExploreView`) uses for its own reveal.
// #886: a `wilds` site's children are `grounds`, not `room` — the same
// interior predicate `SiteRoomsPanel` reads, so a wilds beat's card stops
// reporting 0 rooms for a fully built wood.
const roomsByStagedId = computed(() => {
  const allLocations = allLocationsRef.value;
  const result = new Map<string, LocationSummary[]>();
  for (const [stagedId, site] of stagedSites.value) {
    result.set(stagedId, allLocations
      .filter((candidate) => candidate.parent_id === site.id && isInteriorType(candidate.location_type))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
  }
  return result;
});
// The place list is slim and carries no description (#972): "written" is
// derived from the descriptions of exactly the rooms the cards count.
const roomIdsToCheck = computed(() => [...roomsByStagedId.value.values()].flat().map((room) => room.id));
const { data: roomDescriptions } = useLocationDescriptions(roomIdsToCheck);
const sites = computed<Record<string, QuestBeatSiteInput>>(() => {
  const allLocations = allLocationsRef.value;
  const descriptions = roomDescriptions.value;
  const result: Record<string, QuestBeatSiteInput> = {};
  for (const [stagedId, site] of stagedSites.value) {
    const rooms = roomsByStagedId.value.get(stagedId) ?? [];
    // Until the descriptions arrive nothing is claimed unwritten: a card must
    // not flash "N unwritten" for a site that is fully written.
    const unwrittenRooms = descriptions === undefined ? [] : rooms
      .map((room, index) => ({ position: index + 1, written: extractTiptapText(descriptions.get(room.id) ?? null, 1).length > 0 }))
      .filter((room) => !room.written)
      .map((room) => room.position);
    // #887: `siteType` lets `formatUnwrittenRoomsLabel` call a wilds site's
    // empty parts "grounds", not "rooms" — this loop already holds `site`.
    const roomName = stagedId !== site.id ? allLocations.find((candidate) => candidate.id === stagedId)?.name ?? null : null;
    result[stagedId] = { locationId: stagedId, name: site.name, roomName, roomCount: rooms.length, unwrittenRooms, readiness: readinessBySite.value[site.id], siteType: site.location_type };
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
// After the cursors it reads: its `open=party` watch runs immediately, so an
// earlier call hit `currentBeatIdByThread` in its temporal dead zone and the
// whole screen failed to mount.
const { selectedBeatId, selectedEdgeId, drawerOpened, select, setOpened } = useQuestSelection({
  partyBeatFor: (thread) => {
    const id = thread ?? focusThreadId.value;
    return (id ? currentBeatIdByThread.value[id] : undefined) ?? currentBeatId.value;
  },
  partyBeatSource: () => [currentBeatIdByThread.value, currentBeatId.value],
});
const liveThreadCount = computed(() => threads.value.filter((thread) => thread.status === "live").length);

const selectedBeat = computed(() => beats.value.find((beat) => beat.id === selectedBeatId.value) ?? null);
const reachTally = computed(() => tallyQuestReach(presentations.value));
const tallyTotal = computed(() => reachTally.value.visited + reachTally.value.ahead + reachTally.value.stranded + liveThreadCount.value + gapRows.value.length);
// Every gap in one list: each beat's own prep gaps, then the wiring findings a
// graph can prove. Held back until the inputs of the second have loaded, so a
// finding is never derived from a half-loaded quest.
const consistencyReady = computed(() => !objectivesQuery.isLoading.value && !consequencesQuery.isLoading.value && !edgeGatesQuery.isLoading.value);
const gapRows = computed<QuestGapRow[]>(() => {
  const rows: QuestGapRow[] = beats.value.flatMap((beat) => (presentations.value[beat.id]?.prepGaps ?? [])
    .map((gap) => ({ key: `prep:${beat.id}:${gap.kind}`, beatId: beat.id, beatTitle: beat.title || "Untitled beat", text: gap.label })));
  if (!consistencyReady.value) return rows;
  const findings = deriveQuestConsistency({ beats: beats.value, edges: edges.value, objectives: objectives.value, consequences: consequences.value, gates: edgeGates.value });
  findings.forEach((finding, index) => {
    const beatId = finding.beatIds?.[0] ?? null;
    rows.push({
      key: `finding:${finding.kind}:${index}`,
      beatId,
      beatTitle: beats.value.find((beat) => beat.id === beatId)?.title || null,
      text: finding.message,
      advisory: finding.advisory,
    });
  });
  return rows;
});
const presentations = computed(() => deriveQuestBeatPresentations({
  beats: beats.value.map(presentableBeatOf),
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
  // Cleared before the await so a move arriving mid-flight waits for the next flush.
  const positions = [...pendingMoves.values()].map((command) => ({ id: command.beatId, x: command.x, y: command.y }));
  pendingMoves.clear();
  if (positions.length === 0) return;
  saveError.value = "";
  try {
    await setPositions.mutateAsync({ questId, positions });
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : "Unknown save error";
  }
}
const savePositions = useDebounceFn(flushPositions, 300, { maxWait: 1000 });

// What the closed drawer shows.
const drawerMode = computed<"quest" | "beat" | "route">(() => (selectedEdge.value ? "route" : selectedBeat.value ? "beat" : "quest"));
// The phone page the drawer opens to, when wide: the beat's title under the quest's, else the quest's.
const drawerTitle = computed(() => (drawerMode.value === "beat" ? selectedBeat.value?.title || "Untitled beat" : quest.value?.title ?? ""));
const drawerSubtitle = computed(() => (drawerMode.value === "beat" ? quest.value?.title : undefined));
// The text form belongs to one beat: picking another starts it closed.
watch(selectedBeatId, () => { editingBeatText.value = false; });

function onCommand(command: QuestGraphCommand) {
  if (command.type === "select") select({ beat: command.beatId, open: drawerOpened.value });
  if (command.type === "open") select({ beat: command.beatId, open: true });
  if (command.type === "select-edge") select({ edge: command.edgeId });
  if (command.type === "deselect") select({});
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
  if (!hasChoiceRoute) { mutationError.value = "This beat has no choice route yet. Add one before opening a parallel route, or its thread would have nowhere to send the cursor."; return; }
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
        await updateEdge.mutateAsync({ id: spawnedEdge.id, questId, update: { route_kind: "parallel", label: value.threadLabel } });
      }
    }
    select({ beat: created.id });
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
      route_kind: "choice", label: null,
    });
    retryMutation.value = null;
  } catch (error) { mutationError.value = error instanceof Error ? error.message : "Could not create route"; retryMutation.value = retry; }
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
    select({});
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
  select({ beat: beatId });
  void canvas.value?.focusCurrent();
}

// A link naming a beat or route that is gone (deleted, or a stale bookmark)
// must not leave the drawer pointing at nothing.
watch([beats, edges], ([beatRows, edgeRows]) => {
  if (!beatsQuery.isSuccess.value || !edgesQuery.isSuccess.value) return;
  const beatGone = selectedBeatId.value && retainSelectedBeatId(selectedBeatId.value, beatRows) === null;
  const edgeGone = selectedEdgeId.value && !edgeRows.some((edge) => edge.id === selectedEdgeId.value);
  if (beatGone || edgeGone) select({});
});

let focusedOnOpen = false;
watch([currentBeatId, beats, canvas], async ([current]) => {
  if (!focusCurrentOnOpen || focusedOnOpen || !current) return;
  await nextTick();
  focusedOnOpen = await canvas.value?.focusCurrent() ?? false;
}, { immediate: true });

onBeforeUnmount(() => void flushPositions());
</script>
