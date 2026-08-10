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
    <QuestOverviewDrawer v-if="quest && isOverview" :quest="quest" @close="closeOverview" />
  </PageHeader>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQuest } from "@/composables/useQuests";
import { useUiStore } from "@/stores/ui";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import QuestFlowStarter from "@/components/quests/QuestFlowStarter.vue";
import QuestGraphDesigner from "@/components/quests/QuestGraphDesigner.vue";
import QuestRunCockpit from "@/components/quests/QuestRunCockpit.vue";
import QuestOverviewDrawer from "@/components/quests/QuestOverviewDrawer.vue";
import { QUEST_STATUS_LABELS } from "@/types/quest.types";

const route     = useRoute();
const router    = useRouter();
const ui        = useUiStore();
const isNew     = computed(() => route.name === "quest-new");
const isOverview = computed(() => route.query.overview === "true" || route.query.mode === "details");
const isRunning = computed(() => !isNew.value && ui.dmMode === "play");
const isBuilding = computed(() => !isNew.value && ui.dmMode === "prep");
const id        = computed(() => (isNew.value ? "" : (route.params.id as string)));
const parentId  = computed(() => (route.query.parent as string | undefined));

const { data: quest, isLoading: questLoading } = useQuest(id);
const isLoading = computed(() => !isNew.value && questLoading.value);

// Build/Run used to be encoded in the URL. Honour old bookmarks once, then
// leave the persisted global Prep/Play toggle as the only mode source.
watch(
  () => [route.query.mode, route.query.edit] as const,
  ([mode, edit]) => {
    if (edit === "true") {
      const { edit: _edit, mode: _mode, ...query } = route.query;
      void router.replace({ query: { ...query, overview: "true" } });
      return;
    }
    if (mode === "details") {
      const { mode: _mode, ...query } = route.query;
      void router.replace({ query: { ...query, overview: "true" } });
      return;
    }
    if (mode !== "build" && mode !== "run") return;
    ui.dmMode = mode === "run" ? "play" : "prep";
    const { mode: _mode, ...query } = route.query;
    void router.replace({ query });
  },
  { immediate: true },
);

function closeOverview() {
  const { overview: _overview, mode: _mode, ...query } = route.query;
  void router.replace({ query });
}
</script>
