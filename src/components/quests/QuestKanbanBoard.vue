<template>
  <div class="flex flex-col gap-4">
    <!-- The quest (or quests) the table is actually in right now, full width
         above the groups (frame `07 Log`) — a quest with more than one live
         thread needs its own spine per cursor, which a lane card has no room
         for. -->
    <QuestFeaturedCard
      v-for="entry in liveQuests"
      :key="entry.quest.id"
      :quest="entry.quest"
      :summary="entry.summary"
    />

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Quest board">
      <section
        v-for="group in groups"
        :key="group.key"
        class="flex min-h-72 flex-col gap-2"
        :aria-labelledby="`quest-group-${group.key}`"
        @dragover.prevent="dragOverGroup = group.key"
        @dragleave="onGroupDragLeave(group.key, $event)"
        @drop.prevent="dropOn(group.key)"
      >
        <header class="flex items-center gap-2">
          <component :is="group.icon" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h2
            :id="`quest-group-${group.key}`"
            class="font-cinzel text-label-lg font-bold uppercase tracking-widest text-foreground"
          >
            {{ group.heading }}
          </h2>
          <span
            class="ml-auto rounded-full bg-muted px-2 py-0.5 text-label font-semibold text-muted-foreground"
            :aria-label="`${group.quests.length} quests in ${group.shortLabel}`"
          >
            {{ group.quests.length }} {{ group.quests.length === 1 ? "quest" : "quests" }}
          </span>
        </header>

        <div
          class="flex min-h-40 flex-1 flex-col gap-2 rounded-lg border border-border bg-muted/20 p-2 transition-colors"
          :class="dragOverGroup === group.key && draggedQuestId ? 'bg-primary/5 ring-1 ring-inset ring-primary/30' : ''"
        >
          <QuestBoardCard
            v-for="quest in group.quests"
            :key="quest.id"
            :quest="quest"
            :party="party"
            :summary="summaries?.[quest.id]"
            :dragging="draggedQuestId === quest.id"
            @dragstart="startDrag"
            @dragend="endDrag"
            @move="moveQuest(quest.id, $event)"
          />

          <div v-if="!group.quests.length" class="flex flex-1 items-center justify-center px-4 py-8 text-center">
            <p v-if="group.unfilteredCount" class="font-fell text-sm italic text-muted-foreground">{{ group.unfilteredCount }} {{ group.shortLabel }} quest{{ group.unfilteredCount === 1 ? '' : 's' }} filtered out.</p>
            <p v-else class="font-fell text-sm italic text-muted-foreground">No {{ group.shortLabel }} quests.</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Frame `07 Log`: three groups replace the old five-lane kanban's
 * presentation. The lane *statuses* underneath are unchanged — `QUEST_STATUSES`
 * still has four rungs, and `QuestBoardCard`'s own prev/next arrows still walk
 * all of them one at a time — only how they are grouped and dropped onto
 * changes.
 *
 * Deleted here: the per-status "New … quest" quick-add button each of the
 * five lanes carried. It assumed one status per drop target, which a group
 * spanning two statuses (`completed`+`failed`) no longer gives it an honest
 * answer for, and the mockup does not carry one either — the page-level "New
 * quest" action already covers it.
 */
import { computed, ref, type Component } from "vue";
import { IconCheck, IconLock, IconQuest } from "@/lib/icons";
import type { QuestBoardSummary } from "@/lib/quests/board";
import type { PartyMember } from "@/types/party.types";
import {
  type Quest,
  type QuestStatus,
} from "@/types/quest.types";
import QuestBoardCard from "./QuestBoardCard.vue";
import QuestFeaturedCard from "./QuestFeaturedCard.vue";

const { quests, allQuests, party = [], summaries } = defineProps<{
  quests: Quest[];
  allQuests?: Quest[];
  party?: PartyMember[];
  summaries?: Record<string, QuestBoardSummary>;
}>();

const emit = defineEmits<{
  move: [payload: { id: string; status: QuestStatus }];
}>();

const draggedQuestId = ref<string | null>(null);
const dragOverGroup = ref<QuestGroupKey | null>(null);

type QuestGroupKey = "active" | "undiscovered" | "settled";

interface QuestGroupDefinition {
  key: QuestGroupKey;
  heading: string;
  shortLabel: string;
  icon: Component;
  statuses: readonly QuestStatus[];
  /** The status a drop onto this group's zone sets — never `failed`, which
   *  stays reachable only through the card's own ladder arrows. */
  primaryStatus: QuestStatus;
}

const GROUP_DEFINITIONS: readonly QuestGroupDefinition[] = [
  { key: "active", heading: "Active", shortLabel: "active", icon: IconQuest, statuses: ["active"], primaryStatus: "active" },
  { key: "undiscovered", heading: "Undiscovered — waiting to be unlocked", shortLabel: "undiscovered", icon: IconLock, statuses: ["undiscovered"], primaryStatus: "undiscovered" },
  { key: "settled", heading: "Settled", shortLabel: "settled", icon: IconCheck, statuses: ["completed", "failed"], primaryStatus: "completed" },
];

const groups = computed(() => GROUP_DEFINITIONS.map((definition) => {
  const inGroup = quests.filter((quest) => definition.statuses.includes(quest.status));
  return {
    ...definition,
    quests: inGroup,
    unfilteredCount: (allQuests ?? quests).filter((quest) => definition.statuses.includes(quest.status)).length,
  };
}));

const liveQuests = computed(() => quests
  .map((quest) => ({ quest, summary: summaries?.[quest.id] }))
  .filter((entry): entry is { quest: Quest; summary: QuestBoardSummary } => entry.summary?.isLive === true));

function startDrag(id: string) {
  draggedQuestId.value = id;
}

function endDrag() {
  draggedQuestId.value = null;
  dragOverGroup.value = null;
}

function onGroupDragLeave(key: QuestGroupKey, event: DragEvent) {
  const related = event.relatedTarget as HTMLElement | null;
  if (!(event.currentTarget as HTMLElement | null)?.contains(related) && dragOverGroup.value === key) {
    dragOverGroup.value = null;
  }
}

function dropOn(key: QuestGroupKey) {
  const id = draggedQuestId.value;
  endDrag();
  if (!id) return;
  const quest = quests.find((candidate) => candidate.id === id);
  const group = groups.value.find((candidate) => candidate.key === key);
  if (!quest || !group) return;
  // Dropping onto the group a card already belongs to (e.g. a `completed`
  // quest dropped back onto Settled) must not silently reassign it to the
  // group's primary status — that would move it to something the DM never
  // asked for.
  if (group.statuses.includes(quest.status)) return;
  moveQuest(id, group.primaryStatus);
}

function moveQuest(id: string, status: QuestStatus) {
  const quest = quests.find((candidate) => candidate.id === id);
  if (!quest || quest.status === status) return;
  emit("move", { id, status });
}
</script>
