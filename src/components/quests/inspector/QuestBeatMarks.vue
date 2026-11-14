<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
      <div ref="marksEl" class="flex flex-wrap gap-x-4 gap-y-1" role="group" aria-label="Marks">
        <AppCheckbox :model-value="isEntry" label="Entry" label-role="caption" size="sm" :disabled="isEntry || busy" @update:model-value="markEntry" />
        <AppCheckbox :key="`here${untick}`" :model-value="isPartyHere" label="Party here" label-role="caption" size="sm" :disabled="isPartyHere || noThread || busy" @update:model-value="markMoveFor('party_here', $event)" />
        <AppCheckbox :key="`failed${untick}`" :model-value="isFailed" label="Failed" label-role="caption" size="sm" :disabled="isFailed || noThread || busy" @update:model-value="markMoveFor('failed', $event)" />
      </div>
    </div>
    <Teleport to="body">
      <div
        v-if="asking"
        :ref="(el) => (floatingRef = el as HTMLElement | null)"
        data-slip
        role="dialog"
        :aria-label="`Which way did the party come to ${beat.title || 'this beat'}?`"
        class="z-300 flex w-72 flex-col gap-2 rounded-md border border-border bg-popover p-3 text-foreground shadow-lg"
        :style="floatingStyle"
      >
        <p class="text-caption font-semibold">Which way did the party come?</p>
        <QuestWayPicker v-model="pickedWay" :ways="wayLines" label="The way the party came" />
        <AppButton :label="asking === 'failed' ? 'Mark failed' : 'Mark party here'" size="sm" :disabled="pickedWay === null" @click="confirmWay" />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import QuestWayPicker from "./QuestWayPicker.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { beatMarkWays, describeWay, type ThreadStanding } from "@/lib/quests/moves";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import { useMarkQuestMove } from "@/composables/quests/useQuestFlow";
import { useUpdateQuest } from "@/composables/quests/useQuests";
import { useToast } from "@/composables/useToast";
import type { QuestBeatPresentation } from "@/lib/quests/presentation";
import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";

const { beat, beats, edges, standing, presentation, entryBeatId = null, threadId = null, sessionId = null } = defineProps<{
  beat: QuestBeat;
  /** Every beat and route of the quest: the ways the party could have come here (#1194). */
  beats: QuestBeat[];
  edges: QuestBeatEdge[];
  /** Where the focus thread stands. Null with no thread. */
  standing: ThreadStanding | null;
  presentation?: QuestBeatPresentation;
  /** The quest's entry beat. */
  entryBeatId?: string | null;
  /** The focus thread: where Party here and Failed are marked. Null disables both. */
  threadId?: string | null;
  /** Null lets the server stamp the open session. */
  sessionId?: string | null;
}>();

const toast = useToast();
const updateQuest = useUpdateQuest();
const markMoveMutation = useMarkQuestMove();

const isEntry = computed(() => entryBeatId === beat.id);
const isPartyHere = computed(() => threadId !== null && (presentation?.currentThreadIds.includes(threadId) ?? false));
const isFailed = computed(() => presentation?.isFailed === true);
const noThread = computed(() => threadId === null);
const busy = computed(() => updateQuest.isPending.value || markMoveMutation.isPending.value);

async function run(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (e) {
    toast.error(toast.fromError(e));
  }
}

function markEntry(checked: boolean) {
  if (!checked || isEntry.value) return;
  void run(() => updateQuest.mutateAsync({ id: beat.quest_id, update: { entry_beat_id: beat.id } }));
}

const marksEl = ref<Element | null>(null);
const asking = ref<"party_here" | "failed" | null>(null);
const pickedWay = ref<number | null>(null);
// A tick that only opened the question is not a mark: closing the popover
// remounts the boxes so the one the DM ticked does not stay ticked on a beat nothing was marked on.
const untick = ref(0);
function closeAsking() {
  asking.value = null;
  untick.value += 1;
}
const { floatingRef, floatingStyle } = useAnchoredPopover(marksEl, computed(() => asking.value !== null), closeAsking);

const ahead = computed(() => (standing ? beatMarkWays({ beatId: beat.id, edges, standing }) : { kind: "direct" as const }));
const titleOf = (beatId: string) => beats.find((candidate) => candidate.id === beatId)?.title || "Untitled beat";
const wayLines = computed(() => (ahead.value.kind === "ahead" && standing
  ? ahead.value.ways.map((way) => describeWay(way, standing, beat.id, titleOf))
  : []));

function send(kind: "party_here" | "failed", via: string[] | undefined) {
  if (threadId === null) return;
  void run(() => markMoveMutation.mutateAsync({ kind, campaignId: beat.campaign_id, questId: beat.quest_id, threadId, beatId: beat.id, sessionId, via }));
}

// One way leads here: it is marked as that way. Several: the DM names it first,
// because the quest log players read is told in the order the way fills in.
function markMoveFor(kind: "party_here" | "failed", checked: boolean) {
  if (!checked || threadId === null) return;
  if (ahead.value.kind === "direct") return send(kind, undefined);
  if (ahead.value.ways.length === 1) return send(kind, ahead.value.ways[0]);
  pickedWay.value = null;
  asking.value = kind;
}

function confirmWay() {
  const kind = asking.value;
  if (kind === null || pickedWay.value === null || ahead.value.kind !== "ahead") return;
  const via = ahead.value.ways[pickedWay.value];
  closeAsking();
  send(kind, via);
}
</script>
