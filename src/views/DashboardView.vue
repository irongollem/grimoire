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
      `useDashboardLayout` (src/composables/useDashboardLayout.ts) resolves
      which widgets appear, in what order, at what width: the DM's saved
      arrangement for this surface when one exists, and `DEFAULT_LAYOUTS`
      (src/lib/dashboard/defaultLayouts.ts) when it does not. There is no
      loading state for that resolution, deliberately — an unloaded or
      absent row merges to the surface's defaults, so a DM who never
      customized sees exactly today's dashboard, with no flash of empty
      grid while the saved layout is fetched. `WIDGET_COMPONENTS`
      (components/dashboard/widgetComponents.ts) maps each widget id to its
      component. Every widget still owns its own queries and its own body,
      and `DashboardWidget` still owns the card and its height cap — this
      view still only arranges opaque components on a grid and passes zero
      props; persistence changed where the order comes from, not the
      contract with the widgets.
    -->
    <template #actions>
      <DashboardShelf
        v-if="arranging"
        :entries="draft"
        :surface="view"
        :new-widget-ids="newWidgetIds"
        @add="onAdd"
        @reset="onReset"
      />
      <SegmentedControl
        :model-value="view"
        :options="VIEW_OPTIONS"
        size="sm"
        @update:model-value="(value) => selectView(value as DashboardSurface)"
      />
      <AppButton
        :variant="arranging ? 'primary' : 'outline'"
        size="sm"
        :icon="arranging ? IconCheck : IconGridView"
        :label="arranging ? 'Done' : 'Arrange'"
        :aria-pressed="arranging"
        @click="toggleArranging"
      />
    </template>

    <!--
      One grid, two behaviours. Arranging swaps the plain container for a
      Sortable one; the widgets themselves render identically in both, because
      judging a layout means seeing the board you actually have. `handle`
      scopes dragging to the grip the arrange frame renders; without it the
      whole card would be a drag target and a DM could not click a link inside
      a widget.

      The only difference is spacing: the row gap opens up and the grid gains
      top padding, because each widget's controls float in the gap above it.
      Wider below `md` — the grip carries a 44px touch target there, so the
      pill is taller on a phone than on a desktop and needs more room. That costs a little vertical rhythm and buys the alternative
      not happening — a control pill laid over the card covers real content,
      since `DashboardWidget` puts its "View all →" link in exactly that
      corner and `DashboardStats` is a bare row of links with no margin at all.

      Reordering only — the shelf is not a drag source. Adding from it is a
      click, which is tested and accessible; dragging a widget out of the
      drawer needs cross-container Sortable interop whose model would hold
      layout entries while its DOM renders catalogue metadata, and that has no
      test a headless browser can honestly run. Tracked separately rather than
      shipped unverified.
    -->
    <VueDraggable
      v-if="arranging"
      ref="gridEl"
      v-model="draft"
      class="grid grid-cols-1 lg:grid-cols-3 gap-x-4 gap-y-12 pt-12 md:gap-y-8 md:pt-8"
      handle=".dashboard-arrange-grip"
      :animation="180"
      ghost-class="opacity-40"
      @end="onDragEnd"
    >
      <DashboardArrangeFrame
        v-for="entry in draft"
        :key="entry.key"
        :entry="entry"
        :widget="widgetFor(entry)"
        arranging
        :class="WIDTH_CLASSES[entry.width]"
        @move="onMove"
        @cycle-width="onCycleWidth"
        @remove="onRemove"
      >
        <component :is="WIDGET_COMPONENTS[entry.id]" />
      </DashboardArrangeFrame>
    </VueDraggable>

    <div v-else ref="gridEl" class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <component
        :is="WIDGET_COMPONENTS[entry.id]"
        v-for="entry in widgets"
        :key="entry.key"
        :class="WIDTH_CLASSES[entry.width]"
      />
    </div>

    <!--
      The only feedback a screen-reader user gets that anything moved. Every
      operation in `arrangeOps` returns its own wording, so the pointer path
      and the keyboard path cannot describe the same change differently.
    -->
    <p aria-live="polite" role="status" class="sr-only">{{ announcement }}</p>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { VueDraggable } from "vue-draggable-plus";
import { useUiStore } from "@/stores/ui";
import PageHeader from "@/components/common/PageHeader.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import AppButton from "@/components/common/AppButton.vue";
import DashboardArrangeFrame from "@/components/dashboard/DashboardArrangeFrame.vue";
import DashboardShelf from "@/components/dashboard/DashboardShelf.vue";
import { WIDGET_COMPONENTS } from "@/components/dashboard/widgetComponents";
import { useDashboardLayout } from "@/composables/useDashboardLayout";
import { useToast } from "@/composables/useToast";
import { IconCheck, IconGridView } from "@/lib/icons";
import { addWidget, cycleWidth, moveEntry, removeEntry } from "@/lib/dashboard/arrangeOps";
import { captureFlipPositions, playFlipTransition } from "@/lib/motion";
import {
  widgetById,
  type DashboardSurface,
  type DashboardWidgetDef,
  type DashboardWidgetId,
  type WidgetWidth,
} from "@/lib/dashboard/widgetCatalog";
import { DEFAULT_LAYOUTS, type DashboardLayoutEntry } from "@/lib/dashboard/defaultLayouts";

const WIDTH_CLASSES: Record<WidgetWidth, string> = {
  cell: "",
  wide: "lg:col-span-2",
  full: "lg:col-span-3",
};

/**
 * Long enough that a burst of Arrow-key presses is one write, short enough
 * that a DM who arranges and immediately closes the laptop has already saved.
 * `saveLayout` is optimistic, so nothing on screen waits for this.
 */
const SAVE_DEBOUNCE_MS = 500;

const route = useRoute();
const router = useRouter();
const ui = useUiStore();
const toast = useToast();

const VIEW_OPTIONS = [
  { value: "prep" as const, label: "Prep" },
  { value: "session" as const, label: "At the table" },
];

const view = computed<DashboardSurface>(() => {
  if (route.query.view === "prep") return "prep";
  if (route.query.view === "session") return "session";
  return ui.sessionRunning ? "session" : "prep";
});

const { widgets, newWidgetIds, saveLayout, resetLayout } = useDashboardLayout(view);

const arranging = ref(false);
const announcement = ref("");
const gridEl = useTemplateRef<HTMLElement | { $el: HTMLElement }>("gridEl");

/**
 * The layout being edited.
 *
 * A working copy rather than writing straight through, because the save is
 * debounced and Sortable needs a real array to splice: the grid has to show a
 * drag the instant it lands, not once the write settles. `widgets` stays the
 * authority whenever the mode is off, so the two can never disagree while a
 * DM is only looking.
 */
const draft = ref<DashboardLayoutEntry[]>([]);

// Leaving Arrange mode, switching surface or switching campaign all mean the
// draft is describing a layout nobody is looking at any more. Re-seed from the
// merged layout rather than trying to carry edits across.
watch(
  [widgets, view, arranging],
  () => {
    if (!arranging.value) draft.value = widgets.value.map((entry) => ({ ...entry }));
  },
  { immediate: true },
);

function widgetFor(entry: DashboardLayoutEntry): DashboardWidgetDef {
  const widget = widgetById(entry.id);
  // Unreachable: the merge drops any entry the registry does not know before
  // it ever reaches a draft. Throwing beats rendering a frame with no title.
  if (widget === undefined) throw new Error(`No widget registered for "${entry.id}"`);
  return widget;
}

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

function toggleArranging() {
  arranging.value = !arranging.value;
  if (arranging.value) {
    draft.value = widgets.value.map((entry) => ({ ...entry }));
    announcement.value = "Arrange mode on. Focus a widget's grip to move it with the arrow keys.";
    return;
  }
  // Leaving flushes rather than discards: every edit was already saved, and a
  // pending debounce that died with the mode would lose the last one silently.
  flushSave();
  announcement.value = "Arrange mode off.";
}

// ── Saving ──────────────────────────────────────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function queueSave() {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
}

function flushSave() {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  void saveLayout(draft.value.map((entry) => ({ ...entry })));
}

// A DM who arranges and then navigates away must not lose the last edit to a
// timer that unmounted with the page.
onBeforeUnmount(() => {
  if (saveTimer !== null) flushSave();
});

// ── Edits ───────────────────────────────────────────────────────────────────

/**
 * Apply one operation and animate the widgets into their new places.
 *
 * The FLIP bracket is only needed for the keyboard and button paths — a
 * pointer drag is already animated by Sortable itself, and playing both would
 * fight. Hence `onDragEnd` saving without going through here.
 */
async function apply(outcome: { entries: DashboardLayoutEntry[]; announcement: string }) {
  const host = resolveGrid();
  const snapshot = host === null ? null : captureFlipPositions(host.children);
  draft.value = outcome.entries;
  announcement.value = outcome.announcement;
  queueSave();
  await nextTick();
  if (snapshot !== null) playFlipTransition(snapshot);
}

/** `VueDraggable` exposes the element as `$el`; a plain div is the element. */
function resolveGrid(): HTMLElement | null {
  const host = gridEl.value;
  if (host === null || host === undefined) return null;
  return host instanceof HTMLElement ? host : host.$el;
}

function onMove(key: string, direction: -1 | 1) {
  void apply(moveEntry(draft.value, key, direction));
}

function onCycleWidth(key: string) {
  void apply(cycleWidth(draft.value, key));
}

function onRemove(key: string) {
  void apply(removeEntry(draft.value, key));
}

function onAdd(id: DashboardWidgetId) {
  void apply(addWidget(draft.value, id, view.value));
}

/** Sortable already mutated `draft` through `v-model`; only the write is left. */
function onDragEnd() {
  announcement.value = "Widget moved.";
  queueSave();
}

// ── Reset ───────────────────────────────────────────────────────────────────

function onReset() {
  // Snapshot before the delete, because nothing else remembers: `resetLayout`
  // removes the row outright, and the merge then answers with the defaults. An
  // undo that had to reconstruct the previous arrangement could not.
  const previous = draft.value.map((entry) => ({ ...entry }));
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  void resetLayout();
  // Seeded from DEFAULT_LAYOUTS, not from `widgets`. `resetLayout` writes its
  // optimistic value a microtask later (it awaits `cancelQueries` first), so
  // reading `widgets` here returns the layout being reset *away from* and the
  // grid does not visibly change — which is what it did until a live check
  // caught it. The defaults are what a deleted row renders anyway, so this is
  // the same answer arrived at without racing the cache.
  draft.value = DEFAULT_LAYOUTS[view.value].widgets.map((entry) => ({ ...entry }));
  announcement.value = "Dashboard reset to the default layout.";
  toast.info("Dashboard reset to the default layout.", undefined, {
    action: {
      label: "Undo",
      run: () => {
        draft.value = previous.map((entry) => ({ ...entry }));
        flushSave();
        announcement.value = "Reset undone.";
      },
    },
  });
}
</script>
