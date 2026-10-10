<template>
  <ListPageLayout title="Vault" description="Your mundane equipment and magic items">
    <template #title-suffix>
      <ManualHelpLink page="vault-overview" />
    </template>

    <template #actions>
      <!-- Sources panel — per-campaign library selection, DB-backed so it persists -->
      <SourcesPickerPanel
        title="Item Sources"
        description="Enabled sources appear in your Vault instantly. No download needed."
        empty-message="No sources available yet. Ask your admin to seed the library_items table."
        :available-sources="availableSourceData"
        :is-loading="sourcesLoading"
      >
        <template #trigger="{ open: pickerOpen, toggle }">
          <AppButton
            variant="subtle"
            size="icon-sm"
            :active="pickerOpen"
            :icon="IconLibrary"
            class="shrink-0"
            tooltip="Manage item sources for this campaign"
            @click="toggle"
          />
        </template>
      </SourcesPickerPanel>

      <ListActionButton
        :icon="IconListTodo"
        :label="selecting ? 'Done' : 'Select'"
        :active="selecting"
        :collapse-label-on-mobile="false"
        @click="toggleSelecting"
      />
      <ListActionButton
        v-if="isAiEnabled"
        :icon="IconGenerate"
        label="Generate"
        @click="itemsUi.itemGeneratorOpen = true"
      />
      <ListActionButton
        variant="primary"
        :icon="IconAdd"
        label="New Item"
        mobile-label="Item"
        to="/vault/new"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="hasActiveFilters"
        @clear="clearFilters"
      >
        <ListSearchInput v-model="search" placeholder="Search items…" />
        <ListFilterSelect v-model="typeFilter" aria-label="Item type filter">
          <option value="">All types</option>
          <option v-for="t in ITEM_TYPES" :key="t" :value="t">{{ ITEM_TYPE_LABELS[t] }}</option>
        </ListFilterSelect>
        <ListFilterSelect v-model="rarityFilter" aria-label="Rarity filter">
          <option value="">All rarities</option>
          <option v-for="r in ITEM_RARITIES" :key="r" :value="r">{{ ITEM_RARITY_LABELS[r] }}</option>
        </ListFilterSelect>
        <ListFilterSelect v-if="sources.length" v-model="sourceFilter" aria-label="Source filter">
          <option value="">All sources</option>
          <option v-for="s in sources" :key="s.slug" :value="s.slug">{{ itemSourceLabel(s.slug, s.title) }}</option>
        </ListFilterSelect>
        <ListFilterSelect v-model="scopeFilter" aria-label="Scope filter">
          <option value="">Usable here</option>
          <option value="campaign">This campaign</option>
          <option value="general">General</option>
          <option value="library">Library</option>
          <option value="other_campaign">Other campaigns</option>
        </ListFilterSelect>
      </ListFilterBar>
    </template>

    <BulkScopeBar
      v-if="selecting"
      :count="selectedCount"
      :selectable-count="(itemListRef?.selectableIds ?? []).length"
      :busy="isMovingScope"
      :campaign-name="campaignStore.activeCampaign?.name ?? null"
      @select-all="selectAll(itemListRef?.selectableIds ?? [])"
      @clear="clearSelection"
      @stop="stopSelecting"
      @move="handleMove"
      @copy="handleCopyOpen"
    />
    <CopyToCampaignDialog
      :open="copyOpen"
      table="items"
      :ids="copyIds"
      label="item"
      @close="copyOpen = false"
      @copied="onCopied"
    />
    <ItemList
      ref="itemListRef"
      :search="search"
      :type-filter="typeFilter"
      :rarity-filter="rarityFilter"
      :source-filter="sourceFilter"
      :scope-filter="scopeFilter"
      :selecting="selecting"
      :selected-ids="selectedIds"
      @toggle-select="toggleRowSelection"
    />
  </ListPageLayout>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IconAdd, IconGenerate, IconLibrary, IconListTodo } from '@/lib/icons';
import ListPageLayout from "@/components/common/list/ListPageLayout.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ListActionButton from "@/components/common/list/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import ListFilterBar from "@/components/common/list/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/list/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/list/ListSearchInput.vue";
import ItemList from "@/components/items/ItemList.vue";
import BulkScopeBar from "@/components/common/list/BulkScopeBar.vue";
import CopyToCampaignDialog from "@/components/common/overlays/CopyToCampaignDialog.vue";
import SourcesPickerPanel from "@/components/common/settings/SourcesPickerPanel.vue";
import { ITEM_TYPES, ITEM_TYPE_LABELS, ITEM_RARITIES, ITEM_RARITY_LABELS, itemSourceLabel } from "@/types/item.types";
import { useItemsUiStore } from "@/stores/ui/items";
import { useAvailableLibraryItemSources } from "@/composables/library/useEnabledSources";
import { useBulkSelection } from "@/composables/useBulkSelection";
import { useCopyToCampaignFlow } from "@/composables/campaign/useCopyToCampaignFlow";
import { useMoveToCampaignFlow } from "@/composables/campaign/useMoveToCampaignFlow";
import { useCampaignStore } from "@/stores/campaign";

const itemsUi = useItemsUiStore();
const search = computed({
  get: () => itemsUi.vaultSearch,
  set: (v) => { itemsUi.vaultSearch = v; },
});
const typeFilter = computed({
  get: () => itemsUi.vaultFilterType,
  set: (v) => { itemsUi.vaultFilterType = v; },
});
const rarityFilter = computed({
  get: () => itemsUi.vaultFilterRarity,
  set: (v) => { itemsUi.vaultFilterRarity = v; },
});
const sourceFilter = computed({
  get: () => itemsUi.vaultFilterSource,
  set: (v) => { itemsUi.vaultFilterSource = v; },
});
const scopeFilter = computed({
  get: () => itemsUi.vaultFilterScope,
  set: (v) => { itemsUi.vaultFilterScope = v; },
});

const hasActiveFilters = computed(() => itemsUi.vaultHasActiveFilters);
function clearFilters() { itemsUi.resetVaultFilters(); }

// ── Sources panel ────────────────────────────────────────────────────────────
// The enable/disable wiring (campaign-scoped) now lives inside SourcesPickerPanel.
const { data: availableSourceData, isLoading: sourcesLoading } = useAvailableLibraryItemSources();

// ── Bulk move-to-campaign (#875) ─────────────────────────────────────────────
const {
  selecting,
  selectedIds,
  count: selectedCount,
  toggle: toggleRowSelection,
  selectAll,
  clear: clearSelection,
  stop: stopSelecting,
  pruneTo,
} = useBulkSelection();
const campaignStore = useCampaignStore();
const isAiEnabled = computed(() => campaignStore.isAiEnabled);
const itemListRef = ref<InstanceType<typeof ItemList> | null>(null);
// The Source filter's options come from the same server page the grid shows.
const sources = computed(() => itemListRef.value?.sources ?? []);

function toggleSelecting() {
  if (selecting.value) stopSelecting();
  else selecting.value = true;
}

// The selection lives here, but which ids are still selectable is decided by
// ItemList's own filters — a search/type/rarity edit there can leave this
// selection holding an id for a row no longer shown. Prune whenever that
// exposed set changes (#875).
// Not while the first page is still loading: its empty stand-in would wipe the
// selection.
watch(
  () => (itemListRef.value?.ready ? itemListRef.value.selectableIds : null),
  (ids) => {
    if (ids) pruneTo(ids);
  },
);

const { moving: isMovingScope, move: handleMove } = useMoveToCampaignFlow({
  table: "items",
  noun: "item",
  selectableIds: () => itemListRef.value?.selectableIds ?? [],
  pruneTo,
  stop: stopSelecting,
  campaignName: () => campaignStore.activeCampaign?.name ?? null,
});

// ── Bulk copy-to-campaign (#598) ──────────────────────────────────────────────
// Unlike move, the source scope for a copy is always the active campaign —
// the list shows the active campaign's rows plus general ones, and the one
// destination never wanted is the campaign the DM is already standing in.
const { copyOpen, copyIds, openCopy: handleCopyOpen, onCopied } = useCopyToCampaignFlow({
  noun: "item",
  selectableIds: () => itemListRef.value?.selectableIds ?? [],
  pruneTo,
  stop: stopSelecting,
});
</script>
