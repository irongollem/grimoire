<template>
  <PageHeader :title="title" :description="description">
    <!--
      Two compositions, one route. Which one you get follows the session,
      because the session is what decides which of the DM's two jobs is in
      front of them — and that makes starting one visibly change the page, not
      just the chrome, which was #758's first and worst finding.

      `?view=` overrides it, so a DM mid-session can check what still needs
      preparing without ending the table. Same shape as `QuestDetailView`:
      derived default, explicit escape hatch.

      Composition only. Every widget owns its queries and its body, and
      `DashboardWidget` owns the card and its height cap.
    -->
    <template #actions>
      <SegmentedControl
        :model-value="view"
        :options="VIEW_OPTIONS"
        size="sm"
        @update:model-value="(value) => selectView(value as DashboardSurface)"
      />
    </template>

    <div class="flex flex-col gap-4">
      <template v-if="view === 'session'">
        <LiveEncounterBanner />
        <PartyWidget />
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <QuestsWidget />
          <SessionWidget />
          <UnidentifiedWidget />
        </div>
        <RecentNpcsWidget />
        <PinnedNotesWidget />
      </template>

      <template v-else>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <PrepGapsWidget />
          <QuestsWidget />
          <div class="flex flex-col gap-4">
            <NextSessionWidget />
            <UnidentifiedWidget />
          </div>
        </div>
        <PartyWidget />
        <PinnedNotesWidget />
      </template>

      <DashboardStats />
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUiStore } from "@/stores/ui";
import PageHeader from "@/components/common/PageHeader.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import LiveEncounterBanner from "@/components/dashboard/widgets/LiveEncounterBanner.vue";
import PartyWidget from "@/components/dashboard/widgets/PartyWidget.vue";
import QuestsWidget from "@/components/dashboard/widgets/QuestsWidget.vue";
import SessionWidget from "@/components/dashboard/widgets/SessionWidget.vue";
import UnidentifiedWidget from "@/components/dashboard/widgets/UnidentifiedWidget.vue";
import RecentNpcsWidget from "@/components/dashboard/widgets/RecentNpcsWidget.vue";
import PinnedNotesWidget from "@/components/dashboard/widgets/PinnedNotesWidget.vue";
import PrepGapsWidget from "@/components/dashboard/widgets/PrepGapsWidget.vue";
import NextSessionWidget from "@/components/dashboard/widgets/NextSessionWidget.vue";
import DashboardStats from "@/components/dashboard/widgets/DashboardStats.vue";

type DashboardSurface = "session" | "prep";

const route = useRoute();
const router = useRouter();
const ui = useUiStore();

const VIEW_OPTIONS = [
  { value: "prep" as const, label: "Prep" },
  { value: "session" as const, label: "At the table" },
];

const view = computed<DashboardSurface>(() => {
  if (route.query.view === "prep") return "prep";
  if (route.query.view === "session") return "session";
  return ui.sessionRunning ? "session" : "prep";
});

const title = computed(() => (view.value === "session" ? "At the Table" : "Campaign Dashboard"));
const description = computed(() =>
  view.value === "session" ? "What is in front of you" : "What still needs preparing",
);

function selectView(next: DashboardSurface) {
  const { view: _view, ...query } = route.query;
  // The derived default is the one worth having, so choosing the side the
  // session would have picked anyway clears the override rather than pinning it.
  const derived = ui.sessionRunning ? "session" : "prep";
  void router.replace({ query: next === derived ? query : { ...query, view: next } });
}
</script>
