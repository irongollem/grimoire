<template>
  <!-- The wide part of the quest drawer (#1194, frame 11): what the column has
       no room for, in two columns. The column itself stays where it is. -->
  <div class="grid gap-0 lg:grid-cols-2" aria-label="Quest, in full">
    <div class="flex min-w-0 flex-col gap-5 px-6 py-5">
      <QuestDetailsSection :quest="quest" />
      <QuestPlayersSection :quest="quest" />
      <DmNoteBox type="quest" :id="quest.id" :label="quest.title" />
      <QuestSidebarPanels :is-new="false" :quest-id="quest.id" :sub-quests="subQuests" :shared-notes="sharedNotes" />
      <AccordionSection v-model:open="calendarOpen" title="Calendar">
        <EntityCalendarSection entity-type="quest" :entity-id="quest.id" :entity-name="quest.title || 'Untitled Quest'" />
      </AccordionSection>
    </div>
    <div class="flex min-w-0 flex-col gap-5 px-6 py-5 lg:border-l lg:border-border">
      <QuestClocksPanel v-if="quest.campaign_id" :quest-id="quest.id" :campaign-id="quest.campaign_id" />
      <QuestRulesPanel :quest-id="quest.id" :campaign-id="quest.campaign_id" />
      <QuestThreadsPanel
        v-if="threads.length && quest.campaign_id"
        :quest-id="quest.id"
        :campaign-id="quest.campaign_id"
        :threads="threads"
        :beats="beats"
        :edges="edges"
        :current-beat-id-by-thread="currentBeatIdByThread"
        :visited-count-by-thread="visitedCountByThread"
        @focus="emit('focus-thread', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AccordionSection from "@/components/common/AccordionSection.vue";
import EntityCalendarSection from "@/components/calendar/EntityCalendarSection.vue";
import DmNoteBox from "@/components/notes/DmNoteBox.vue";
import { useEntityNotes } from "@/composables/notes/useEntityNotes";
import { useQuests } from "@/composables/quests/useQuests";
import { useQuestBeatEdges, useQuestBeats } from "@/composables/quests/useQuestFlow";
import { useQuestThreads } from "@/composables/quests/useQuestThreads";
import type { Quest } from "@/types/quest.types";
import QuestSidebarPanels from "../flow/QuestSidebarPanels.vue";
import QuestThreadsPanel from "../flow/QuestThreadsPanel.vue";
import QuestClocksPanel from "../inspector/QuestClocksPanel.vue";
import QuestRulesPanel from "../inspector/QuestRulesPanel.vue";
import QuestDetailsSection from "../panel/QuestDetailsSection.vue";
import QuestPlayersSection from "../panel/QuestPlayersSection.vue";

// The cursors come from the flow's runtime read, which the page already holds.
const { quest, currentBeatIdByThread = {}, visitedCountByThread = {} } = defineProps<{
  quest: Quest;
  currentBeatIdByThread?: Record<string, string | null>;
  visitedCountByThread?: Record<string, number>;
}>();
const emit = defineEmits<{ "focus-thread": [threadId: string] }>();

const questId = computed(() => quest.id);
const { data: beatRows } = useQuestBeats(questId);
const { data: edgeRows } = useQuestBeatEdges(questId);
const { data: threadRows } = useQuestThreads(questId);
const beats = computed(() => beatRows.value ?? []);
const edges = computed(() => edgeRows.value ?? []);
const threads = computed(() => threadRows.value ?? []);
// Sub-quests come from the campaign quest list the screen already holds, not a
// read of their own.
const { data: allQuests } = useQuests();
const subQuests = computed(() => (allQuests.value ?? []).filter((candidate) => candidate.parent_quest_id === quest.id));
const { data: notes } = useEntityNotes("quest", questId);
const sharedNotes = computed(() => (notes.value ?? []).filter((note) => !note.is_private));
const calendarOpen = ref(false);
</script>
