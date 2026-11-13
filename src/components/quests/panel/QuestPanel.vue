<template>
  <!-- The drawer with nothing selected (epic #1183): everything about the quest
       as a whole, in the order the DM reaches for it. -->
  <div class="flex min-w-0 flex-col gap-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto" aria-label="Quest panel">
    <!-- Players' view puts what the party sees first. -->
    <template v-if="playersFirst">
      <QuestPlayersView :quest="quest" />
      <!-- The third of the three controls: each objective's visibility toggle lives on its row. -->
      <QuestObjectivesSection :quest-id="quest.id" />
    </template>
    <QuestDetailsSection :quest="quest" />
    <QuestPlayersSection v-if="!playersFirst" :quest="quest" />
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
    <QuestObjectivesSection v-if="!playersFirst" :quest-id="quest.id" />
    <QuestClocksPanel v-if="quest.campaign_id" :quest-id="quest.id" :campaign-id="quest.campaign_id" />
    <QuestRulesPanel :quest-id="quest.id" :campaign-id="quest.campaign_id" />
    <DmNoteBox type="quest" :id="quest.id" :label="quest.title" />
    <QuestSidebarPanels :is-new="false" :quest-id="quest.id" :sub-quests="subQuests" :shared-notes="sharedNotes" />
    <AccordionSection v-model:open="calendarOpen" title="Calendar">
      <EntityCalendarSection entity-type="quest" :entity-id="quest.id" :entity-name="quest.title || 'Untitled Quest'" />
    </AccordionSection>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AccordionSection from "@/components/common/AccordionSection.vue";
import EntityCalendarSection from "@/components/calendar/EntityCalendarSection.vue";
import DmNoteBox from "@/components/notes/DmNoteBox.vue";
import { useEntityNotes } from "@/composables/notes/useEntityNotes";
import { useQuestBeatEdges, useQuestBeats } from "@/composables/quests/useQuestFlow";
import { useQuestThreads } from "@/composables/quests/useQuestThreads";
import { useQuests } from "@/composables/quests/useQuests";
import type { Quest } from "@/types/quest.types";
import QuestClocksPanel from "../inspector/QuestClocksPanel.vue";
import QuestRulesPanel from "../inspector/QuestRulesPanel.vue";
import QuestSidebarPanels from "../flow/QuestSidebarPanels.vue";
import QuestThreadsPanel from "../flow/QuestThreadsPanel.vue";
import QuestDetailsSection from "./QuestDetailsSection.vue";
import QuestObjectivesSection from "./QuestObjectivesSection.vue";
import QuestPlayersSection from "./QuestPlayersSection.vue";
import QuestPlayersView from "./QuestPlayersView.vue";

// The cursors come from the flow's runtime read, which the designer already
// holds, so they are handed down rather than fetched a second time.
const { quest, currentBeatIdByThread = {}, visitedCountByThread = {}, playersFirst = false } = defineProps<{
  quest: Quest;
  currentBeatIdByThread?: Record<string, string | null>;
  visitedCountByThread?: Record<string, number>;
  playersFirst?: boolean;
}>();
const emit = defineEmits<{ "focus-thread": [threadId: string] }>();

const questId = computed(() => quest.id);
const { data: beatRows } = useQuestBeats(questId);
const { data: edgeRows } = useQuestBeatEdges(questId);
const { data: threadRows } = useQuestThreads(questId);
const beats = computed(() => beatRows.value ?? []);
const edges = computed(() => edgeRows.value ?? []);
const threads = computed(() => threadRows.value ?? []);
// Sub-quests come from the campaign quest list this screen already holds, not
// a read of their own; the list is newest-edited first, which is the order the
// sidebar shows.
const { data: allQuests } = useQuests();
const subQuests = computed(() => (allQuests.value ?? []).filter((candidate) => candidate.parent_quest_id === quest.id));
const { data: notes } = useEntityNotes("quest", questId);
const sharedNotes = computed(() => (notes.value ?? []).filter((note) => !note.is_private));
const calendarOpen = ref(false);
</script>
