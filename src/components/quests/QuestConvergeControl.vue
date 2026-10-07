<template>
  <div v-if="matters" class="mt-3 space-y-1.5 border-t border-border pt-2">
    <p class="text-label font-semibold text-muted-foreground">When threads arrive</p>
    <SegmentedControl
      :model-value="beat.converge_mode"
      :options="CONVERGE_OPTIONS"
      size="sm"
      block
      aria-label="When threads arrive"
      @update:model-value="setMode"
    />
    <p class="text-caption text-muted-foreground">{{ CONVERGE_EXPLANATIONS[beat.converge_mode] }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * The converge choice on the selected beat (#1011): does each arriving thread
 * run on (`any`), or wait for the others that could still get here (`all`)?
 * Shown only where it means something (`convergeMatters`).
 */
import { computed } from "vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import { useQuestBeatEdges, useUpdateQuestBeat } from "@/composables/quests/useQuestFlow";
import { useToast } from "@/composables/useToast";
import { CONVERGE_EXPLANATIONS, CONVERGE_OPTIONS, convergeMatters } from "@/lib/quests/converge";
import type { QuestBeat, QuestConvergeMode } from "@/types/quest.types";

const { beat } = defineProps<{ beat: QuestBeat }>();
const { data: edges } = useQuestBeatEdges(computed(() => beat.quest_id));
const { mutateAsync: updateBeat } = useUpdateQuestBeat();
const toast = useToast();

const matters = computed(() => convergeMatters(beat.id, edges.value ?? []));

async function setMode(mode: QuestConvergeMode | undefined) {
  if (!mode || mode === beat.converge_mode) return;
  try {
    await updateBeat({ id: beat.id, questId: beat.quest_id, update: { converge_mode: mode } });
  } catch (e: unknown) {
    toast.error(toast.fromError(e));
  }
}
</script>
