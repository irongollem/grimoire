<template>
  <PageHeader
    :title="quest?.title || (isNew ? 'New Quest' : 'Loading…')"
    :description="quest ? QUEST_STATUS_LABELS[quest.status] : undefined"
    :contained="showsFlow"
  >
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <QuestFlowStarter
      v-else-if="isNew"
      :parent-id="parentId ?? null"
    />

    <template v-else-if="quest">
      <!-- Overview and the working surface are peers. The overview used to hide
           behind `?overview=true` with nothing pointing at it, which read as an
           aside rather than as the quest's front page. -->
      <SegmentedControl
        :model-value="view"
        :options="viewOptions"
        size="sm"
        class="mb-3"
        @update:model-value="(value) => selectView(value as QuestDetailSurface)"
      />

      <QuestOverviewPanel v-if="view === 'overview'" :quest="quest" />
      <QuestRunCockpit
        v-else-if="isRunning"
        :key="`run-${quest.id}`"
        :anchor-quest-id="quest.id"
        :visible-to="quest.player_visible_to ?? []"
      />
      <QuestGraphDesigner
        v-else
        :key="`build-${quest.id}`"
        :quest-id="quest.id"
        :visible-to="quest.player_visible_to ?? []"
        :focus-current-on-open="route.query.focus === 'current'"
      />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQuest } from "@/composables/useQuests";
import { useUiStore } from "@/stores/ui";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import QuestFlowStarter from "@/components/quests/QuestFlowStarter.vue";
import QuestGraphDesigner from "@/components/quests/QuestGraphDesigner.vue";
import QuestRunCockpit from "@/components/quests/QuestRunCockpit.vue";
import QuestOverviewPanel from "@/components/quests/QuestOverviewPanel.vue";
import { QUEST_STATUS_LABELS } from "@/types/quest.types";

type QuestDetailSurface = "overview" | "work";

const route     = useRoute();
const router    = useRouter();
const ui        = useUiStore();
const isNew     = computed(() => route.name === "quest-new");
const isRunning = computed(() => !isNew.value && ui.dmMode === "play");
const id        = computed(() => (isNew.value ? "" : (route.params.id as string)));
const parentId  = computed(() => (route.query.parent as string | undefined));

/**
 * Prep opens on the overview and Play opens on the cockpit. Preparing a quest
 * starts from its premise; running one starts from where the party is standing.
 * `?overview=true` and `?mode=details` are the links the drawer left behind —
 * across saved bookmarks, attachment adapters and return-to paths — and they
 * still mean the same surface.
 */
const view = computed<QuestDetailSurface>(() => {
  if (route.query.view === "overview" || route.query.overview === "true" || route.query.mode === "details") return "overview";
  if (route.query.view === "work") return "work";
  return isRunning.value ? "work" : "overview";
});
const showsFlow = computed(() => !isNew.value && view.value === "work");
const viewOptions = computed(() => [
  { value: "overview" as const, label: "Overview" },
  { value: "work" as const, label: isRunning.value ? "Run session" : "Story flow" },
]);

function selectView(next: QuestDetailSurface) {
  const { view: _view, overview: _overview, mode: _mode, ...query } = route.query;
  void router.replace({ query: { ...query, view: next } });
}

const { data: quest, isLoading: questLoading } = useQuest(id);
const isLoading = computed(() => !isNew.value && questLoading.value);

// Build/Run used to be encoded in the URL. Honour old bookmarks once, then
// leave the persisted global Prep/Play toggle as the only mode source.
watch(
  () => [route.query.mode, route.query.edit] as const,
  ([mode, edit]) => {
    if (edit === "true" || mode === "details") {
      const { edit: _edit, mode: _mode, overview: _overview, ...query } = route.query;
      void router.replace({ query: { ...query, view: "overview" } });
      return;
    }
    if (mode !== "build" && mode !== "run") return;
    ui.dmMode = mode === "run" ? "play" : "prep";
    const { mode: _mode, ...query } = route.query;
    void router.replace({ query });
  },
  { immediate: true },
);
</script>
