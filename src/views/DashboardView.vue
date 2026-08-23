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

      Composition only — but the composition now comes from data, not markup.
      `DEFAULT_LAYOUTS` (src/lib/dashboard/defaultLayouts.ts) says which
      widgets appear, in what order, at what width; `WIDGET_COMPONENTS`
      (components/dashboard/widgetComponents.ts) maps each widget id to its
      component. Every widget still owns its own queries and its own body,
      and `DashboardWidget` still owns the card and its height cap — this
      view only arranges opaque components on a grid.
    -->
    <template #actions>
      <SegmentedControl
        :model-value="view"
        :options="VIEW_OPTIONS"
        size="sm"
        @update:model-value="(value) => selectView(value as DashboardSurface)"
      />
    </template>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <component
        :is="WIDGET_COMPONENTS[entry.id]"
        v-for="entry in layout.widgets"
        :key="entry.key"
        :class="WIDTH_CLASSES[entry.width]"
      />
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUiStore } from "@/stores/ui";
import PageHeader from "@/components/common/PageHeader.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import { WIDGET_COMPONENTS } from "@/components/dashboard/widgetComponents";
import { DEFAULT_LAYOUTS } from "@/lib/dashboard/defaultLayouts";
import type { DashboardSurface, WidgetWidth } from "@/lib/dashboard/widgetCatalog";

const WIDTH_CLASSES: Record<WidgetWidth, string> = {
  cell: "",
  wide: "lg:col-span-2",
  full: "lg:col-span-3",
};

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

const layout = computed(() => DEFAULT_LAYOUTS[view.value]);

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
