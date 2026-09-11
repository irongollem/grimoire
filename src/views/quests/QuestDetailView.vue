<template>
  <PageHeader
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
      <QuestPhoneTopBar :title="quest.title" :subtitle="phoneSubtitle" />
      <!--
        The three permanent tabs — "i utterly dont like the quest in a
        modal. its too much data and inconsistent" / "perhaps we just need 3
        menus always instead of 1 swapping around based on that state" (epic
        #850). Overview, Story flow and Run are peers rendered by the same
        control regardless of session state; nothing here swaps the control
        itself for a different one.
      -->
      <SegmentedControl
        :model-value="view"
        :options="viewOptions"
        size="sm"
        class="mb-3"
        @update:model-value="(value) => selectView(value as QuestDetailSurface)"
      />

      <QuestOverviewPanel v-if="view === 'overview'" :quest="quest" />
      <QuestGraphDesigner
        v-else-if="view === 'work'"
        :key="`build-${quest.id}`"
        :quest-id="quest.id"
        :visible-to="quest.player_visible_to ?? []"
        :entry-beat-id="quest.entry_beat_id"
        :focus-current-on-open="route.query.focus === 'current'"
      />
      <QuestRunCockpit
        v-else
        :key="`run-${quest.id}`"
        :anchor-quest-id="quest.id"
        :visible-to="quest.player_visible_to ?? []"
      />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQuest } from "@/composables/quests/useQuests";
import { useQuestDetailSurface, type QuestDetailSurface } from "@/composables/quests/useQuestDetailSurface";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import QuestFlowStarter from "@/components/quests/QuestFlowStarter.vue";
import QuestGraphDesigner from "@/components/quests/QuestGraphDesigner.vue";
import QuestRunCockpit from "@/components/quests/QuestRunCockpit.vue";
import QuestOverviewPanel from "@/components/quests/QuestOverviewPanel.vue";
import QuestPhoneTopBar from "@/components/quests/QuestPhoneTopBar.vue";
import { QUEST_STATUS_LABELS } from "@/types/quest.types";

const route    = useRoute();
const router   = useRouter();
const isNew    = computed(() => route.name === "quest-new");
const id       = computed(() => (isNew.value ? "" : (route.params.id as string)));
const parentId = computed(() => (route.query.parent as string | undefined));

const { view } = useQuestDetailSurface();

/**
 * Containment belongs to the *graph*, not to either of its neighbours. The
 * canvas is a fixed-viewport surface that manages its own scrolling, so
 * `PageHeader` must stop scrolling around it; the overview and the cockpit
 * are both ordinary flowing documents and must not inherit that contract.
 * See #776.
 */
const showsGraph = computed(() => !isNew.value && view.value === "work");

// The phone top bar's second line: the lane, plus the surface when it is not
// the overview — "Active · Run" tells a DM which of the three tabs they are
// on without the tab strip having scrolled into view.
const phoneSubtitle = computed(() => {
  if (!quest.value) return undefined;
  const lane = QUEST_STATUS_LABELS[quest.value.status];
  const surface = view.value === "work" ? "Story flow" : view.value === "run" ? "Run" : null;
  return surface ? `${lane} · ${surface}` : lane;
});

const viewOptions = [
  { value: "overview" as const, label: "Overview" },
  { value: "work" as const, label: "Story flow" },
  { value: "run" as const, label: "Run" },
];

/**
 * Every generator of a quest link now writes `?view=` directly (epic #850) —
 * there is no state to translate a request into any more, only a surface to
 * record. `mode`/`overview`/`edit` are stripped defensively on the way out so
 * a stale bookmark carrying one of the retired keys does not linger in the
 * query after the DM switches tabs by hand.
 */
function selectView(next: QuestDetailSurface) {
  const { mode: _mode, overview: _overview, edit: _edit, ...query } = route.query;
  void router.replace({ query: { ...query, view: next } });
}

const { data: quest, isLoading: questLoading } = useQuest(id);
const isLoading = computed(() => !isNew.value && questLoading.value);
</script>
