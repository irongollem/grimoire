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
        v-if="customizing"
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
      <!--
        The dot is the only thing that tells a DM a widget they have never seen
        exists. A widget the surface's defaults leave off never lands on the
        board by itself (#762's merge only re-inserts what the defaults ship
        visible), so without this it waits inside a mode nobody had a reason to
        open. Same idiom as the player portal's unread markers.
      -->
      <span class="relative inline-flex">
        <AppButton
          :variant="customizing ? 'primary' : 'outline'"
          size="sm"
          :icon="customizing ? IconCheck : IconGridView"
          :label="customizing ? 'Done' : 'Customize'"
          :aria-pressed="customizing"
          @click="toggleCustomizing"
        />
        <EntityNewDot
          :is-new="hasUndiscoveredWidgets"
          class="pointer-events-none absolute -right-1 -top-1"
          :title="`${newWidgetIds.length} new widget${newWidgetIds.length === 1 ? '' : 's'} to add`"
        />
      </span>
    </template>

    <!--
      One grid, two behaviours. Customizing swaps the plain container for a
      Sortable one; the widgets themselves render identically in both, because
      judging a layout means seeing the board you actually have. `handle`
      scopes dragging to the grip the customize frame renders; without it the
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
      v-if="customizing"
      ref="gridEl"
      v-model="draft"
      class="grid grid-cols-1 lg:grid-cols-3 gap-x-4 gap-y-12 pt-12 md:gap-y-8 md:pt-8"
      handle=".dashboard-customize-grip"
      :animation="180"
      ghost-class="opacity-40"
      @end="onDragEnd"
    >
      <DashboardCustomizeFrame
        v-for="entry in draft"
        :key="entry.key"
        :entry="entry"
        :widget="widgetFor(entry)"
        customizing
        :class="[
          WIDTH_CLASSES[entry.width],
          entry.key === justAddedKey && 'rounded-lg ring-2 ring-primary/60',
          'transition-shadow duration-500',
        ]"
        @move="onMove"
        @cycle-width="onCycleWidth"
        @remove="onRemove"
        @configure="onConfigure"
      >
        <component :is="WIDGET_COMPONENTS[entry.id]" v-bind="widgetProps(entry)" />
      </DashboardCustomizeFrame>
    </VueDraggable>

    <div v-else ref="gridEl" class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <component
        :is="WIDGET_COMPONENTS[entry.id]"
        v-for="entry in widgets"
        :key="entry.key"
        v-bind="widgetProps(entry)"
        :class="WIDTH_CLASSES[entry.width]"
      />
    </div>

    <!--
      Per-instance settings (#764). Always mounted, driven by which key is being
      configured, so `AppModal` still gets to animate its own open — a `v-if`
      here would mount the dialog already open and skip the transition.
    -->
    <DashboardWidgetSettingsModal
      :entry="configuringEntry"
      @save="onSaveSettings"
      @close="configuringKey = null"
    />

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
import EntityNewDot from "@/components/common/EntityNewDot.vue";
import DashboardCustomizeFrame from "@/components/dashboard/DashboardCustomizeFrame.vue";
import DashboardShelf from "@/components/dashboard/DashboardShelf.vue";
import DashboardWidgetSettingsModal from "@/components/dashboard/DashboardWidgetSettingsModal.vue";
import { WIDGET_COMPONENTS } from "@/components/dashboard/widgetComponents";
import { useDashboardLayout } from "@/composables/useDashboardLayout";
import { useToast } from "@/composables/useToast";
import { IconCheck, IconGridView } from "@/lib/icons";
import {
  addWidget,
  configureEntry,
  cycleWidth,
  moveEntry,
  removeEntry,
  type ArrangeOutcome,
} from "@/lib/dashboard/arrangeOps";
import { captureFlipPositions, playFlipTransition, revealInScrollParent } from "@/lib/motion";
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

const customizing = ref(false);

/**
 * Whether the picker is holding something the DM has not seen.
 *
 * Only while the mode is closed: once they are inside it, the "New" badges on
 * the options themselves say which, and a dot on the Done button would be
 * pointing at nothing.
 */
const hasUndiscoveredWidgets = computed(
  () => !customizing.value && newWidgetIds.value.length > 0,
);
const announcement = ref("");
const gridEl = useTemplateRef<HTMLElement | { $el: HTMLElement }>("gridEl");

/**
 * Which instance's settings dialog is open (#764), or `null` for none.
 *
 * A key rather than an entry, because `apply` replaces the whole draft array
 * on every edit — a held entry object would be a stale copy the moment the DM
 * changed anything.
 */
const configuringKey = ref<string | null>(null);

/** The instance added a moment ago, ringed so it is findable after the scroll. */
const justAddedKey = ref<string | null>(null);
const configuringEntry = computed(() =>
  draft.value.find((entry) => entry.key === configuringKey.value),
);

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

// Leaving Customize mode, switching surface or switching campaign all mean the
// draft is describing a layout nobody is looking at any more. Re-seed from the
// merged layout rather than trying to carry edits across.
watch(
  [widgets, view, customizing],
  () => {
    if (!customizing.value) draft.value = widgets.value.map((entry) => ({ ...entry }));
  },
  { immediate: true },
);

// The dialog belongs to a widget on a board being edited. Leaving the mode or
// switching surface means neither is on screen any more.
watch([view, customizing], () => {
  configuringKey.value = null;
});

function widgetFor(entry: DashboardLayoutEntry): DashboardWidgetDef {
  const widget = widgetById(entry.id);
  // Unreachable: the merge drops any entry the registry does not know before
  // it ever reaches a draft. Throwing beats rendering a frame with no title.
  if (widget === undefined) throw new Error(`No widget registered for "${entry.id}"`);
  return widget;
}

/**
 * What a widget component is handed. Still nothing for all but the
 * configurable ones (#764) — the view passes the layout entry's `settings`
 * blob and knows nothing about what is in it.
 *
 * Bound conditionally rather than always: a widget that declares no `settings`
 * prop would take it as a fallthrough attribute and stamp `settings="[object
 * Object]"` onto its own root element.
 */
function widgetProps(entry: DashboardLayoutEntry): Record<string, unknown> {
  if (widgetById(entry.id)?.configurable !== true) return {};
  return { settings: entry.settings };
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

function toggleCustomizing() {
  customizing.value = !customizing.value;
  if (customizing.value) {
    draft.value = widgets.value.map((entry) => ({ ...entry }));
    announcement.value = "Customize mode on. Focus a widget's grip to move it with the arrow keys.";
    return;
  }
  // Leaving flushes rather than discards: every edit was already saved, and a
  // pending debounce that died with the mode would lose the last one silently.
  flushSave();
  announcement.value = "Customize mode off.";
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
  if (flashTimer !== null) clearTimeout(flashTimer);
});

// ── Edits ───────────────────────────────────────────────────────────────────

/**
 * Apply one operation and animate the widgets into their new places.
 *
 * The FLIP bracket is only needed for the keyboard and button paths — a
 * pointer drag is already animated by Sortable itself, and playing both would
 * fight. Hence `onDragEnd` saving without going through here.
 */
async function apply(outcome: ArrangeOutcome) {
  const host = resolveGrid();
  const snapshot = host === null ? null : captureFlipPositions(host.children);
  draft.value = outcome.entries;
  announcement.value = outcome.announcement;
  queueSave();
  await nextTick();
  if (snapshot !== null) playFlipTransition(snapshot);
  // After the FLIP, not before: the widgets are in their new places by now, so
  // the scroll targets where the thing actually ended up rather than where it
  // was a frame ago.
  if (outcome.focusKey !== undefined) reveal(outcome.focusKey);
}

/**
 * Scroll the instance an edit was about back into view.
 *
 * The sighted half of `announcement`. On a board long enough to scroll, a
 * widget added from the shelf lands below the fold and the click looks like it
 * did nothing — which is exactly what it looked like while this was being
 * built. `revealInScrollParent` does nothing when the widget is already
 * visible, so a short board never moves.
 */
function reveal(key: string) {
  const host = resolveGrid();
  if (host === null) return;
  const el = host.querySelector(`[data-widget-key="${CSS.escape(key)}"]`);
  if (el !== null) revealInScrollParent(el);
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
  // Cleared, not left to the computed: re-adding the same widget from the
  // shelf mints the same instance key, and a stale one would spring its
  // settings dialog open on a card the DM had just placed.
  if (configuringKey.value === key) configuringKey.value = null;
  void apply(removeEntry(draft.value, key));
}

function onAdd(id: DashboardWidgetId) {
  const outcome = addWidget(draft.value, id, view.value);
  void apply(outcome);
  // Scrolling answers "where did it go"; the ring answers "which one", which
  // the scroll alone does not once a DM adds three in a row. Only `add` gets
  // it — flashing on every arrow-key move would strobe the board.
  if (outcome.focusKey !== undefined) flashAdded(outcome.focusKey);
}

/** How long the just-added ring stays up. Long enough to find the card after
 *  a smooth scroll has finished, short enough not to become chrome. */
const ADDED_FLASH_MS = 1600;

let flashTimer: ReturnType<typeof setTimeout> | null = null;

function flashAdded(key: string) {
  if (flashTimer !== null) clearTimeout(flashTimer);
  justAddedKey.value = key;
  flashTimer = setTimeout(() => {
    justAddedKey.value = null;
    flashTimer = null;
  }, ADDED_FLASH_MS);
}

function onConfigure(key: string) {
  configuringKey.value = key;
}

/**
 * Applied straight to the draft, exactly like a width cycle — the dialog's
 * "Done" closes it and does not commit. Nothing in Customize mode is
 * provisional, and one dialog that was would be the surprise.
 */
function onSaveSettings(key: string, settings: Record<string, unknown>) {
  void apply(configureEntry(draft.value, key, settings));
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
