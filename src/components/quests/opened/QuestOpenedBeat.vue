<template>
  <section class="flex min-w-0 flex-col gap-3 pb-6" aria-label="Opened beat">
    <QuestPhoneTopBar v-if="beat" :title="beat.title || 'Untitled beat'" :subtitle="quest?.title" :fallback-to="questLinkHref(questId)" />

    <QuestThreadBar :quest-id="questId" :campaign-id="campaignId" :thread-id="threadId" @switch="switchThread" />

    <p v-if="!beat" class="py-16 text-center text-body text-muted-foreground">This beat is missing or unavailable.</p>
    <template v-else>
      <QuestOpenedHeader
        :eyebrow="eyebrow"
        :title="beat.title"
        :party-here="partyHere"
        :tone="badge.tone"
        :can-advance="canAdvance"
        :busy="moving"
        :site="siteWithRooms ? { mapShared: siteWithRooms.is_map_shared, toggling: sharing, entered: !siteLeft } : null"
        @collapse="emit('collapse')"
        @undo="undo"
        @advance="openAdvance()"
        @put-here="putPartyHere"
        @toggle-map="toggleMapShared"
        @leave-site="siteLeft = true"
        @enter-site="siteLeft = false"
      />
      <p v-if="error" role="alert" class="rounded-md border border-destructive/40 p-2 text-caption text-destructive">{{ error }}</p>

      <div class="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div class="flex min-w-0 flex-col gap-3">
          <QuestOpenedReadAloud :beat="beat" :folded="showSite" />
          <QuestSiteHandoff
            v-if="showSite && context"
            :thread-id="threadId"
            :beat="beat"
            :context="context"
            @advance="openAdvance()"
          />
          <template v-else>
            <section v-if="hasGuidance" class="space-y-3 rounded-xl border border-border bg-card p-3" aria-label="Guidance">
              <RichTextViewer v-if="beat.dm_content" :content="beat.dm_content" />
              <div v-if="beat.how_it_plays">
                <p class="mb-1 text-body font-bold text-foreground">How it plays</p>
                <RichTextViewer :content="beat.how_it_plays" />
              </div>
            </section>
            <QuestOpenedAttachments :attachments="beatAttachments" @open="selectedAttachment = $event" />
            <QuestOpenedRoutes v-if="partyHere && context" :choices="context.outgoing" @choose="openAdvance($event)" />
          </template>
        </div>
        <QuestOpenedRail
          :quest-id="questId"
          :campaign-id="campaignId"
          :thread-id="threadId"
          :beat="beat"
          :context="context"
          :held-loot="heldLoot"
          @reveal="reveal"
          @preview="previewOpen = true"
        />
      </div>

      <QuestOpenedPrep
        :beat="beat"
        :party-here="partyHere"
        :quest="quest"
        :threads="threads"
        :edges="edges"
        :beats="beats"
        :consequences="consequencesQuery.data.value ?? []"
        :loot="beatLoot"
        :attachments="beatAttachments"
        :gaps="presentations[beat.id]?.prepGaps ?? []"
      />

      <DockBar hide-from="md">
        <QuestOpenedActions class="w-full" size="lg" :party-here="partyHere" :can-advance="canAdvance" :busy="moving" @undo="undo" @advance="openAdvance()" @put-here="putPartyHere" />
      </DockBar>

      <QuestRunContainedTool
        v-if="selectedAttachment"
        :attachment="selectedAttachment"
        :return-to="questLinkHref(questId, { beat: beat.id, open: true })"
        :beat-title="beat.title"
        @close="selectedAttachment = null"
      />
      <QuestAdvanceDialog
        v-if="advanceOpen && advanceContext"
        :open="advanceOpen"
        :context="advanceContext"
        :thread-letter="badge.letter"
        :preselected-edge-id="advanceEdgeId"
        @close="advanceOpen = false"
        @advanced="advanceOpen = false"
      />
      <QuestPlayerPreviewDrawer
        v-if="previewOpen"
        :quest-id="questId"
        :visible-to="quest?.player_visible_to ?? visibleTo"
        :selected-beat-id="beat.id"
        :saved-visibility="beat.visibility"
        @close="previewOpen = false"
      />
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useBeatStagedSite } from "@/composables/quests/useBeatStagedSite";
import { useUpdateLocation } from "@/composables/locations/useLocations";
import {
  useLootPlacements,
  useMarkQuestMove,
  useQuestBeatAttachmentSummaries,
  useQuestBeatEdges,
  useQuestBeatTransitionsForQuest,
  useQuestBeats,
  useQuestConsequences,
  useQuestRuntimeContext,
  useUndoQuestMove,
} from "@/composables/quests/useQuestFlow";
import { useSetBeatVisibility } from "@/composables/quests/useSetBeatVisibility";
import { useHotkeys } from "@/composables/useHotkeys";
import { useToast } from "@/composables/useToast";
import { hasBeatText } from "@/lib/quests/beatText";
import { questLinkHref } from "@/lib/quests/navigation";
import { questBeatKindLabel, QUEST_BEAT_VISIBILITY_LABELS, type QuestBeatPresentation } from "@/lib/quests/presentation";
import { lootHeldByTheRun, soleOpenOutgoingEdgeId } from "@/lib/quests/run";
import { threadBadge, threadTone, type ThreadBadge } from "@/lib/quests/threads";
import { useCampaignStore } from "@/stores/campaign";
import type { Quest, QuestBeatAttachmentSummary, QuestThread } from "@/types/quest.types";
import DockBar from "@/components/common/DockBar.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import QuestPhoneTopBar from "../overview/QuestPhoneTopBar.vue";
import QuestThreadBar from "../flow/QuestThreadBar.vue";
import QuestRunToolLoadError from "../run/QuestRunToolLoadError.vue";
import QuestSiteHandoff from "../run/QuestSiteHandoff.vue";
import QuestOpenedActions from "./QuestOpenedActions.vue";
import QuestOpenedAttachments from "./QuestOpenedAttachments.vue";
import QuestOpenedHeader from "./QuestOpenedHeader.vue";
import QuestOpenedPrep from "./QuestOpenedPrep.vue";
import QuestOpenedRail from "./QuestOpenedRail.vue";
import QuestOpenedReadAloud from "./QuestOpenedReadAloud.vue";
import QuestOpenedRoutes from "./QuestOpenedRoutes.vue";

// Closed until used: the dialog, the preview and the contained tool load on first open.
const QuestAdvanceDialog = defineAsyncComponent(() => import("../run/QuestAdvanceDialog.vue"));
const QuestPlayerPreviewDrawer = defineAsyncComponent(() => import("../run/QuestPlayerPreviewDrawer.vue"));
const QuestRunContainedTool = defineAsyncComponent({
  loader: () => import("../run/QuestRunContainedTool.vue"),
  errorComponent: QuestRunToolLoadError,
  onError: (_error, retry, fail, attempts) => (attempts < 2 ? retry() : fail()),
});

/**
 * One beat, opened over the flow (#1183, frame 04). The beat page and the run
 * cockpit were one place seen twice, so this is both: the table's side (what to
 * read, what to run, where Advance goes) above, the prep at the foot. Where the
 * party stands decides the moves: Undo and Advance when it is here, "Put the
 * party here" when it is not, and which side is open.
 */
const { questId, beatId, quest, threads, focusThreadId, currentBeatIdByThread, presentations, visibleTo = [], sessionId = null } = defineProps<{
  questId: string;
  beatId: string;
  quest: Quest | null;
  threads: QuestThread[];
  /** The thread the designer follows when the URL names none. */
  focusThreadId: string;
  /** Where each thread's cursor stands, keyed by thread id. */
  currentBeatIdByThread: Record<string, string | null>;
  presentations: Record<string, QuestBeatPresentation>;
  visibleTo?: string[];
  /** The session marks are filed under; null leaves it to the server's own stamping. */
  sessionId?: string | null;
}>();
// Collapsing is the designer's: it owns the selection (`setOpened(false)`).
const emit = defineEmits<{ collapse: [] }>();

const route = useRoute();
const router = useRouter();
const campaign = useCampaignStore();
const toast = useToast();
const campaignId = computed(() => campaign.activeCampaignId ?? "");

// ── which thread, and whether the party stands here ──
const threadId = computed(() => (typeof route.query.thread === "string" && route.query.thread) || focusThreadId);
function switchThread(id: string) {
  void router.replace({ query: { ...route.query, thread: id } });
}
const partyHere = computed(() => currentBeatIdByThread[threadId.value] === beatId);
const badge = computed<ThreadBadge>(() => threadBadge(threads, threadId.value)
  ?? { thread: { id: threadId.value, label: "", status: "live", created_at: "" }, index: 0, letter: "A", tone: threadTone(0) });

// ── reads ──
const questIdRef = computed(() => questId);
const beatsQuery = useQuestBeats(questIdRef);
const edgesQuery = useQuestBeatEdges(questIdRef);
const attachmentsQuery = useQuestBeatAttachmentSummaries(questIdRef);
const lootQuery = useLootPlacements({ questId: questIdRef });
const consequencesQuery = useQuestConsequences(questIdRef);
const transitionsQuery = useQuestBeatTransitionsForQuest(questIdRef);
const contextQuery = useQuestRuntimeContext(questIdRef, threadId);
const context = computed(() => contextQuery.data.value ?? null);

const beats = computed(() => beatsQuery.data.value ?? []);
const edges = computed(() => edgesQuery.data.value ?? []);
const beat = computed(() => beats.value.find((row) => row.id === beatId) ?? null);
const beatAttachments = computed(() => (attachmentsQuery.data.value ?? []).filter((row: QuestBeatAttachmentSummary) => row.beat_id === beatId));
const beatLoot = computed(() => (lootQuery.data.value ?? []).filter((row) => row.beat_id === beatId));
const heldLoot = computed(() => lootHeldByTheRun(lootQuery.data.value ?? [], transitionsQuery.data.value ?? [], questId));
const hasGuidance = computed(() => hasBeatText(beat.value?.dm_content) || hasBeatText(beat.value?.how_it_plays));
const eyebrow = computed(() => (beat.value ? `${questBeatKindLabel(beat.value.kind)} · ${QUEST_BEAT_VISIBILITY_LABELS[beat.value.visibility]}` : ""));

// ── the site: the whole middle when the beat is staged at one ──
const { siteWithRooms } = useBeatStagedSite(() => beat.value?.staged_at_location_id ?? null);
const siteLeft = ref(false);
watch(() => beatId, () => { siteLeft.value = false; selectedAttachment.value = null; });
const showSite = computed(() => !!siteWithRooms.value && !siteLeft.value && !!context.value);

const { mutate: updateLocation, isPending: sharing } = useUpdateLocation();
function toggleMapShared() {
  const site = siteWithRooms.value;
  if (!site) return;
  updateLocation({ id: site.id, update: { is_map_shared: !site.is_map_shared } }, { onError: (caught) => toast.error(toast.fromError(caught)) });
}

// ── the moves ──
const error = ref("");
const markMove = useMarkQuestMove();
const undoMove = useUndoQuestMove();
const setVisibility = useSetBeatVisibility();
const moving = computed(() => markMove.isPending.value || undoMove.isPending.value);

async function guarded(fallback: string, work: () => Promise<unknown>) {
  error.value = "";
  try { await work(); } catch (caught) { error.value = caught instanceof Error ? caught.message : fallback; }
}
const putPartyHere = () => guarded("The party could not be placed here", () => markMove.mutateAsync({ campaignId: campaignId.value, questId, threadId: threadId.value, kind: "party_here", beatId, sessionId }));
// No thread: Undo takes back the quest's newest move, wherever it was made.
const undo = () => guarded("The last move could not be undone", () => undoMove.mutateAsync({ campaignId: campaignId.value, questId }));
const reveal = () => guarded("The player reveal could not be changed", async () => { if (beat.value) await setVisibility(beat.value, "revealed"); });

// ── Advance: the dialog owns the move ──
const canAdvance = computed(() => partyHere.value && context.value?.state?.status === "running" && context.value.current?.id === beatId);
const advanceOpen = ref(false);
const advanceEdgeId = ref<string | undefined>(undefined);
const advanceContext = computed(() => (canAdvance.value ? context.value : null));
function openAdvance(edgeId?: string) {
  if (!canAdvance.value) return;
  advanceEdgeId.value = edgeId;
  advanceOpen.value = true;
}

const selectedAttachment = ref<QuestBeatAttachmentSummary | null>(null);
const previewOpen = ref(false);

useHotkeys(computed(() => [
  { combo: "alt+arrowright", description: "Advance to the only open route", handler: () => {
    const edgeId = context.value ? soleOpenOutgoingEdgeId(context.value.outgoing) : null;
    if (edgeId) openAdvance(edgeId);
  } },
]), { layer: "page", enabled: computed(() => canAdvance.value && !advanceOpen.value && !selectedAttachment.value) });
</script>
