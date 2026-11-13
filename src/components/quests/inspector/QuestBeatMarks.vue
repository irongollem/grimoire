<template>
  <div class="mt-2 space-y-2">
    <SegmentedControl :model-value="beat.visibility" size="sm" :options="visibilityOptions" aria-label="Visibility" @update:model-value="setVisibility" />
    <div class="flex flex-wrap gap-x-4 gap-y-1" role="group" aria-label="Marks">
      <AppCheckbox :model-value="isEntry" label="Entry" label-role="caption" size="sm" :disabled="isEntry || busy" @update:model-value="markEntry" />
      <AppCheckbox :model-value="isPartyHere" label="Party here" label-role="caption" size="sm" :disabled="isPartyHere || noThread || busy" @update:model-value="markMoveFor('party_here', $event)" />
      <AppCheckbox :model-value="isFailed" label="Failed" label-role="caption" size="sm" :disabled="isFailed || noThread || busy" @update:model-value="markMoveFor('failed', $event)" />
    </div>
    <div v-if="onArrival.length" class="text-caption">
      <p class="font-semibold text-foreground">On arrival</p>
      <ul class="text-muted-foreground"><li v-for="(line, index) in onArrival" :key="index">{{ line }}</li></ul>
    </div>
    <div v-if="ifItGoesWrong.length" class="text-caption">
      <p class="font-semibold text-foreground">If it goes wrong</p>
      <ul class="text-muted-foreground"><li v-for="(line, index) in ifItGoesWrong" :key="index">{{ line }}</li></ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import { useMarkQuestMove, useQuestConsequences, useUpdateQuestBeat } from "@/composables/quests/useQuestFlow";
import { useQuestObjectives, useUpdateQuest } from "@/composables/quests/useQuests";
import { useToast } from "@/composables/useToast";
import { describeQuestConsequenceAction } from "@/lib/quests/consequences";
import type { QuestBeatPresentation } from "@/lib/quests/presentation";
import type { QuestBeat, QuestBeatVisibility } from "@/types/quest.types";

const { beat, presentation, entryBeatId = null, threadId = null, sessionId = null } = defineProps<{
  beat: QuestBeat;
  presentation?: QuestBeatPresentation;
  /** The quest's entry beat. */
  entryBeatId?: string | null;
  /** The focus thread: where Party here and Failed are marked. Null disables both. */
  threadId?: string | null;
  /** Null lets the server stamp the open session. */
  sessionId?: string | null;
}>();

const toast = useToast();
const updateBeat = useUpdateQuestBeat();
const updateQuest = useUpdateQuest();
const markMoveMutation = useMarkQuestMove();
const { data: consequences } = useQuestConsequences(computed(() => beat.quest_id));
const { data: objectives } = useQuestObjectives(computed(() => beat.quest_id));

const visibilityOptions: SegmentedOption<QuestBeatVisibility>[] = [
  { value: "hidden", label: "Hidden" },
  { value: "rumored", label: "Rumored" },
  { value: "revealed", label: "Revealed" },
];

const isEntry = computed(() => entryBeatId === beat.id);
const isPartyHere = computed(() => threadId !== null && (presentation?.currentThreadIds.includes(threadId) ?? false));
const isFailed = computed(() => presentation?.isFailed === true);
const noThread = computed(() => threadId === null);
const busy = computed(() => updateQuest.isPending.value || markMoveMutation.isPending.value);

function objectiveLabel(id: string | null): string {
  if (!id) return "";
  return objectives.value?.find((objective) => objective.id === id)?.description ?? "Objective removed";
}
function linesFor(outcome: "arrived" | "failed"): string[] {
  return (consequences.value ?? [])
    .filter((rule) => rule.on_beat_id === beat.id && rule.on_beat_outcome === outcome)
    .map((rule) => describeQuestConsequenceAction(rule, objectiveLabel));
}
const onArrival = computed(() => linesFor("arrived"));
const ifItGoesWrong = computed(() => linesFor("failed"));

async function run(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (e) {
    toast.error(toast.fromError(e));
  }
}

function setVisibility(visibility: QuestBeatVisibility) {
  if (visibility === beat.visibility) return;
  void run(() => updateBeat.mutateAsync({ id: beat.id, questId: beat.quest_id, update: { visibility } }));
}

function markEntry(checked: boolean) {
  if (!checked || isEntry.value) return;
  void run(() => updateQuest.mutateAsync({ id: beat.quest_id, update: { entry_beat_id: beat.id } }));
}

function markMoveFor(kind: "party_here" | "failed", checked: boolean) {
  if (!checked || threadId === null) return;
  void run(() => markMoveMutation.mutateAsync({ kind, campaignId: beat.campaign_id, questId: beat.quest_id, threadId, beatId: beat.id, sessionId }));
}
</script>
