<template>
  <div>
    <BulkScopeBar
      v-if="bulk.selecting.value && !selectMode"
      :count="bulk.count.value"
      :selectable-count="selectableIds.length"
      :busy="bulkMoving"
      :campaign-name="activeCampaign?.name ?? null"
      class="mb-3"
      @select-all="selectAllShown"
      @clear="bulk.clear"
      @stop="bulk.stop"
      @move="moveSelection"
      @copy="openCopyDialog"
    />

    <ListSkeleton v-if="isLoading" :variant="layout === 'rows' ? 'rows' : 'grid'" :count="12" />

    <!-- Nothing to pick: the DM disabled every species for this campaign. The
         codex CTA below is DM-only, so select mode gets its own message. -->
    <EmptyState
      v-else-if="!filtered.length && !speciesUi.speciesHasActiveFilters && selectMode"
      title="No species available"
      description="Your DM hasn't enabled any species for this campaign yet."
    />

    <EmptyState
      v-else-if="!filtered.length && !speciesUi.speciesHasActiveFilters"
      title="No species yet"
      description="Build your own or import from Open5e."
    >
      <template #action>
        <AppButton variant="primary" size="lg" to="/species/new" label="Add your first species" />
      </template>
    </EmptyState>

    <p
      v-else-if="!filtered.length"
      class="text-center text-body text-muted-foreground italic py-12"
    >
      No species match your filters.
    </p>

    <EntityCollection
      v-else
      :items="filtered"
      :item-key="speciesKey"
      :layout="layout"
      :grid-columns="columns"
      :grid-row-estimate="GRID_ROW_PX"
    >
      <template #card="{ item: s }">
        <BulkSelectableCard
          corner="top-right"
          :selected="bulk.isSelected(s.id)"
          :selecting="bulk.selecting.value && !selectMode && isUuid(s.id)"
          @toggle="bulk.toggle(s.id)"
        >
          <OptionGridCard
            :to="`/species/${s.id}`"
            :title="s.name"
            :image-url="s.image_url"
            :focal-point="s.focal_point"
            :placeholder="placeholderUrl('species')"
            :select-mode="selectMode"
            :selected="!!selectedId && s.id === selectedId"
            :edit-to="!readonly && isUuid(s.id) ? `/species/${s.id}?edit=true` : null"
            edit-label="Edit species"
            @select="emit('select', s)"
          >
            <h3 class="line-clamp-1 text-heading-xs leading-tight font-bold text-foreground">{{ s.name }}</h3>
            <p class="text-caption text-muted-foreground italic">{{ speciesSubtitle(s) }}</p>
            <p v-if="s.source" class="text-label text-muted-foreground">{{ s.source }}</p>
            <div v-if="s.tags.length" class="mt-auto flex flex-wrap gap-1 pt-1">
              <span
                v-for="tag in s.tags.slice(0, 3)"
                :key="tag"
                class="rounded bg-muted px-1.5 py-0.5 text-label text-muted-foreground"
              >{{ tag }}</span>
            </div>
          </OptionGridCard>
        </BulkSelectableCard>
      </template>
      <template #row="{ item: s }">
        <BulkSelectableCard
          corner="top-right"
          :selected="bulk.isSelected(s.id)"
          :selecting="bulk.selecting.value && !selectMode && isUuid(s.id)"
          @toggle="bulk.toggle(s.id)"
        >
          <EntityListRow
            :to="`/species/${s.id}`"
            :title="s.name"
            :subtitle="speciesSubtitle(s)"
            :image-url="s.image_url"
            :fallback-icon="IconSpecies"
            :tags="s.tags"
          >
            <template v-if="!readonly && isUuid(s.id)" #actions>
              <AppButton
                variant="ghost"
                size="icon-xs"
                :icon="IconEdit"
                :to="`/species/${s.id}?edit=true`"
                tooltip="Edit species"
                aria-label="Edit species"
              />
            </template>
          </EntityListRow>
        </BulkSelectableCard>
      </template>
    </EntityCollection>

    <p
      v-if="filtered.length"
      class="mt-4 text-caption text-muted-foreground italic text-right"
    >
      {{ filtered.length }} species
    </p>
  </div>

  <CopyToCampaignDialog
    :open="copyOpen"
    table="species"
    :ids="copyIds"
    label="species"
    label-plural="species"
    @close="copyOpen = false"
    @copied="onCopied"
  />
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { IconEdit, IconSpecies } from '@/lib/icons';
import type { Species } from "@/types/species.types";
import { useSpeciesUiStore } from "@/stores/ui/species";
import { useCampaignSpecies } from "@/composables/rules/useSpecies";
import { isUuid } from "@/lib/library/contentIdentity";
import { allowedSpecies } from "@/lib/campaignContentGating";
import { useScrollRestore } from "@/composables/useScrollRestore";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import { useListLayout } from "@/composables/useListLayout";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import EntityCollection from "@/components/common/list/EntityCollection.vue";
import EntityListRow from "@/components/common/entity/EntityListRow.vue";
import OptionGridCard from "@/components/common/entity/OptionGridCard.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { storeToRefs } from "pinia";
import BulkScopeBar from "@/components/common/list/BulkScopeBar.vue";
import BulkSelectableCard from "@/components/common/list/BulkSelectableCard.vue";
import CopyToCampaignDialog from "@/components/common/overlays/CopyToCampaignDialog.vue";
import { useBulkSelection } from "@/composables/useBulkSelection";
import { useCopyToCampaignFlow } from "@/composables/campaign/useCopyToCampaignFlow";
import { useMoveToCampaignFlow } from "@/composables/campaign/useMoveToCampaignFlow";
import { useCampaignStore } from "@/stores/campaign";

const { selectMode } = defineProps<{ readonly?: boolean; selectMode?: boolean; selectedId?: string }>();
const emit = defineEmits<{ select: [species: Species] }>();

const speciesUi = useSpeciesUiStore();
const { activeCampaign, activeCampaignId } = storeToRefs(useCampaignStore());
// Picking (select mode) obeys the campaign's blocklist; browsing the codex does
// not, because the DM still needs to open and edit a species they switched off
// (#566). Browsing still obeys exclusivity: a species scoped to another campaign
// is that campaign's, and listing it here put the demo template's copies of a
// species beside the originals they were copied from.
const { data: campaignSpecies, all: allSpecies, isLoading } = useCampaignSpecies();
const browsableSpecies = computed(() =>
  allowedSpecies(allSpecies.value, { campaignId: activeCampaignId.value, disabledIds: undefined }),
);

const filtered = computed(() => {
  let list = selectMode ? campaignSpecies.value : browsableSpecies.value;

  if (speciesUi.speciesFilterSize !== "all") {
    list = list.filter((s) => s.size === speciesUi.speciesFilterSize);
  }

  if (speciesUi.speciesFilterSource !== "all") {
    const q = speciesUi.speciesFilterSource.toLowerCase();
    list = list.filter((s) => s.source?.toLowerCase().includes(q));
  }

  if (speciesUi.speciesSearch.trim()) {
    const q = speciesUi.speciesSearch.trim().toLowerCase();
    list = list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.source?.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  return list;
});

// The whole filtered list is in hand, so only the scroll position needs
// restoring; VirtualGrid windows what is mounted.
useScrollRestore("species");

// Mirrors the grid classes this list used to carry:
// `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3`.
const columns = useBreakpointColumns({ base: 1, sm: 2, lg: 3, xl: 4 });
const speciesKey = (species: Species) => species.id;

// The Codex header's toggle writes the same key. The player's picker has no
// toggle and selecting happens on a card, so it always shows the grid.
const storedLayout = useListLayout("codex-species", "grid");
const layout = computed(() => (selectMode ? "grid" : storedLayout.value));

function speciesSubtitle(s: Species): string {
  const size = s.size ? s.size.charAt(0).toUpperCase() + s.size.slice(1) : "—";
  return s.speed?.walk ? `${size} · ${s.speed.walk} ft` : size;
}

// Row height before a row is measured (px): 252px measured at a 390px
// phone, 8 Oct 2026. It decides where a restored scroll lands, since coming
// back from a detail re-renders every unmeasured row above the viewport.
const GRID_ROW_PX = 252;

// ── Bulk selection (#875) — the DM's codex tool ─────────────────────────────
//
// Named and gated apart from the player picker's own `selectMode`/`select`
// (added earlier for `PlayerSpeciesPickerView`, a single-pick flow with a
// different meaning): `bulk` is a separate composable instance, every
// bulk-affordance is additionally gated on `!selectMode`, and a card's
// `selecting` prop is only ever true when `selectMode` is falsy — so the
// picker keeps emitting `select` on a plain click exactly as before, and the
// bulk tool never renders while a player is picking. Shared/library species
// (a slug id rather than a uuid, `isUuid(s.id)`) are excluded from selection —
// the same distinction the Edit button above already uses.
const bulk = useBulkSelection();

// Every row a bulk move may legally touch: passes the current filters and
// has a real uuid (not shared/library content). Reused by "select all" and
// by the prune below, so both always agree on what's selectable.
const selectableIds = computed(() => filtered.value.filter((s) => isUuid(s.id)).map((s) => s.id));

// The filters (or `selectMode`/campaign switch) can change while rows are
// selected; prune whenever the selectable set changes so a stale id from a
// now-hidden row never lingers in the selection or reaches the mutation
// (#875).
watch(selectableIds, (ids) => bulk.pruneTo(ids));

function selectAllShown() {
  bulk.selectAll(selectableIds.value);
}

// "Species" is its own plural — passed as `nounPlural` so the toast doesn't
// need its own noun-count branch.
const { moving: bulkMoving, move: moveSelection } = useMoveToCampaignFlow({
  table: "species",
  noun: "species",
  nounPlural: "species",
  selectableIds: () => selectableIds.value,
  pruneTo: bulk.pruneTo,
  stop: bulk.stop,
  campaignName: () => activeCampaign.value?.name ?? null,
});

function toggleBulkSelectMode() {
  if (selectMode) return; // the player picker never enters bulk mode
  if (bulk.selecting.value) bulk.stop();
  else bulk.selecting.value = true;
}

// ── Copy to campaign (#598) ─────────────────────────────────────────────────
//
// Same pruning discipline as moveSelection: the selection can go stale
// (refetch, filter edit) between the bar's click and the dialog opening, so
// it's pruned to what's still shown before the dialog ever sees the ids
// (#875, applies identically to copy) — `useCopyToCampaignFlow` owns that.
// species carries no enforce_quota trigger, so unlike monsters there's no
// quota-exceeded callback to wire here. "Species" is its own plural, passed
// as `nounPlural` so the toast doesn't need its own noun-count branch.
const {
  copyOpen,
  copyIds,
  openCopy: openCopyDialog,
  onCopied,
} = useCopyToCampaignFlow({
  noun: "species",
  nounPlural: "species",
  selectableIds: () => selectableIds.value,
  pruneTo: bulk.pruneTo,
  stop: bulk.stop,
});

defineExpose({ bulkSelecting: bulk.selecting, toggleBulkSelectMode });
</script>
