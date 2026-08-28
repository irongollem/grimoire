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
import { useQuest } from "@/composables/quests/useQuests";
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

/**
 * The cockpit is showing — either because the link asked for it, or because a
 * session is running and the cockpit is the session's default surface.
 *
 * `?mode=run` is *not* a legacy bookmark: `QuestChainRow` and
 * `QuestRunOpenChains` generate it every time a DM opens a chain. It used to be
 * honoured by writing `ui.dmMode = "play"` and then stripping itself from the
 * query — so opening a chain from the dashboard silently switched broadcasting
 * on, and every NPC revealed afterwards announced itself to the players with
 * nothing to connect the two. A link that says "run this quest" may choose the
 * surface; it may not start broadcasting to the table. See #758.
 */
const runRequested = computed(() => route.query.mode === "run");
const isRunning = computed(() => !isNew.value && (runRequested.value || ui.dmMode === "play"));
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

// The surfaces the retired drawer left behind, in bookmarks, attachment
// adapters and return-to paths. Each names a surface, so each translates to
// one — none of them touches the global mode.
//
// `?mode=run` is deliberately absent here: it is still generated, so it stays
// in the query and drives `runRequested` for as long as the DM is on that
// surface. `selectView` clears it when they leave.
watch(
  () => [route.query.mode, route.query.edit] as const,
  ([mode, edit]) => {
    if (edit === "true" || mode === "details") {
      const { edit: _edit, mode: _mode, overview: _overview, ...query } = route.query;
      void router.replace({ query: { ...query, view: "overview" } });
      return;
    }
    // `?mode=build` predates the story-flow rescope and nothing emits it now.
    // It used to write `dmMode = "prep"` and lean on prep's default landing,
    // which put a link labelled Build on the *overview*; naming the working
    // surface outright is both the honest translation and the one it meant.
    if (mode !== "build") return;
    const { mode: _mode, ...query } = route.query;
    void router.replace({ query: { ...query, view: "work" } });
  },
  { immediate: true },
);
</script>
