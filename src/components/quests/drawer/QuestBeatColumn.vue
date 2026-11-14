<template>
  <QuestColumnFrame label="Beat">
    <template #header>
      <QuestThreadBar v-if="threads.length > 1 && campaignId && threadId" :quest-id="questId" :campaign-id="campaignId" :thread-id="threadId" @switch="switchThread" />
      <div class="flex items-start justify-between gap-2">
        <p class="flex min-w-0 flex-wrap items-center gap-1 text-caption text-muted-foreground">
          <span>{{ kindLabel }}</span>
          <template v-if="staging">
            <span>at</span>
            <template v-if="staging.siteId && staging.siteName">
              <AppButton variant="link" size="inline-caption" :label="staging.siteName" :to="placeRoute(staging.siteId)" />
              <span aria-hidden="true">›</span>
            </template>
            <AppButton variant="link" size="inline-caption" :label="staging.name" :to="placeRoute(staging.locationId)" />
          </template>
        </p>
        <!-- Back up to the quest, said in words: an × means delete elsewhere on this screen. -->
        <AppButton :icon="IconChevronLeft" label="Quest" aria-label="Back to the quest" size="xs" variant="subtle" @click="emit('deselect')" />
      </div>
      <template v-if="beat">
        <!-- The title on the left, what players know of it on the right. -->
        <div class="flex items-start justify-between gap-3">
          <h2 class="min-w-0 text-heading-sm font-bold text-foreground">{{ beat.title || "Untitled beat" }}</h2>
          <QuestBeatVisibilityControl class="shrink-0" :beat="beat" :floor="floor" />
        </div>
        <QuestBeatMarks :beat="beat" :beats="beats" :edges="edges" :standing="threadId ? standingByThread[threadId] ?? null : null" :presentation="presentations[beat.id]" :entry-beat-id="entryBeatId" :thread-id="threadId" :session-id="sessionId" />
      </template>
    </template>

    <p v-if="!beat" class="py-10 text-center text-body text-muted-foreground">This beat is missing or unavailable.</p>
    <template v-else>
      <div class="flex justify-end">
        <AppButton v-if="!editing" variant="link" size="inline-caption" label="Edit text" @click="editing = true" />
        <AppButton v-else size="xs" variant="subtle" label="Done" @click="editing = false" />
      </div>
      <QuestBeatFields v-if="editing" :key="beat.id" :beat="beat" :fill-context="fillContext" />
      <template v-else>
        <section v-if="hasReadAloud" aria-label="Read aloud" class="rounded-md border border-border bg-muted/40 px-4 py-3 italic">
          <RichTextViewer :content="beat.read_aloud!" />
        </section>
        <RichTextViewer v-if="hasDescription" :content="beat.dm_content!" />
        <section v-if="hasHowItPlays" aria-label="How it plays">
          <h3 class="mb-1 text-body font-bold text-foreground">How it plays</h3>
          <RichTextViewer :content="beat.how_it_plays!" />
        </section>
        <div v-if="!hasReadAloud && !hasDescription && !hasHowItPlays" class="flex items-center justify-between gap-2">
          <p class="text-caption text-muted-foreground">Nothing written for this beat yet.</p>
          <AppButton size="xs" variant="subtle" label="Write it" @click="editing = true" />
        </div>
      </template>
      <!-- Where it can go reads after the beat's text and scrolls with it: pinned,
           it took the column's height from the text above it (14 Nov 2026). -->
      <QuestBeatWays
        class="mt-2 border-t-2 border-foreground pt-3"
        :beat-id="beatId"
        :edges="edges"
        :beats="beats"
        :can-take="canAdvance"
        @select-beat="emit('select-beat', $event)"
        @select-edge="emit('select-edge', $event)"
        @take="openAdvance"
      />
    </template>

    <QuestAdvanceDialog
      v-if="advanceOpen && advanceContext"
      :open="advanceOpen"
      :context="advanceContext"
      :thread-letter="threadLetter"
      :preselected-edge-id="advanceEdgeId"
      @close="advanceOpen = false"
      @advanced="advanceOpen = false"
    />
  </QuestColumnFrame>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import {
  useQuestBeatEdges,
  useQuestBeatTransitionsForQuest,
  useQuestBeats,
  useQuestRuntimeContext,
} from "@/composables/quests/useQuestFlow";
import { useQuestObjectives } from "@/composables/quests/useQuests";
import { useHotkeys } from "@/composables/useHotkeys";
import { IconChevronLeft } from "@/lib/icons";
import { placeRoute } from "@/lib/locations/placeRoute";
import type { BeatFillContext } from "@/lib/quests/beatFill";
import { hasBeatText } from "@/lib/quests/beatText";
import { questBeatKindLabel, type QuestBeatPresentation, type QuestBeatStaging } from "@/lib/quests/presentation";
import type { ThreadStanding } from "@/lib/quests/moves";
import { soleOpenOutgoingEdgeId } from "@/lib/quests/run";
import { threadBadge } from "@/lib/quests/threads";
import { partyBeatIdsOf, reachedBeatIdsOf, visibilityFloor } from "@/lib/quests/visibility";
import { useCampaignStore } from "@/stores/campaign";
import type { Quest, QuestThread } from "@/types/quest.types";
import QuestThreadBar from "../flow/QuestThreadBar.vue";
import QuestBeatFields from "../inspector/QuestBeatFields.vue";
import QuestBeatMarks from "../inspector/QuestBeatMarks.vue";
import QuestBeatVisibilityControl from "../common/QuestBeatVisibilityControl.vue";
import QuestBeatWays from "./QuestBeatWays.vue";
import QuestColumnFrame from "./QuestColumnFrame.vue";

// Closed until used: the dialog loads on the first Take.
const QuestAdvanceDialog = defineAsyncComponent(() => import("../run/QuestAdvanceDialog.vue"));

/**
 * A selected beat in the drawer's column (#1194, frame 09): where and what it is,
 * the marks, what to read and say, and "Where it can go" pinned at the foot.
 * Reading by default; `editing` swaps the body for the one autosaving form.
 */
const { questId, beatId, quest, threads, focusThreadId, currentBeatIdByThread, standingByThread, presentations, entryBeatId, sessionId = null, staging = null } = defineProps<{
  questId: string;
  beatId: string;
  quest: Quest | null;
  threads: QuestThread[];
  /** Null when the quest has no live thread yet. */
  focusThreadId: string | null;
  currentBeatIdByThread: Record<string, string | null>;
  /** Where each thread stands (#1194), for the ways Party here and Failed ask about. */
  standingByThread: Record<string, ThreadStanding>;
  presentations: Record<string, QuestBeatPresentation>;
  entryBeatId: string | null;
  sessionId?: string | null;
  staging?: QuestBeatStaging | null;
}>();
const editing = defineModel<boolean>("editing", { default: false });
const emit = defineEmits<{ deselect: []; "select-beat": [beatId: string]; "select-edge": [edgeId: string] }>();

const route = useRoute();
const router = useRouter();
const campaign = useCampaignStore();
const campaignId = computed(() => campaign.activeCampaignId);
const threadId = computed(() => (typeof route.query.thread === "string" && route.query.thread) || focusThreadId);
function switchThread(id: string) {
  void router.replace({ query: { ...route.query, thread: id } });
}
// The first thread's letter when the thread is unknown or not live yet.
const threadLetter = computed(() => (threadId.value ? threadBadge(threads, threadId.value)?.letter : undefined) ?? "A");

const questIdRef = computed(() => questId);
const beatsQuery = useQuestBeats(questIdRef);
const edgesQuery = useQuestBeatEdges(questIdRef);
const transitionsQuery = useQuestBeatTransitionsForQuest(questIdRef);
const objectivesQuery = useQuestObjectives(questIdRef);
const contextQuery = useQuestRuntimeContext(questIdRef, threadId);
const context = computed(() => contextQuery.data.value ?? null);

const beats = computed(() => beatsQuery.data.value ?? []);
const edges = computed(() => edgesQuery.data.value ?? []);
const beat = computed(() => beats.value.find((row) => row.id === beatId) ?? null);
const kindLabel = computed(() => (beat.value ? questBeatKindLabel(beat.value.kind) : ""));

// Absent when AI is off for the campaign, which hides the fill bar in `QuestBeatFields`.
const fillContext = computed<BeatFillContext | undefined>(() => {
  const row = beat.value;
  if (!campaign.isAiEnabled || !quest || !row) return undefined;
  const byId = new Map(beats.value.map((other) => [other.id, other]));
  const incomingEdges = edges.value.filter((edge) => edge.target_beat_id === row.id);
  const outgoingEdges = edges.value.filter((edge) => edge.source_beat_id === row.id);
  return {
    quest,
    beat: row,
    incoming: incomingEdges.flatMap((edge) => byId.get(edge.source_beat_id) ?? []),
    outgoing: outgoingEdges.flatMap((edge) => byId.get(edge.target_beat_id) ?? []),
    objectives: objectivesQuery.data.value ?? [],
    stagedAt: staging?.name ?? null,
    threadLabel: threads.length > 1 ? (incomingEdges.find((edge) => edge.label)?.label ?? null) : null,
  };
});

const hasReadAloud = computed(() => hasBeatText(beat.value?.read_aloud));
const hasDescription = computed(() => hasBeatText(beat.value?.dm_content));
const hasHowItPlays = computed(() => hasBeatText(beat.value?.how_it_plays));

const floor = computed(() => visibilityFloor({
  beatId,
  partyBeatIds: partyBeatIdsOf(currentBeatIdByThread),
  reachedBeatIds: reachedBeatIdsOf(transitionsQuery.data.value ?? []),
  edges: edges.value,
  secret: beat.value?.secret ?? false,
}));

// ── Take: the dialog owns the move ──
const partyHere = computed(() => !!threadId.value && currentBeatIdByThread[threadId.value] === beatId);
const canAdvance = computed(() => partyHere.value && context.value?.state?.status === "running" && context.value.current?.id === beatId);
const advanceOpen = ref(false);
const advanceEdgeId = ref<string | undefined>(undefined);
const advanceContext = computed(() => (canAdvance.value ? context.value : null));
function openAdvance(edgeId?: string) {
  if (!canAdvance.value) return;
  advanceEdgeId.value = edgeId;
  advanceOpen.value = true;
}

// The wide part's site handoff asks for the same dialog.
defineExpose({ openAdvance });

useHotkeys(computed(() => [
  { combo: "alt+arrowright", description: "Take the only open route", handler: () => {
    const edgeId = context.value ? soleOpenOutgoingEdgeId(context.value.outgoing) : null;
    if (edgeId) openAdvance(edgeId);
  } },
]), { layer: "page", enabled: computed(() => canAdvance.value && !advanceOpen.value) });
</script>
