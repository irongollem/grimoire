<template>
  <PageHeader
    :title="quest?.title || (isNew ? 'New Quest' : 'Loading…')"
    :description="quest ? QUEST_STATUS_LABELS[quest.status] : undefined"
    :contained="isBuilding"
  >
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <QuestFlowStarter
      v-else-if="isNew"
      :parent-id="parentId ?? null"
    />
    <QuestRunCockpit
      v-else-if="quest && isRunning"
      :key="`run-${quest.id}`"
      :anchor-quest-id="quest.id"
      :visible-to="quest.player_visible_to ?? []"
    />
    <QuestGraphDesigner
      v-else-if="quest && isBuilding"
      :key="`build-${quest.id}`"
      :quest-id="quest.id"
      :visible-to="quest.player_visible_to ?? []"
      :focus-current-on-open="route.query.focus === 'current'"
    />
    <QuestEditor
      v-else-if="isEditing"
      :key="id"
      :quest="quest ?? null"
      :parent-id="parentId ?? null"
    />
    <QuestSheet
      v-else-if="quest"
      :key="quest.id"
      :quest="quest"
    />
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useQuest } from "@/composables/useQuests";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import QuestEditor from "@/components/quests/QuestEditor.vue";
import QuestFlowStarter from "@/components/quests/QuestFlowStarter.vue";
import QuestGraphDesigner from "@/components/quests/QuestGraphDesigner.vue";
import QuestRunCockpit from "@/components/quests/QuestRunCockpit.vue";
import QuestSheet from "@/components/quests/QuestSheet.vue";
import { QUEST_STATUS_LABELS } from "@/types/quest.types";

const route     = useRoute();
const isNew     = computed(() => route.name === "quest-new");
const isEditing = computed(() => route.query.edit === "true");
const isRunning = computed(() => route.query.mode === "run");
const isDetails = computed(() => route.query.mode === "details");
const isBuilding = computed(() => !isNew.value && !isEditing.value && !isRunning.value && !isDetails.value);
const id        = computed(() => (isNew.value ? "" : (route.params.id as string)));
const parentId  = computed(() => (route.query.parent as string | undefined));

const { data: quest, isLoading: questLoading } = useQuest(id);
const isLoading = computed(() => !isNew.value && questLoading.value);
</script>
