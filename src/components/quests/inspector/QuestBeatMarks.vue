<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
      <div class="flex flex-wrap gap-x-4 gap-y-1" role="group" aria-label="Marks">
        <AppCheckbox :model-value="isEntry" label="Entry" label-role="caption" size="sm" :disabled="isEntry || busy" @update:model-value="markEntry" />
        <AppCheckbox :model-value="isPartyHere" label="Party here" label-role="caption" size="sm" :disabled="isPartyHere || noThread || busy" @update:model-value="markMoveFor('party_here', $event)" />
        <AppCheckbox :model-value="isFailed" label="Failed" label-role="caption" size="sm" :disabled="isFailed || noThread || busy" @update:model-value="markMoveFor('failed', $event)" />
      </div>
      <QuestVisibilityTrack class="ml-auto" size="sm" :floor="floor" :model-value="beat.visibility" @update:model-value="setVisibility" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import QuestVisibilityTrack from "../common/QuestVisibilityTrack.vue";
import { useMarkQuestMove } from "@/composables/quests/useQuestFlow";
import { useUpdateQuest } from "@/composables/quests/useQuests";
import { useSetBeatVisibility } from "@/composables/quests/useSetBeatVisibility";
import { useToast } from "@/composables/useToast";
import type { QuestBeatPresentation } from "@/lib/quests/presentation";
import type { QuestBeat, QuestBeatVisibility } from "@/types/quest.types";

const { beat, presentation, entryBeatId = null, threadId = null, sessionId = null, floor = "hidden" } = defineProps<{
  beat: QuestBeat;
  presentation?: QuestBeatPresentation;
  /** The quest's entry beat. */
  entryBeatId?: string | null;
  /** The focus thread: where Party here and Failed are marked. Null disables both. */
  threadId?: string | null;
  /** Null lets the server stamp the open session. */
  sessionId?: string | null;
  /** The lowest the DM may set what players know (`visibilityFloor()`). */
  floor?: QuestBeatVisibility;
}>();

const toast = useToast();
const updateQuest = useUpdateQuest();
const setBeatVisibility = useSetBeatVisibility();
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

function setVisibility(visibility: QuestBeatVisibility) {
  if (visibility === beat.visibility) return;
  // A move sets visibility server-side; only a hand-set step comes through here.
  void run(() => setBeatVisibility(beat, visibility));
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
