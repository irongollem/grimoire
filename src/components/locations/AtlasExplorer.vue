<template>
  <div v-if="isLoading" class="flex justify-center py-16">
    <LoadingSpinner />
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

  <div v-else class="flex min-h-0 gap-4 lg:h-full">
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
    <div
      class="min-h-0 min-w-0 flex-1 flex-col lg:max-w-md lg:shrink-0 lg:border-r lg:border-border lg:pr-4"
      :class="selectedId ? 'hidden lg:flex' : 'flex'"
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
      />
    </div>

    <div
      class="min-h-0 min-w-0 flex-1 flex-col"
      :class="selectedId ? 'flex' : 'hidden lg:flex'"
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
      <AtlasPlacePane
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
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import AppButton from "@/components/common/AppButton.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import AtlasPlacePane from "@/components/locations/AtlasPlacePane.vue";
import AtlasTree from "@/components/locations/AtlasTree.vue";
import { useAllLocations } from "@/composables/locations/useLocations";
import { IconChevronLeft, IconNavAtlas } from "@/lib/icons";
import { ancestorIds, buildAtlasIndex } from "@/lib/locations/tree";
import { extractTiptapText } from "@/lib/utils";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const { todayYear } = storeToRefs(useCampaignStore());
const { data: locations, isLoading } = useAllLocations();

const allLocations = computed(() => locations.value ?? []);
const index = computed(() => buildAtlasIndex(allLocations.value));

const selectedId = computed(() => ui.locationsSelectedId);
const selected = computed(() =>
  selectedId.value ? (index.value.byId.get(selectedId.value) ?? null) : null,
);

/**
 * Flat match list, only consulted while a filter is active.
 *
 * Deliberately not paged: the old card grid needed `useInfiniteScroll` because
 * every card mounted a `FocalImage`, and a few hundred of those up front is
 * what made the list slow. These rows are text and a colour dot, so paging them
 * would add machinery to solve a cost that no longer exists.
 */
const matches = computed(() => {
  if (!ui.locationsHasActiveFilters) return [];
  const type = ui.locationsFilterType;
  const q = ui.locationsSearch.trim().toLowerCase();
  return allLocations.value.filter((loc) => {
    if (type !== "all" && loc.location_type !== type) return false;
    if (!q) return true;
    return (
      loc.name.toLowerCase().includes(q) ||
      loc.tags.some((t) => t.toLowerCase().includes(q)) ||
      extractTiptapText(loc.description, 500).toLowerCase().includes(q) ||
      (loc.notes !== null && loc.notes.toLowerCase().includes(q))
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
  if (route.query.at === id) return; // re-clicking the open place is not a new entry
  router.push({ query: { ...route.query, at: id } });
}

function clearSelection() {
  const { at: _discarded, ...rest } = route.query;
  router.push({ query: rest });
}

watch(
  [() => route.query.at, index],
  ([at, idx]) => {
    const id = typeof at === "string" && idx.byId.has(at) ? at : null;
    ui.locationsSelectedId = id;
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
</script>
