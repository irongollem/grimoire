<template>
  <!-- Tree beside a place pane, the same split the loaded Atlas draws. -->
  <div v-if="isLoading" role="status" class="flex min-h-0 lg:h-full">
    <span class="sr-only">Loading…</span>
    <div class="flex min-w-0 flex-1 flex-col gap-2 lg:w-md lg:flex-none lg:border-r lg:border-border lg:pr-4">
      <div
        v-for="row in TREE_SKELETON"
        :key="row.id"
        class="flex items-center gap-2"
        :style="{ paddingLeft: `${row.depth * 1.25}rem` }"
      >
        <SkeletonBlock class="size-4 shrink-0 rounded" />
        <SkeletonBlock class="h-4" :class="row.width" />
      </div>
    </div>
    <div class="hidden min-w-0 flex-1 flex-col gap-4 lg:flex lg:pl-4">
      <SkeletonBlock class="h-8 w-1/2" />
      <SkeletonBlock class="h-48 w-full" />
      <SkeletonBlock class="h-4 w-full" />
      <SkeletonBlock class="h-4 w-4/5" />
    </div>
  </div>

  <EmptyState
    v-else-if="!allLocations.length"
    title="No locations yet"
    description="Chart the lands, cities, and dungeons of your realm."
  >
    <template #icon><IconNavAtlas class="h-16 w-16" /></template>
    <template #action>
      <AppButton variant="primary" size="md" to="/locations/new" label="Add your first location" />
    </template>
  </EmptyState>

  <!--
    No `gap` on this row, deliberately: the folded tree column stays mounted at
    `max-w-0` so its width can animate, and a gap would still reserve a column's
    worth of space beside something zero pixels wide. The 1rem either side of
    the divider is carried by the columns themselves (`lg:pr-4` on the tree,
    `lg:pl-4` on the pane), which collapse to nothing along with the column.
  -->
  <div v-else class="flex min-h-0 lg:h-full">
    <!--
      Master/detail. Side by side from lg; below that the panes swap, because a
      tree and a place sheet sharing a phone screen leaves neither usable.
    -->
    <!--
      Both columns must be flex containers with `min-h-0`, not blocks: a block's
      height is auto, so the pane inside it resolves `flex-1` against nothing,
      grows with its content, and its own `overflow-y-auto` never gets a height
      to scroll within. The tree then runs off the bottom of the page instead of
      scrolling — invisible until a branch is expanded far enough to overflow.
    -->
    <!--
      Folding the tree is a desktop-only affordance (the mobile tree/pane swap
      above already gives the tree the full screen), so every collapse-related
      class here carries an `lg:` prefix — below that breakpoint this column
      renders exactly as it always has, driven only by `selectedId`.

      It stays mounted rather than v-if'd on collapse: max-width can animate,
      `display: none` cannot, so a JS-driven Transition (`railTransition` in
      motion.ts) would need its own breakpoint tracking just to stay a no-op on
      mobile — more machinery than the fix. Plain Tailwind covers it, and
      `motion-reduce:` (not a hand-rolled matchMedia check) honours reduced
      motion the same way `motion-safe:` already does on QuestBoardCard.
    -->
    <div
      class="min-h-0 min-w-0 flex-1 flex-col lg:shrink-0 lg:overflow-hidden lg:transition-[max-width,padding-right,border-width] lg:duration-200 lg:ease-out motion-reduce:lg:transition-none"
      :class="[
        // A search's matches are listed in this column, so while they are open
        // it shows even over an open place (below lg) or a fold (from lg).
        selectedId && !resultsOpen ? 'hidden lg:flex' : 'flex',
        // A set width (not flex-1 capped by max-w): with both columns flex-1
        // the tree could never grow past half the row, so dragging further did
        // nothing. max-w is what the fold animates.
        'lg:w-(--atlas-tree-w) lg:flex-none',
        treeFolded
          ? 'lg:max-w-0 lg:border-r-0 lg:pr-0'
          : 'lg:max-w-(--atlas-tree-w) lg:border-r lg:border-border lg:pr-4',
        dragging && 'lg:transition-none',
      ]"
      :style="{ '--atlas-tree-w': `${treeWidth}px` }"
    >
      <AtlasTree
        :index="index"
        :expanded="ui.locationsExpanded"
        :selected-id="selectedId"
        :matches="matches"
        :is-filtered="ui.locationsHasActiveFilters"
        :total-count="allLocations.length"
        :today-year="todayYear"
        @select="select"
        @toggle="ui.toggleLocationExpanded"
        @collapse-all="ui.collapseAllLocations()"
        @collapse-tree="foldTree"
      />
    </div>

    <!--
      The divider is a handle: drag it (or focus it and use the arrow keys) to
      give the tree more or less room; double-click puts it back. The width is
      remembered per browser. Desktop only, like the fold.
    -->
    <div
      v-if="!treeFolded"
      class="relative hidden w-0 shrink-0 lg:block"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize location tree"
        :aria-valuenow="treeWidth"
        :aria-valuemin="TREE_MIN"
        :aria-valuemax="TREE_MAX"
        tabindex="0"
        class="group absolute inset-y-0 -left-1.5 z-10 flex w-3 cursor-col-resize justify-center outline-none"
        @pointerdown="startDrag"
        @dblclick="treeWidth = TREE_DEFAULT"
        @keydown.left.prevent="treeWidth = clampWidth(treeWidth - 24)"
        @keydown.right.prevent="treeWidth = clampWidth(treeWidth + 24)"
      >
        <span
          class="h-full w-0.5 transition-colors group-hover:bg-primary/60 group-focus-visible:bg-primary"
          :class="dragging ? 'bg-primary' : 'bg-transparent'"
        />
      </div>
    </div>

    <!--
      The way back once the tree is folded — a GitHub/Atlassian-style rail
      rather than relying on a page-level control, so it stays exactly where
      the tree used to be. `hidden lg:flex` for the same reason as above: this
      state has no business rendering below `lg`.
    -->
    <div
      v-if="treeFolded"
      class="hidden min-h-0 lg:flex lg:w-8 lg:shrink-0 lg:flex-col lg:items-center lg:border-r lg:border-border lg:pt-1"
    >
      <AppButton
        variant="ghost"
        size="icon-xs"
        :icon="IconChevronRight"
        tooltip="Expand location tree"
        aria-label="Expand location tree"
        @click="unfoldTree"
      />
    </div>

    <div
      ref="paneColumn"
      class="min-h-0 min-w-0 flex-1 flex-col lg:pl-4"
      :class="selectedId && !resultsOpen ? 'flex' : 'hidden lg:flex'"
    >
      <AppButton
        v-if="selectedId"
        variant="ghost"
        size="inline-xs"
        class="mb-2 lg:hidden"
        :icon="IconChevronLeft"
        label="All places"
        @click="clearSelection"
      />
      <!--
        A place has one DM screen now. Editing and running are states of
        this same pane rather than trips to a separate page — `editing` and
        `running` read straight off the Atlas route's own query, the way
        `build` already does inside `AtlasPlacePane`. Keyed by the place's id
        so switching which place is being edited or run remounts instead of
        reusing stale local state, same as the old per-route pages did.
      -->
      <div v-if="selectedLoading" role="status" class="flex flex-1 flex-col gap-4">
        <span class="sr-only">Loading…</span>
        <SkeletonBlock class="h-8 w-1/2" />
        <SkeletonBlock class="h-48 w-full" />
        <SkeletonBlock class="h-4 w-full" />
        <SkeletonBlock class="h-4 w-4/5" />
      </div>
      <EmptyState
        v-else-if="selectedFailed"
        title="Could not open this place"
        description="Reload the Atlas, or pick the place again."
      />
      <div v-else-if="editing && selected" :key="selected.id" class="flex flex-col gap-6">
        <LocationEditor :location="selected" />
        <!-- The pane mounts this box for Browse and Build; the edit form
             replaces the pane, so the box follows it here (#983). -->
        <DmNoteBox type="location" :id="selected.id" :label="selected.name" />
      </div>
      <SiteRunSurface
        v-else-if="running && selected"
        :key="selected.id"
        :location="selected"
      />
      <AtlasPlacePane
        v-else
        :index="index"
        :location="selected"
        :pane-mode="ui.locationsPaneMode"
        :today-year="todayYear"
        @select="select"
        @update:pane-mode="ui.locationsPaneMode = $event"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import { useStorage } from "@vueuse/core";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import AppButton from "@/components/common/AppButton.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import SkeletonBlock from "@/components/common/SkeletonBlock.vue";
import AtlasPlacePane from "@/components/locations/AtlasPlacePane.vue";
import AtlasTree from "@/components/locations/AtlasTree.vue";
import DmNoteBox from "@/components/notes/DmNoteBox.vue";
import LocationEditor from "@/components/locations/LocationEditor.vue";
import SiteRunSurface from "@/components/locations/SiteRunSurface.vue";
import { useAtlasTreeFold } from "@/composables/locations/useAtlasTreeFold";
import { useAllLocations, useLocation } from "@/composables/locations/useLocations";
import {
  LOCATION_TEXT_SEARCH_MIN_LENGTH,
  useLocationTextSearch,
} from "@/composables/locations/useLocationTextSearch";
import { useBelow } from "@/composables/useBreakpoint";
import { IconChevronLeft, IconChevronRight, IconNavAtlas } from "@/lib/icons";
import { isSiteType } from "@/lib/locations/tiers";
import { ancestorIds, buildAtlasIndex } from "@/lib/locations/tree";
import { chooseMatchTerm } from "@/lib/locations/matchTerm";
import { scrollParentOf } from "@/lib/scrollParent";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";

// ── Resizable tree column (desktop) ────────────────────────────────────────
// Shape of a half-open tree for the loading placeholder: depth indents the row,
// width is a literal class so Tailwind generates it. Static, never random.
const TREE_SKELETON = [
  { id: 1, depth: 0, width: "w-1/2" },
  { id: 2, depth: 1, width: "w-2/5" },
  { id: 3, depth: 2, width: "w-1/3" },
  { id: 4, depth: 2, width: "w-2/5" },
  { id: 5, depth: 1, width: "w-1/2" },
  { id: 6, depth: 0, width: "w-3/5" },
  { id: 7, depth: 1, width: "w-1/3" },
  { id: 8, depth: 1, width: "w-2/5" },
  { id: 9, depth: 0, width: "w-1/2" },
  { id: 10, depth: 1, width: "w-3/5" },
] as const;

const TREE_MIN = 240;
const TREE_MAX = 720;
const TREE_DEFAULT = 448; // the old fixed max-w-md
const clampWidth = (w: number) => Math.round(Math.min(TREE_MAX, Math.max(TREE_MIN, w)));
const treeWidth = useStorage("grimoire-atlas-tree-width", TREE_DEFAULT, safeLocalStorage());
const dragging = ref(false);
let dragStartX = 0;
let dragStartW = 0;

function onDragMove(e: PointerEvent) {
  treeWidth.value = clampWidth(dragStartW + e.clientX - dragStartX);
}
function stopDrag() {
  dragging.value = false;
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", stopDrag);
  document.body.style.removeProperty("cursor");
  document.body.style.removeProperty("user-select");
}
function startDrag(e: PointerEvent) {
  if (e.button !== 0) return;
  e.preventDefault();
  dragging.value = true;
  dragStartX = e.clientX;
  dragStartW = treeWidth.value;
  // Keep the resize cursor and stop text selection while the pointer is
  // anywhere on the page, not only over the thin handle.
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", stopDrag);
}
onBeforeUnmount(stopDrag);

const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const { todayYear } = storeToRefs(useCampaignStore());
const { data: locations, isLoading } = useAllLocations();

const allLocations = computed(() => locations.value ?? []);
const index = computed(() => buildAtlasIndex(allLocations.value));

const selectedId = computed(() => ui.locationsSelectedId);
// The tree list is slim (#972); the pane, the editor and the run surface show
// a place in full, so the selected place is read by id. The slim row only
// decides *whether* a place is selected, never what the pane renders.
const {
  data: selectedRow,
  isPending: selectedPending,
  isError: selectedFailed,
} = useLocation(selectedId);
const selected = computed(() => selectedRow.value ?? null);
const selectedLoading = computed(() => !!selectedId.value && selectedPending.value);

// `edit`/`run` are route flags on the selected place, the same convention
// `build` already uses inside `AtlasPlacePane`. `run` additionally requires a
// site-tier place — a stray `?run=true` on anything else falls through to
// the plain pane rather than erroring, same as the old page's own guard.
const editing = computed(() => route.query.edit === "true");
// Decided from the slim row (it carries `location_type`), not the full one, so
// switching to a place that is not cached yet does not flip the layout while it
// loads: the tree would unfold, then fold again and remount the runner. The
// full row is still what the pane, editor and runner render. The full row's
// type covers a place the slim list has not caught up with yet.
const selectedType = computed(
  () => (selectedId.value ? index.value.byId.get(selectedId.value)?.location_type : undefined)
    ?? selected.value?.location_type,
);
const selectedIsSite = computed(() => !!selectedType.value && isSiteType(selectedType.value));
const running = computed(() => route.query.run === "true" && selectedIsSite.value);

// The site runner and a site's Map tab both want the pane's full width, so the
// tree folds for as long as either is on screen. Derived, never stored: see
// `useAtlasTreeFold` for why this must not touch the DM's own fold.
const paneWantsWidth = computed(() => {
  if (!selectedId.value || editing.value) return false;
  return running.value || (ui.locationsPaneMode === "map" && selectedIsSite.value);
});
const { treeFolded, resultsOpen, foldTree, unfoldTree, closeResults } =
  useAtlasTreeFold(paneWantsWidth);

/**
 * Flat match list, only consulted while a filter is active.
 *
 * Deliberately not paged: the old card grid needed `useInfiniteScroll` because
 * every card mounted a `FocalImage`, and a few hundred of those up front is
 * what made the list slow. These rows are text and a colour dot, so paging them
 * would add machinery to solve a cost that no longer exists.
 */
const searchText = computed(() => ui.locationsSearch);
const { matchedIds: textMatchedIds, matchedTerm } = useLocationTextSearch(searchText);

const matches = computed(() => {
  if (!ui.locationsHasActiveFilters) return [];
  const type = ui.locationsFilterType;
  // One term for name, tag and text matching alike, so the list moves in one
  // step when the database answer lands and never mixes two terms.
  const { term, useTextMatches } = chooseMatchTerm(
    ui.locationsSearch,
    matchedTerm.value,
    LOCATION_TEXT_SEARCH_MIN_LENGTH,
  );
  const q = term.toLowerCase();
  return allLocations.value.filter((loc) => {
    if (type !== "all" && loc.location_type !== type) return false;
    if (!q) return true;
    // Name and tags are on the slim list; description and notes are matched in
    // the database (`useLocationTextSearch`) and arrive as ids.
    return (
      loc.name.toLowerCase().includes(q) ||
      loc.tags.some((t) => t.toLowerCase().includes(q)) ||
      (useTextMatches && textMatchedIds.value.has(loc.id))
    );
  });
});

/**
 * Selection lives in the URL (`/locations?at=<id>`), which is what makes Back
 * walk the trail of places you visited instead of leaving the Atlas entirely.
 * Descending a hierarchy *is* navigation, so it belongs in history.
 *
 * The store stays the source of truth for rendering; this only pushes, and the
 * watcher below adopts whatever the route ends up holding — including after a
 * Back, which changes the route without going through here.
 */
function select(id: string) {
  // Picking a match is the end of looking at the matches. Before the early
  // return, because the match picked may be the place already open.
  closeResults();
  if (route.query.at === id) return; // re-clicking the open place is not a new entry
  router.push({ query: { ...route.query, at: id } });
}

function clearSelection() {
  // Forget it too, or "All places" would be undone by the restore below the
  // next time the Atlas is opened — an exit the user cannot take.
  ui.locationsLastSelectedId = null;
  // Every per-place mode flag goes with the place it was opened for — left
  // in place, `edit`/`run`/`build` would attach themselves to whatever the
  // DM selects next, editing or running a place they never asked to.
  const { at: _discarded, edit: _e, run: _r, build: _b, ...rest } = route.query;
  router.push({ query: rest });
}

/**
 * Arriving at a bare `/locations` reopens the place you were last on.
 *
 * Selection lives in the URL so Back walks the trail, which is right, but it
 * also meant leaving the Atlas by the sidebar and returning dropped the place
 * you were reading. `replace`, not `push`: restoring is not a navigation the
 * user made, and pushing it would put a place they never clicked into history
 * and make Back bounce between the list and it.
 *
 * Once only. After this the absence of `at` means the user cleared the
 * selection, and reasserting it would take away the way out.
 */
let restoredLastSelection = false;
watch(
  [() => route.query.at, index],
  ([at, idx]) => {
    if (restoredLastSelection || typeof at === "string") return;
    const remembered = ui.locationsLastSelectedId;
    if (!remembered) return;
    // The index is empty until the locations query resolves, and this watcher
    // runs immediately. Treating that first empty tick as "the place is gone"
    // both skips the restore and throws the memory away — so wait for the data
    // before letting the index answer. An account with genuinely no locations
    // renders the empty state, which never reaches here.
    if (idx.byId.size === 0) return;
    restoredLastSelection = true;
    // A remembered id can still outlive the place: deleted, or belonging to a
    // campaign that is no longer the active one. Now that the index is loaded
    // it is the authority, so an id it does not know is forgotten.
    if (!idx.byId.has(remembered)) {
      ui.locationsLastSelectedId = null;
      return;
    }
    router.replace({ query: { ...route.query, at: remembered } });
  },
  { immediate: true },
);

watch(
  [() => route.query.at, index],
  ([at, idx]) => {
    const id = typeof at === "string" && idx.byId.has(at) ? at : null;
    ui.locationsSelectedId = id;
    // Only remember a real place. Clearing is handled by `clearSelection`, so a
    // null here is either the empty list or an id that no longer resolves —
    // neither of which should overwrite a good memory.
    if (id) {
      ui.locationsLastSelectedId = id;
      restoredLastSelection = true;
    }
    // Opening a place also opens the branch holding it, so dismissing a search
    // leaves the tree showing where you actually are rather than collapsed —
    // and a deep link or a Back lands with its ancestors already unfolded.
    if (id) ui.revealLocationPath(ancestorIds(idx, id));
  },
  { immediate: true },
);

// A selection can outlive the row behind it — the place gets deleted, or the
// campaign scope changes under it. The watcher above already resolves `at`
// against the live index and yields null when it no longer matches, so a stale
// id renders the empty prompt rather than a pane with no way back.

// ── Where a phone lands ─────────────────────────────────────────────────────
// Below lg the tree and the pane take turns on one page that the layout's
// `<main>` scrolls, so a place opened from a row far down the tree used to
// open at that row's depth: halfway through its description, with its name,
// its actions and its Overview/Map tabs all above the fold (4 Oct 2026).
// Opening a place starts at its top. Going back to "All places" puts the tree
// where it was, because the row the DM tapped is where they were reading.
const isBelowLg = useBelow("lg");
const paneColumn = useTemplateRef<HTMLElement>("paneColumn");
let treeScrollTop = 0;
watch(selectedId, async (id, previous) => {
  if (!isBelowLg.value || !paneColumn.value || id === previous) return;
  const scroller = scrollParentOf(paneColumn.value);
  if (!scroller) return;
  if (id && !previous) treeScrollTop = scroller.scrollTop;
  await nextTick();
  scroller.scrollTop = id ? 0 : treeScrollTop;
});
</script>
