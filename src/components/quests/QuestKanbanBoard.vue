<template>
  <div
    class="grid snap-x snap-mandatory grid-flow-col auto-cols-[minmax(17.5rem,1fr)] gap-0 overflow-x-auto rounded-lg border border-border bg-muted/20"
    aria-label="Quest board"
  >
    <section
      v-for="column in columns"
      :key="column.status"
      class="flex min-h-72 snap-start flex-col border-r border-border last:border-r-0"
      :aria-labelledby="`quest-lane-${column.status}`"
      @dragover.prevent="dragOverStatus = column.status"
      @dragleave="onColumnDragLeave(column.status, $event)"
      @drop.prevent="dropOn(column.status)"
    >
      <header class="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card px-3 py-3">
        <span class="h-2 w-2 shrink-0 rounded-sm" :style="{ backgroundColor: column.color }" aria-hidden="true" />
        <h2
          :id="`quest-lane-${column.status}`"
          class="font-cinzel text-label-lg font-bold uppercase tracking-widest text-foreground"
        >
          {{ column.label }}
        </h2>
        <span
          class="ml-auto rounded-full bg-muted px-2 py-0.5 text-label font-semibold text-muted-foreground"
          :aria-label="`${column.quests.length} quests in ${column.label}`"
        >
          {{ column.quests.length }} {{ column.quests.length === 1 ? "quest" : "quests" }}
        </span>
      </header>

      <div
        class="flex min-h-40 flex-1 flex-col gap-3 p-3 transition-colors"
        :class="dragOverStatus === column.status && draggedQuestId ? 'bg-primary/5 ring-1 ring-inset ring-primary/30' : ''"
      >
        <QuestBoardCard
          v-for="quest in column.quests"
          :key="quest.id"
          :quest="quest"
          :party="party"
          :summary="summaries?.[quest.id]"
          :dragging="draggedQuestId === quest.id"
          @dragstart="startDrag"
          @dragend="endDrag"
          @move="moveQuest(quest.id, $event)"
        />

        <div v-if="!column.quests.length" class="flex flex-1 items-center justify-center px-4 py-8 text-center">
          <p v-if="column.unfilteredCount" class="font-fell text-sm italic text-muted-foreground">{{ column.unfilteredCount }} {{ column.label.toLowerCase() }} quest{{ column.unfilteredCount === 1 ? '' : 's' }} filtered out.</p>
          <p v-else class="font-fell text-sm italic text-muted-foreground">No {{ column.label.toLowerCase() }} quests.</p>
        </div>

        <AppButton
          v-if="column.status !== 'completed' && column.status !== 'failed'"
          to="/quests/new"
          :icon="IconAdd"
          :label="`New ${column.label.toLowerCase()} quest`"
          variant="subtle"
          size="sm"
          class="mt-auto border-dashed bg-card/60"
          block
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IconAdd } from "@/lib/icons";
import type { QuestBoardSummary } from "@/lib/quests/board";
import type { PartyMember } from "@/types/party.types";
import {
  QUEST_STATUSES,
  QUEST_STATUS_COLORS,
  QUEST_STATUS_LABELS,
  type Quest,
  type QuestStatus,
} from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import QuestBoardCard from "./QuestBoardCard.vue";

const props = withDefaults(defineProps<{
  quests: Quest[];
  allQuests?: Quest[];
  party?: PartyMember[];
  summaries?: Record<string, QuestBoardSummary>;
}>(), {
  party: () => [],
  allQuests: undefined,
  summaries: undefined,
});

const emit = defineEmits<{
  move: [payload: { id: string; status: QuestStatus }];
}>();

const draggedQuestId = ref<string | null>(null);
const dragOverStatus = ref<QuestStatus | null>(null);

const columns = computed(() => QUEST_STATUSES.map((status) => ({
  status,
  label: QUEST_STATUS_LABELS[status],
  color: QUEST_STATUS_COLORS[status],
  quests: props.quests.filter((quest) => quest.status === status),
  unfilteredCount: (props.allQuests ?? props.quests).filter((quest) => quest.status === status).length,
})));

function startDrag(id: string) {
  draggedQuestId.value = id;
}

function endDrag() {
  draggedQuestId.value = null;
  dragOverStatus.value = null;
}

function onColumnDragLeave(status: QuestStatus, event: DragEvent) {
  const related = event.relatedTarget as HTMLElement | null;
  if (!(event.currentTarget as HTMLElement | null)?.contains(related) && dragOverStatus.value === status) {
    dragOverStatus.value = null;
  }
}

function dropOn(status: QuestStatus) {
  const id = draggedQuestId.value;
  endDrag();
  if (id) moveQuest(id, status);
}

function moveQuest(id: string, status: QuestStatus) {
  const quest = props.quests.find((candidate) => candidate.id === id);
  if (!quest || quest.status === status) return;
  emit("move", { id, status });
}
</script>
