<template>
  <!--
    One screen (epic #1183): the story flow with a drawer. There are no tabs;
    the URL carries the selection (`questLink`), and the drawer's states are
    the quest, a beat, a route, or a beat opened over the flow. The title, the
    lane and More are all the header keeps.
  -->
  <PageHeader
    :title="quest?.title || (isNew ? 'New Quest' : 'Loading…')"
    :description="quest ? QUEST_STATUS_LABELS[quest.status] : undefined"
    :contained="!isNew && !!quest"
    :owns-phone-bar="!isNew && !!quest"
  >
    <template v-if="!isNew && quest" #actions>
      <QuestMoreMenu :quest="quest" />
    </template>
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <QuestFlowStarter
      v-else-if="isNew"
      :parent-id="parentId ?? null"
    />

    <template v-else-if="quest">
      <QuestPhoneTopBar :title="quest.title" :subtitle="phoneSubtitle" />
      <QuestGraphDesigner
        :key="`build-${quest.id}`"
        :quest-id="quest.id"
        :entry-beat-id="quest.entry_beat_id"
        :focus-current-on-open="route.query.focus === 'current'"
      />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useQuest } from "@/composables/quests/useQuests";
import { useQuestBeats } from "@/composables/quests/useQuestFlow";
import PageHeader from "@/components/common/list/PageHeader.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import QuestFlowStarter from "@/components/quests/flow/QuestFlowStarter.vue";
import QuestGraphDesigner from "@/components/quests/flow/QuestGraphDesigner.vue";
import QuestMoreMenu from "@/components/quests/panel/QuestMoreMenu.vue";
import QuestPhoneTopBar from "@/components/quests/overview/QuestPhoneTopBar.vue";
import { QUEST_STATUS_LABELS } from "@/types/quest.types";

const route    = useRoute();
const isNew    = computed(() => route.name === "quest-new");
const id       = computed(() => (isNew.value ? "" : (route.params.id as string)));
const parentId = computed(() => (route.query.parent as string | undefined));

const { data: quest, isLoading: questLoading } = useQuest(id);
const { data: beats } = useQuestBeats(id);
const isLoading = computed(() => !isNew.value && questLoading.value);

// The phone top bar's second line: the lane, and the beat's title while one is
// opened, so the bar says where the DM is without the drawer in view.
const phoneSubtitle = computed(() => {
  if (!quest.value) return undefined;
  const lane = QUEST_STATUS_LABELS[quest.value.status];
  if (route.query.open !== "1") return lane;
  const title = beats.value?.find((beat) => beat.id === route.query.beat)?.title;
  return title ? `${lane} · ${title}` : lane;
});
</script>
