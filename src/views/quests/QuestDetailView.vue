<template>
  <!--
    Reading on tablet and up is a modal over the quest log — this route is
    nested under `/quests`, so the log is mounted right behind it and keeps its
    scroll position and revealed page while a DM checks on a quest.
    `useQuestDetailSurface` is what makes that safe to do at all: the overview
    is a glance and gets the modal, but the story-flow graph and the run
    cockpit are a commitment (a fixed-viewport canvas, a live session), and
    `takesWholeScreen` tells `useDetailModal` to give those the whole screen —
    on every width, not only mobile's.

    The one exception is a surface switch made *inside* the quest: flipping
    this control from Story flow or Run session back to Overview must keep the
    whole screen rather than dropping the DM onto the quest log with a modal
    open over it. `selectView` marks that with `ui.questFullScreenId`, which
    `takesWholeScreen` also honours, and which is forgotten the moment the DM
    leaves this quest — so opening a *different* quest from the log is still
    the ordinary modal.
  -->
  <QuestDetailModal v-if="asModal" :id="id" @close="close" />

  <PageHeader
    v-else
    :title="quest?.title || (isNew ? 'New Quest' : 'Loading…')"
    :description="quest ? QUEST_STATUS_LABELS[quest.status] : undefined"
    :contained="showsGraph"
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
import { computed, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQuest } from "@/composables/quests/useQuests";
import { useQuestDetailSurface, type QuestDetailSurface } from "@/composables/quests/useQuestDetailSurface";
import { useDetailModal } from "@/composables/useDetailModal";
import { useUiStore } from "@/stores/ui";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import QuestFlowStarter from "@/components/quests/QuestFlowStarter.vue";
import QuestGraphDesigner from "@/components/quests/QuestGraphDesigner.vue";
import QuestRunCockpit from "@/components/quests/QuestRunCockpit.vue";
import QuestOverviewPanel from "@/components/quests/QuestOverviewPanel.vue";
import QuestDetailModal from "@/components/quests/QuestDetailModal.vue";
import { QUEST_STATUS_LABELS } from "@/types/quest.types";

const route     = useRoute();
const router    = useRouter();
const ui        = useUiStore();
const isNew     = computed(() => route.name === "quest-new");
const id        = computed(() => (isNew.value ? "" : (route.params.id as string)));
const parentId  = computed(() => (route.query.parent as string | undefined));

const { view, isRunning, takesWholeScreen } = useQuestDetailSurface();

// `asModal` and `close` are the same reasoning QuestsView uses to decide
// whether to keep drawing the log, so the two can never disagree about which
// of them the user is looking at.
const { asModal, close } = useDetailModal("/quests", () => takesWholeScreen.value);

/**
 * Containment belongs to the *graph*, not to the work tab. The canvas is a
 * fixed-viewport surface that manages its own scrolling, so `PageHeader` must
 * stop scrolling around it; the cockpit is an ordinary long document and must
 * not inherit that. Binding this to `view === "work"` gave the cockpit the
 * canvas's contract, so at `lg` and wider its body became `overflow:hidden` —
 * a scroll container that cannot be scrolled — and the run controls'
 * `sticky bottom-2` bar pinned over content nobody could reach past. See #776.
 */
const showsGraph = computed(() => !isNew.value && view.value === "work" && !isRunning.value);
const viewOptions = computed(() => [
  { value: "overview" as const, label: "Overview" },
  { value: "work" as const, label: isRunning.value ? "Run session" : "Story flow" },
]);

function selectView(next: QuestDetailSurface) {
  // A switch made through this control while the quest already has the whole
  // screen — Story flow or Run session — must keep it, all the way back to
  // Overview: that is a surface change made *inside* the quest, not a new
  // navigation to a screen the DM never asked to see, so it must not drop them
  // onto the quest list with a modal open over it. `asModal` is false in
  // exactly that case (and on mobile, where the flag is harmless: nothing
  // there is ever a modal anyway). Arriving on the overview as today's modal —
  // opened fresh from the list — leaves the flag untouched, so the *next*
  // quest opened from the log is still a modal.
  if (!asModal.value) ui.questFullScreenId = id.value;
  const { view: _view, overview: _overview, mode: _mode, ...query } = route.query;
  void router.replace({ query: { ...query, view: next } });
}

// The flag names one quest. Leaving it — for another quest's id, or by
// unmounting this view entirely (back to `/quests`) — must forget it, or the
// next quest opened from the log would wrongly skip its modal too.
watch(id, (next, previous) => {
  if (previous && previous !== next && ui.questFullScreenId === previous) {
    ui.questFullScreenId = null;
  }
});

onUnmounted(() => {
  if (ui.questFullScreenId === id.value) ui.questFullScreenId = null;
});

const { data: quest, isLoading: questLoading } = useQuest(id);
const isLoading = computed(() => !isNew.value && questLoading.value);

// The surfaces the retired drawer left behind, in bookmarks, attachment
// adapters and return-to paths. Each names a surface, so each translates to
// one — none of them touches the global mode.
//
// `?mode=run` is deliberately absent here: it is still generated, so it stays
// in the query and drives `isRunning` (via `useQuestDetailSurface`) for as
// long as the DM is on that surface. `selectView` clears it when they leave.
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
