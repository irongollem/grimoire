<template>
  <section class="space-y-3" aria-label="Quest Run mode">
    <header class="flex flex-wrap items-center gap-2">
      <div>
        <p class="text-label font-bold uppercase tracking-wider text-primary">Session cockpit</p>
        <p class="text-caption text-muted-foreground">Stay in the story; supporting material opens with a return path.</p>
      </div>
      <div class="ml-auto flex gap-2">
        <AppButton v-if="context?.current" label="Preview as players" size="sm" variant="subtle" @click="openPreview(context.current.id)" />
      </div>
    </header>

    <QuestThreadBar :quest-id="anchorQuestId" :campaign-id="campaignId" :thread-id="threadId" @switch="switchThread" />

    <div v-if="contextQuery.isLoading.value" class="flex justify-center py-16"><LoadingSpinner /></div>
    <div v-else-if="contextQuery.error.value" class="rounded-xl border border-destructive/40 p-4">
      <p class="text-body text-destructive">The session position could not be loaded. Nothing was changed.</p>
      <AppButton class="mt-2" label="Retry" size="sm" variant="destructive" @click="contextQuery.refetch()" />
    </div>

    <template v-else-if="currentBeat && context?.state">
      <div v-if="context.state.status === 'paused'" class="rounded-lg border border-tone-caution/50 bg-tone-caution/5 p-3 text-caption text-tone-caution">
        Session paused. Prep remains available; resume when the table is ready.
      </div>
      <!-- The three concerns, side by side: the current beat (concern 2), and
           a rail carrying the objectives ledger and story so far, ending in
           the outcome strip (concern 3) — docked to the bottom of this
           column via `mt-auto`, in normal flow. No `items-start` here on
           purpose: the column must stretch to the beat card's height for
           `mt-auto` to have anywhere to push the strip down to (#776's fix,
           which must not regress into a sticky bar again). -->
      <div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div class="flex flex-col gap-3 min-h-0">
          <QuestSiteHandoff
            v-if="showSiteHandoff"
            :quest-id="anchorQuestId"
            :thread-id="threadId"
            :beat="currentBeat"
            :context="context"
            @advance="onSiteHandoffAdvance"
            @leave="siteHandoffDismissed = true"
          />
          <template v-else>
            <QuestRunBeatCard
              :anchor-quest-id="anchorQuestId"
              :beat="currentBeat"
              :attachments="currentAttachments"
              :thread-badge="currentThreadBadge"
              :place-name="stagedLocation?.name ?? null"
              @open-attachment="selectedAttachment = $event"
              @reveal="revealBeat(currentBeat.id)"
            />
            <QuestRunHeldPayoff :campaign-id="campaignId" :loot="heldLoot" :held="context.held" />
          </template>
          <QuestRunSessionPanel
            :status="context.state.status"
            :has-previous="!!context.previous"
            :disabled="transitioning"
            @previous="command('previous')"
            @jump="jumpOpen = !jumpOpen"
            @pause="command('pause')"
            @resume="command('resume')"
            @end="endSession"
          />
        </div>
        <div class="flex flex-col gap-3 min-h-0">
          <QuestRunObjectivesLedger :quest-id="anchorQuestId" :thread-id="threadId" :outgoing="context.outgoing" :threads="context.threads" />
          <QuestRunStorySoFar
            :quest-id="anchorQuestId"
            :thread-id="threadId"
            :beats="beatsQuery.data.value ?? []"
            :path-so-far="context.path_so_far"
            :current-beat-id="context.current?.id ?? null"
            :outgoing="context.outgoing"
            :consequences="consequencesQuery.data.value ?? []"
            :objectives="objectivesQuery.data.value ?? []"
            :threads="context.threads"
          />
          <QuestRunOpenChains :chains="otherOpenChains" :threads="context.threads" :thread-id="threadId" @switch-thread="switchThread" />
          <div class="mt-auto">
            <QuestRunOutcomeStrip
              :status="context.state.status"
              :outgoing="branchChoices"
              :disabled="transitioning"
              @choose="onChoose"
              @something-else="onSomethingElse"
              @reveal="revealBeat"
              @preview="openPreview"
            />
          </div>
        </div>
      </div>

      <QuestRunJumpPanel v-if="jumpOpen" v-model="jumpSearch" :targets="rankedJumpTargets" @close="jumpOpen = false" @jump="jump" />
      <QuestRunContainedTool
        v-if="selectedAttachment"
        :attachment="selectedAttachment"
        :return-to="runReturn"
        @close="selectedAttachment = null"
      />
      <QuestAdvanceDialog
        v-if="advanceOpen"
        :open="advanceOpen"
        :context="context"
        :thread-letter="currentThreadBadge.letter"
        :preselected-edge-id="advancePreselectedEdgeId"
        :improvise="advanceImprovise"
        @close="advanceOpen = false"
        @advanced="onAdvanced"
      />
      <QuestPlayerPreviewDrawer
        v-if="previewOpen"
        :quest-id="previewQuestId"
        :visible-to="previewVisibleTo"
        :selected-beat-id="previewBeat?.id"
        :saved-visibility="previewBeat?.visibility"
        @close="previewOpen = false"
      />
    </template>

    <div v-else class="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 class="font-cinzel text-lg font-bold text-foreground">Start the session flow</h2>
        <p class="text-body text-muted-foreground">Choose the first prepared beat. This does not reveal anything to players.</p>
      </div>
      <div class="flex flex-col gap-2 sm:flex-row">
        <EntityCombobox v-model="startBeatId" :options="startOptions" placeholder="Choose a starting beat…" />
        <AppButton label="Start run" variant="primary" :disabled="!startBeatId || transitioning" @click="start" />
      </div>
      <QuestRunOpenChains :chains="otherOpenChains" :threads="context?.threads ?? []" :thread-id="threadId" @switch-thread="switchThread" />
    </div>

    <p v-if="error" role="alert" class="rounded-md border border-destructive/40 p-2 text-caption text-destructive">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from "vue";
import { refDebounced } from "@vueuse/core";
import { useRoute, useRouter } from "vue-router";
import { useConfirm } from "@/composables/useConfirm";
import { useHotkeys } from "@/composables/useHotkeys";
import { useCampaignStore } from "@/stores/campaign";
import {
  useCampaignLiveQuests,
  useQuestBeatAttachmentSummaries,
  useQuestBeatEdges,
  useQuestConsequences,
  useLootPlacements,
  useQuestBeats,
  useQuestRuntimeCommand,
  useQuestRuntimeContext,
  useQuestRuntimeJumpTargets,
  useUpdateQuestBeat,
} from "@/composables/quests/useQuestFlow";
import { useQuestObjectives } from "@/composables/quests/useQuests";
import { useQuestThreads } from "@/composables/quests/useQuestThreads";
import { useQuests } from "@/composables/quests/useQuests";
import { useAllLocations } from "@/composables/locations/useLocations";
import { isSiteType } from "@/lib/locations/tiers";
import { rootBeatIds } from "@/lib/quests/graph";
import { rankQuestJumpTargets, soleOpenOutgoingEdgeId, type RankedQuestJumpTarget } from "@/lib/quests/run";
import { defaultThreadId, threadBadge, threadTone } from "@/lib/quests/threads";
import type { QuestBeatAttachmentSummary, QuestRuntimeCommand } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import QuestThreadBar from "./QuestThreadBar.vue";
import QuestRunBeatCard from "./QuestRunBeatCard.vue";
import QuestRunHeldPayoff from "./QuestRunHeldPayoff.vue";
import QuestRunSessionPanel from "./QuestRunSessionPanel.vue";
import QuestRunJumpPanel from "./QuestRunJumpPanel.vue";
import QuestRunObjectivesLedger from "./QuestRunObjectivesLedger.vue";
import QuestRunStorySoFar from "./QuestRunStorySoFar.vue";
import QuestRunOpenChains from "./QuestRunOpenChains.vue";
import QuestRunOutcomeStrip from "./QuestRunOutcomeStrip.vue";
import QuestPlayerPreviewDrawer from "./QuestPlayerPreviewDrawer.vue";
import QuestRunToolLoadError from "./QuestRunToolLoadError.vue";
import QuestAdvanceDialog from "./QuestAdvanceDialog.vue";
import QuestSiteHandoff from "./QuestSiteHandoff.vue";

const QuestRunContainedTool = defineAsyncComponent({
  loader: () => import("./QuestRunContainedTool.vue"),
  errorComponent: QuestRunToolLoadError,
  onError: (_error, retry, fail, attempts) => attempts < 2 ? retry() : fail(),
});

const { anchorQuestId, visibleTo = [] } = defineProps<{ anchorQuestId: string; visibleTo?: string[] }>();
const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const campaign = useCampaignStore();
const campaignId = computed(() => campaign.activeCampaignId ?? "");
// Every query keys off the quest in the route. Before per-quest cursors these
// followed the campaign cursor instead, so opening Run on quest A while the
// cursor sat in quest B rendered B's beat, branches, attachments and loot under
// A's URL. The anchor and the cursor are now the same quest by construction.
const questId = computed(() => anchorQuestId);
const threadsQuery = useQuestThreads(questId);
// The cockpit runs one thread at a time (#853, story F): the route names
// which one (a link into a specific thread, or the thread bar switching), and
// absent that it defaults to the quest's oldest live thread — every quest's
// only thread until a parallel route or the thread bar opens a second one.
const threadId = computed(() => {
  const fromRoute = typeof route.query.thread === "string" ? route.query.thread : "";
  if (fromRoute) return fromRoute;
  return defaultThreadId(threadsQuery.data.value ?? []) ?? "";
});
function switchThread(id: string) {
  void router.replace({ query: { ...route.query, thread: id } });
}
const contextQuery = useQuestRuntimeContext(questId, threadId);
const runtimeCommand = useQuestRuntimeCommand();
const beatsQuery = useQuestBeats(questId);
const edgesQuery = useQuestBeatEdges(questId);
const questsQuery = useQuests();
const liveQuestsQuery = useCampaignLiveQuests();
const attachmentsQuery = useQuestBeatAttachmentSummaries(questId);
const lootQuery = useLootPlacements({ questId });
const objectivesQuery = useQuestObjectives(questId);
const consequencesQuery = useQuestConsequences(questId);
const locationsQuery = useAllLocations();
const jumpSearch = ref("");
const debouncedJumpSearch = refDebounced(jumpSearch, 250);
const jumpTargetsQuery = useQuestRuntimeJumpTargets(questId, debouncedJumpSearch);
const jumpOpen = ref(false);
const startBeatId = ref("");
const transitioning = ref(false);
const error = ref("");
const selectedAttachment = ref<QuestBeatAttachmentSummary | null>(null);
const previewOpen = ref(false);
const previewBeatId = ref<string | null>(null);
const siteHandoffDismissed = ref(false);
const advanceOpen = ref(false);
const advancePreselectedEdgeId = ref<string | undefined>(undefined);
const advanceImprovise = ref(false);
const updateBeat = useUpdateQuestBeat();

const context = computed(() => contextQuery.data.value ?? null);
const currentBeat = computed(() => {
  const snapshot = context.value?.current;
  if (!snapshot) return null;
  return (beatsQuery.data.value ?? []).find((beat) => beat.id === snapshot.id) ?? snapshot;
});
const runReturn = computed(() => `/quests/${anchorQuestId}?beat=${context.value?.current?.id ?? ""}`);
// The opening beat is a graph root (#793) — a beat with no incoming route —
// computed here rather than read off a stored flag. A quest can legitimately
// open from more than one place (the party can start at the tavern or the
// docks), so every root is ranked first rather than one being guessed at;
// only a *sole* root gets picked for the DM automatically, below.
const rootIds = computed(() => new Set(rootBeatIds(beatsQuery.data.value ?? [], edgesQuery.data.value ?? [])));
const startOptions = computed(() => [...(beatsQuery.data.value ?? [])]
  .sort((a, b) => Number(rootIds.value.has(b.id)) - Number(rootIds.value.has(a.id)))
  .map((beat) => ({ id: beat.id, name: beat.title || "Untitled beat" })));
const currentAttachments = computed(() => (attachmentsQuery.data.value ?? []).filter((row) => row.beat_id === context.value?.current?.id));
const heldLoot = computed(() => (lootQuery.data.value ?? []).filter((row) => row.delivery_state === "held"));
const previewBeat = computed(() => (beatsQuery.data.value ?? []).find((beat) => beat.id === previewBeatId.value) ?? context.value?.current ?? null);
// The previewed beat always belongs to this quest now, so there is no other
// quest whose audience could be the right one. The prop is the fallback for the
// window before the quest list resolves.
const previewQuestId = computed(() => anchorQuestId);
const previewVisibleTo = computed(() => {
  const quest = questsQuery.data.value?.find((row) => row.id === anchorQuestId);
  return quest?.player_visible_to ?? visibleTo;
});
const otherOpenChains = computed(() => (liveQuestsQuery.data.value ?? [])
  .filter((chain) => chain.quest_id !== anchorQuestId));
const recentBeatIds = computed(() => {
  const ids = (context.value?.path_so_far ?? []).map((row) => String(row.to_beat_id ?? "")).filter(Boolean).reverse();
  return [...new Set(ids)];
});
const branchChoices = computed(() => {
  const visited = new Set(recentBeatIds.value);
  const beats = new Map((beatsQuery.data.value ?? []).map((beat) => [beat.id, beat]));
  return (context.value?.outgoing ?? []).map((choice) => {
    const beat = beats.get(choice.beat_id);
    return {
      ...choice,
      visibility: beat?.visibility ?? "hidden" as const,
      presentationHint: beat?.presentation_hint ?? null,
      prepGapCount: (attachmentsQuery.data.value ?? []).filter((row) => row.beat_id === choice.beat_id && row.prep_gap).length,
      isVisited: visited.has(choice.beat_id),
    };
  });
});
const rankedJumpTargets = computed(() => rankQuestJumpTargets(
  (jumpTargetsQuery.data.value ?? []).filter((target) => target.beat_id !== context.value?.current?.id),
  recentBeatIds.value,
));

// This quest's own current thread, resolved off the runtime context's own
// thread list. Falls back to `context.thread` (always the current one, per
// `get_quest_runtime_context`) at index 0 in the vanishingly unlikely case a
// stale cache lists threads without it — never absent, since every thread
// list this RPC returns includes the thread it was fetched for.
const currentThreadBadge = computed(() => {
  if (!context.value) return { thread: { id: threadId.value, label: "", status: "live" as const, created_at: "" }, index: 0, letter: "A", tone: threadTone(0) };
  return threadBadge(context.value.threads, threadId.value)
    ?? { thread: context.value.thread, index: 0, letter: "A", tone: threadTone(0) };
});

const stagedLocation = computed(() => {
  const id = currentBeat.value?.staged_at_location_id;
  if (!id) return null;
  return (locationsQuery.data.value ?? []).find((location) => location.id === id) ?? null;
});
const stagedSiteWithRooms = computed(() => {
  const location = stagedLocation.value;
  if (!location || !isSiteType(location.location_type)) return null;
  const hasRooms = (locationsQuery.data.value ?? []).some((row) => row.parent_id === location.id && row.location_type === "room");
  return hasRooms ? location : null;
});
const showSiteHandoff = computed(() => !!stagedSiteWithRooms.value && !siteHandoffDismissed.value);

// Runs got started on the overview beat by default before #793, because the
// picker offered every beat in `created_at` order with nothing selected. A
// sole root is the honest default now; several roots still leave the choice
// to the DM rather than guess which one the party actually took.
watch(rootIds, (roots) => {
  if (startBeatId.value) return;
  if (roots.size === 1) startBeatId.value = [...roots][0]!;
}, { immediate: true });

watch(() => context.value?.current?.id, (beatId) => {
  selectedAttachment.value = null;
  siteHandoffDismissed.value = false;
  if (!beatId || route.query.beat === beatId) return;
  void router.replace({ query: { ...route.query, beat: beatId } });
}, { immediate: true });

async function run(input: Parameters<typeof runtimeCommand.mutateAsync>[0]) {
  transitioning.value = true;
  error.value = "";
  try {
    const result = await runtimeCommand.mutateAsync(input);
    jumpOpen.value = false;
    return result;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "The session position could not be changed";
    await contextQuery.refetch();
    return null;
  } finally { transitioning.value = false; }
}

async function command(kind: QuestRuntimeCommand, extra: { edgeId?: string } = {}) {
  const state = context.value?.state;
  if (!state) return;
  await run({ campaignId: state.campaign_id, questId: anchorQuestId, threadId: threadId.value, command: kind, expectedVersion: state.version, ...extra });
}

async function start() {
  const beat = beatsQuery.data.value?.find((row) => row.id === startBeatId.value);
  const state = context.value?.state;
  if (!beat) return;
  await run({ campaignId: beat.campaign_id, questId: anchorQuestId, threadId: threadId.value, command: "start", expectedVersion: state?.version ?? 0, targetBeatId: beat.id });
}

async function jump(target: RankedQuestJumpTarget, reason: string, pushReturn: boolean) {
  const state = context.value?.state;
  if (!state) return;
  await run({
    campaignId: state.campaign_id, questId: anchorQuestId, threadId: threadId.value, command: "jump", expectedVersion: state.version,
    targetBeatId: target.beat_id, reason, pushReturn,
    provenance: { surface: "quest-run-jump" },
  });
}

async function endSession() {
  if (!(await confirm("End this quest’s run? Other open chains keep their place, and the visit history remains available."))) return;
  await command("end");
}

async function revealBeat(beatId: string) {
  const beat = beatsQuery.data.value?.find((row) => row.id === beatId);
  if (!beat || !(await confirm(`Reveal “${beat.title}” to players? Advancing alone leaves it ${beat.visibility}.`))) return;
  error.value = "";
  try {
    await updateBeat.mutateAsync({ id: beat.id, questId: beat.quest_id, expectedUpdatedAt: beat.updated_at, update: { visibility: "revealed" } });
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "The player reveal could not be changed";
  }
}

function openPreview(beatId: string) {
  previewBeatId.value = beatId;
  previewOpen.value = true;
}

/** "Choose" no longer transitions on its own click — the Advance dialog
 *  (story G) is "the only place a thread is created" now, so this opens it
 *  preselected on the chosen route instead of calling `command("advance")`
 *  directly. */
function onChoose(edgeId: string) {
  advancePreselectedEdgeId.value = edgeId;
  advanceImprovise.value = false;
  advanceOpen.value = true;
}
function onSiteHandoffAdvance() {
  advancePreselectedEdgeId.value = undefined;
  advanceImprovise.value = false;
  advanceOpen.value = true;
}
/** "Something else…" opens the same dialog with its improvise option
 *  selected — the dialog owns that form now (#824's one-required-field
 *  lesson lives there, copied inline from the deleted `QuestRunImprovPanel`). */
function onSomethingElse() {
  advancePreselectedEdgeId.value = undefined;
  advanceImprovise.value = true;
  advanceOpen.value = true;
}
function onAdvanced() {
  advanceOpen.value = false;
  jumpOpen.value = false;
}

useHotkeys(computed(() => [
  { combo: "alt+arrowleft", description: "Previous quest beat", handler: () => void command("previous") },
  { combo: "alt+arrowright", description: "Advance to the only open route", handler: () => {
    const edgeId = context.value ? soleOpenOutgoingEdgeId(context.value.outgoing) : null;
    if (edgeId) onChoose(edgeId);
  } },
  { combo: "j", description: "Jump to another quest beat", handler: () => { jumpOpen.value = true; } },
]), { layer: "page", enabled: computed(() => context.value?.state?.status === "running" && !transitioning.value && !jumpOpen.value && !selectedAttachment.value && !advanceOpen.value) });
</script>
