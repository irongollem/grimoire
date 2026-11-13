<template>
  <div class="flex flex-wrap items-center gap-2">
    <AppButton
      :icon="IconUndo"
      label="Undo"
      size="sm"
      variant="subtle"
      class="whitespace-nowrap"
      :disabled="!undoTarget"
      :loading="undoMove.isPending.value"
      :tooltip="undoTarget ? `Undo: ${undoTitle}` : 'Nothing to undo'"
      @click="undo"
    />
    <label class="flex items-center gap-1.5 text-caption text-muted-foreground">
      <span class="whitespace-nowrap">Marks go to:</span>
      <AppSelect
        :model-value="markSession.sessionId.value"
        size="sm"
        aria-label="Session marks go to"
        :disabled="markSession.options.value.length === 0"
        @update:model-value="(next) => next && markSession.choose(next)"
      >
        <option v-if="markSession.options.value.length === 0" :value="null">No sessions yet</option>
        <option v-for="option in markSession.options.value" :key="option.id" :value="option.id">{{ option.label }}</option>
      </AppSelect>
    </label>
    <SegmentedControl :model-value="ui.questFlowLens" size="sm" :options="lensOptions" aria-label="View" @update:model-value="ui.questFlowLens = $event" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconUndo } from "@/lib/icons";
import { useUndoQuestMove } from "@/composables/quests/useQuestFlow";
import { useQuestMarkSession } from "@/composables/quests/useQuestMarkSession";
import { useHotkeys } from "@/composables/useHotkeys";
import { useToast } from "@/composables/useToast";
import { newestUndoableMove } from "@/lib/quests/moves";
import { useCampaignStore } from "@/stores/campaign";
import { useQuestsUiStore } from "@/stores/ui/quests";
import type { QuestBeat, QuestBeatTransition } from "@/types/quest.types";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";

const { questId, transitions, beats } = defineProps<{ questId: string; transitions: QuestBeatTransition[]; beats: QuestBeat[] }>();

const ui = useQuestsUiStore();
const campaign = useCampaignStore();
const toast = useToast();
const undoMove = useUndoQuestMove();
const markSession = useQuestMarkSession();

const lensOptions: SegmentedOption<"dm" | "players">[] = [
  { value: "dm", label: "Your view" },
  { value: "players", label: "Players' view" },
];

const undoTarget = computed(() => newestUndoableMove(transitions));
const undoTitle = computed(() => {
  const target = undoTarget.value;
  if (!target) return "";
  return target.to_beat_title || beats.find((beat) => beat.id === target.to_beat_id)?.title || "Untitled beat";
});

// No thread: the quest's newest move, wherever it was made.
async function undo() {
  if (!undoTarget.value || !campaign.activeCampaignId || undoMove.isPending.value) return;
  try {
    await undoMove.mutateAsync({ campaignId: campaign.activeCampaignId, questId });
  } catch (caught) {
    toast.error(toast.fromError(caught));
  }
}

// Inside a field the registry leaves the combo alone, so Cmd/Ctrl+Z stays the field's own undo.
useHotkeys(() => [{ combo: "mod+z", description: "Undo the last quest move", handler: () => void undo() }], { enabled: () => Boolean(undoTarget.value) });
</script>
