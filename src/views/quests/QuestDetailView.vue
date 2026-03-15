<template>
  <div>
    <PageHeader
      :title="quest?.title || (isNew ? 'New Quest' : 'Loading…')"
      :description="quest ? QUEST_STATUS_LABELS[quest.status] : undefined"
    />

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <QuestEditor
      v-else
      :key="id || 'new'"
      :quest="isNew ? null : (quest ?? null)"
      :parent-id="parentId ?? null"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useQuest } from "@/composables/useQuests";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import QuestEditor from "@/components/quests/QuestEditor.vue";
import { QUEST_STATUS_LABELS } from "@/types/quest.types";

const route    = useRoute();
const isNew    = computed(() => route.name === "quest-new");
const id       = computed(() => (isNew.value ? "" : (route.params.id as string)));
const parentId = computed(() => (route.query.parent as string | undefined));

const { data: quest, isLoading: questLoading } = useQuest(id);
const isLoading = computed(() => !isNew.value && questLoading.value);
</script>
