<template>
  <section class="space-y-3 rounded-lg border border-border bg-card p-3" aria-label="Record what already happened">
    <div>
      <h3 class="font-cinzel text-sm font-bold text-foreground">Record what already happened</h3>
      <p class="text-caption text-muted-foreground">
        Backfilling ten sessions of history should not mean performing them. Select the beats the party already
        played, apply their consequences, and optionally place the party — without starting a session. Corrections
        append to the log as recorded, never as played.
      </p>
    </div>

    <LoadingSpinner v-if="beatsQuery.isLoading.value || edgesQuery.isLoading.value" class="mx-auto my-6" />

    <p v-else-if="!orderedBeats.length" class="text-caption italic text-muted-foreground">
      Write a beat in Story flow before there is anything here to record.
    </p>

    <template v-else>
      <div class="flex items-center justify-between gap-2">
        <span class="text-caption text-muted-foreground">{{ selectedBeatIds.length }} of {{ orderedBeats.length }} selected</span>
        <div class="flex gap-2">
          <AppButton label="Select all" size="xs" variant="ghost" @click="selectAll" />
          <AppButton label="Clear" size="xs" variant="ghost" :disabled="!selectedBeatIds.length" @click="selectedBeatIds = []" />
        </div>
      </div>

      <ol class="max-h-72 space-y-1 overflow-y-auto rounded-md border border-border p-2">
        <li v-for="(beatRow, index) in orderedBeats" :key="beatRow.id">
          <AppCheckbox v-model="selectedBeatIds" :value="beatRow.id" label-role="body" label-layout="row" align="start">
            <span class="min-w-0 flex-1">
              <span class="mr-1 text-caption text-muted-foreground">{{ index + 1 }}.</span>
              <span class="font-semibold text-foreground">{{ beatRow.title || "Untitled beat" }}</span>
              <span class="ml-1 text-caption text-muted-foreground">{{ beatRow.kind }}</span>
            </span>
            <span class="shrink-0 text-caption" :class="stateClass(beatRow.id)">{{ stateLabel(beatRow.id) }}</span>
          </AppCheckbox>
        </li>
      </ol>

      <label class="block space-y-1">
        <span class="text-caption text-muted-foreground">Which session did this happen in?</span>
        <AppInput v-model="reason" placeholder="Session 11" />
      </label>

      <section v-if="selectedBeatIds.length" class="space-y-1 rounded-md border border-dashed border-border p-2" aria-label="What this will move">
        <p v-if="alreadyInRecordWarning" class="text-caption text-tone-caution">{{ alreadyInRecordWarning }}</p>
        <p class="text-caption font-semibold text-foreground">This will move:</p>
        <ul v-if="previewLines.length" class="space-y-0.5">
          <li v-for="line in previewLines" :key="line.key" class="text-caption text-muted-foreground">
            <span class="text-foreground">{{ line.beatTitle }}</span> — {{ line.text }}
          </li>
        </ul>
        <p v-else class="text-caption italic text-muted-foreground">
          No consequence rules are attached to these beats directly — a rule watching an objective they move may still fire.
        </p>
      </section>

      <div class="space-y-2">
        <p v-if="resultSummary" class="text-caption text-tone-success">{{ resultSummary }}</p>
        <p v-else-if="error" role="alert" class="text-caption text-destructive">{{ error }}</p>

        <div class="flex flex-wrap items-center justify-end gap-2">
          <AppButton
            label="Mark as played"
            variant="outline"
            size="sm"
            :disabled="!selectedBeatIds.length || !campaignId || !threadId"
            :loading="submitting && pendingPlaceCursor === false"
            @click="submit(false)"
          />
          <AppButton
            :label="placeCursorLabel"
            variant="primary"
            size="sm"
            :disabled="!selectedBeatIds.length || !campaignId || !threadId"
            :loading="submitting && pendingPlaceCursor === true"
            @click="submit(true)"
          />
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  useAssertQuestRuntime,
  useQuestBeatEdges,
  useQuestBeatTransitionsForQuest,
  useQuestBeats,
  useQuestConsequences,
  useQuestRuntimeState,
  type QuestAssertRuntimeResult,
} from "@/composables/quests/useQuestFlow";
import { useQuestThreads } from "@/composables/quests/useQuestThreads";
import { useQuestObjectives } from "@/composables/quests/useQuests";
import { useCampaignStore } from "@/stores/campaign";
import { storyBeatOrder } from "@/lib/quests/graph";
import { describeQuestConsequenceAction } from "@/lib/quests/consequences";
import { deriveBeatRecordStates, describeBeatRecordState, type BeatRecordKind, type BeatRecordState } from "@/lib/quests/backfill";
import { timeAgo } from "@/lib/utils";
import type { Quest } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppInput from "@/components/common/AppInput.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";

/**
 * The prep-time counterpart to the Run cockpit's verb machine (#796): a DM
 * catching up ten sessions of history should select what already happened
 * once, not perform it ten times. Lives on the quest overview rather than in
 * the cockpit (`QuestRun*.vue`) on purpose — this is prep, not play, and it
 * must never share the cockpit's surface or its "start a session" affordances.
 *
 * Nothing here can make the quest look live: it never touches `ui.dmMode`,
 * never navigates with `?view=run`, and `assert_quest_runtime` itself is
 * documented to leave `status` exactly as it found it (idle stays idle, paused
 * stays paused) — only `transition_quest_runtime` can start a session. See
 * `src/lib/quests/board.ts`'s `isLive` and `SessionRail.vue`, both keyed
 * strictly on `status === "running"`, which this RPC never sets.
 *
 * Every row shows its own state before anything is ticked — "the party is
 * here", "played · 3d ago", "recorded · Session 4", "not played" — derived in
 * `src/lib/quests/backfill.ts` from the transition log and the cursor, never
 * guessed from the checkbox list. That is the panel's own feedback loop: a
 * DM who just recorded a run of beats sees them turn from "not played" to
 * "recorded" in place, rather than a cleared list and a banner they have to
 * take on faith — the report from real use of the first version, 7 Sep 2026.
 */
const { quest } = defineProps<{ quest: Quest }>();
const questId = computed(() => quest.id);

const campaign = useCampaignStore();
const campaignId = computed(() => campaign.activeCampaignId);

const beatsQuery = useQuestBeats(questId);
const edgesQuery = useQuestBeatEdges(questId);
const consequencesQuery = useQuestConsequences(questId);
const { data: objectivesData } = useQuestObjectives(questId);
const threadsQuery = useQuestThreads(questId);
// Interim (#853): wave 1 replaces this — see #854/#856/#859. Backfilling
// records history against one thread — its own live thread, since every
// quest has exactly one until a parallel route or the thread bar opens a
// second.
const threadId = computed(() => threadsQuery.data.value?.find((thread) => thread.status === "live")?.id ?? "");
const runtimeQuery = useQuestRuntimeState(questId, threadId);
const transitionsQuery = useQuestBeatTransitionsForQuest(questId);
const assertRuntime = useAssertQuestRuntime();

const beats = computed(() => beatsQuery.data.value ?? []);
const edges = computed(() => edgesQuery.data.value ?? []);
const consequences = computed(() => consequencesQuery.data.value ?? []);
const objectives = computed(() => objectivesData.value ?? []);
const transitions = computed(() => transitionsQuery.data.value ?? []);
const currentBeatId = computed(() => runtimeQuery.data.value?.current_beat_id ?? null);
const runtimeStatus = computed(() => runtimeQuery.data.value?.status ?? null);

const beatsById = computed(() => new Map(beats.value.map((beatRow) => [beatRow.id, beatRow])));
// Reuses the graph's own root/reachability traversal (src/lib/quests/graph.ts)
// rather than a second ordering — this is a backfill, so the order beats are
// applied in is the point: it is what the chained `from`/`to` pairs in the log
// read as afterward.
const orderedBeatIds = computed(() => storyBeatOrder(beats.value, edges.value));
const orderedBeats = computed(() => orderedBeatIds.value.flatMap((id) => {
  const beatRow = beatsById.value.get(id);
  return beatRow ? [beatRow] : [];
}));

const recordStates = computed(() => deriveBeatRecordStates({
  questId: questId.value,
  beatIds: orderedBeatIds.value,
  transitions: transitions.value,
  currentBeatId: currentBeatId.value,
}));

function stateFor(beatId: string): BeatRecordState {
  return recordStates.value[beatId] ?? { kind: "unplayed", at: null, note: null };
}

function stateLabel(beatId: string): string {
  return describeBeatRecordState(stateFor(beatId), runtimeStatus.value, timeAgo);
}

const STATE_CLASS: Record<BeatRecordKind, string> = {
  here: "text-primary font-semibold",
  recorded: "text-tone-caution",
  played: "text-muted-foreground",
  unplayed: "text-foreground",
};

function stateClass(beatId: string): string {
  return STATE_CLASS[stateFor(beatId).kind];
}

const selectedBeatIds = ref<string[]>([]);
const reason = ref("");
const submitting = ref(false);
const pendingPlaceCursor = ref<boolean | null>(null);
const error = ref("");
const result = ref<QuestAssertRuntimeResult | null>(null);
const lastReason = ref("");

// Only the beats with nothing recorded yet — a played or recorded beat can
// still be ticked by hand (a party can loop back through a beat), but "select
// all" should not silently pile a second entry onto everything already in the
// log.
function selectAll() {
  selectedBeatIds.value = orderedBeats.value
    .filter((beatRow) => stateFor(beatRow.id).kind === "unplayed")
    .map((beatRow) => beatRow.id);
}

// Selection order is whatever order the checkboxes were clicked in; submission
// order is always story order, because that is what "backfilling history"
// means — ticking beats out of sequence must not chain the log out of sequence.
const beatIdsInSubmitOrder = computed(() => {
  const selected = new Set(selectedBeatIds.value);
  return orderedBeatIds.value.filter((id) => selected.has(id));
});

const lastSelectedBeatTitle = computed(() => {
  const lastId = beatIdsInSubmitOrder.value[beatIdsInSubmitOrder.value.length - 1];
  return lastId ? beatsById.value.get(lastId)?.title || "Untitled beat" : "";
});

const placeCursorLabel = computed(() =>
  lastSelectedBeatTitle.value
    ? `Mark as played and put the party at “${lastSelectedBeatTitle.value}”`
    : "Mark as played and put the party here",
);

// The missing warning from the first version: ticking a beat that already has
// a played or recorded entry — or is where the party currently stands — used
// to record a silent second entry. Now the preview says so before Record is
// ever pressed.
const alreadyInRecordCount = computed(() =>
  beatIdsInSubmitOrder.value.filter((id) => stateFor(id).kind !== "unplayed").length,
);

const alreadyInRecordWarning = computed(() => {
  const count = alreadyInRecordCount.value;
  if (!count) return "";
  const isAre = count === 1 ? "is" : "are";
  const itThem = count === 1 ? "it" : "them";
  return `${count} of these ${isAre} already in the record; recording ${itThem} again appends a second entry.`;
});

function objectiveLabel(id: string | null): string {
  if (!id) return "";
  return objectives.value.find((objective) => objective.id === id)?.description ?? "Objective removed";
}

interface PreviewLine {
  key: string;
  beatTitle: string;
  text: string;
}

// First-order only: the rules attached directly to a selected beat's arrival.
// A rule watching the objective one of those moves (an `on_objective_status`
// or `on_quest_settled` condition) can still cascade server-side — replicating
// that whole engine client-side would be a second copy of
// `private.apply_quest_consequences`, which is exactly the kind of drift the
// consequence mechanism (#794) was built to end. The result banner below
// reports what the database actually did; this is what the DM can know in
// advance.
const previewLines = computed<PreviewLine[]>(() => {
  const lines: PreviewLine[] = [];
  for (const beatId of beatIdsInSubmitOrder.value) {
    const beatTitle = beatsById.value.get(beatId)?.title || "Untitled beat";
    for (const rule of consequences.value.filter((row) => row.on_beat_id === beatId)) {
      lines.push({ key: rule.id, beatTitle, text: describeQuestConsequenceAction(rule, objectiveLabel) });
    }
  }
  return lines;
});

const resultSummary = computed(() => {
  if (!result.value) return "";
  const count = result.value.asserted;
  const noun = count === 1 ? "beat" : "beats";
  const sessionPart = lastReason.value ? ` in ${lastReason.value}` : "";
  return `Recorded ${count} ${noun} as played${sessionPart}.`;
});

async function submit(placeCursor: boolean) {
  if (!beatIdsInSubmitOrder.value.length || !campaignId.value || !threadId.value) return;
  submitting.value = true;
  pendingPlaceCursor.value = placeCursor;
  error.value = "";
  result.value = null;
  const reasonAtSubmit = reason.value.trim();
  try {
    result.value = await assertRuntime.mutateAsync({
      campaignId: campaignId.value,
      questId: questId.value,
      threadId: threadId.value,
      beatIds: beatIdsInSubmitOrder.value,
      placeCursor,
      reason: reason.value,
    });
    lastReason.value = reasonAtSubmit;
    selectedBeatIds.value = [];
    reason.value = "";
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Could not record this history";
  } finally {
    submitting.value = false;
    pendingPlaceCursor.value = null;
  }
}
</script>
