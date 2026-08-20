<template>
  <ListPageLayout title="Vault" description="Your mundane equipment and magic items">
    <template #title-suffix>
      <ManualHelpLink page="vault-overview" />
    </template>

    <template #actions>
      <!-- Sources panel — per-campaign library selection, DB-backed so it persists -->
      <SourcesPickerPanel
        title="Item Sources"
        description="Enabled sources appear in your Vault instantly — no download needed."
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
        :icon="IconGenerate"
        label="Generate"
        @click="ui.itemGeneratorOpen = true"
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
        <ListFilterSelect v-if="sources?.length" v-model="sourceFilter" aria-label="Source filter">
          <option value="">All sources</option>
          <option v-for="s in sources" :key="s.slug" :value="s.slug">{{ itemSourceLabel(s.slug, s.title) }}</option>
        </ListFilterSelect>
        <label class="inline-flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" v-model="showAllScopes" class="rounded" />
          <span class="text-label-lg text-muted-foreground">Show items from all campaigns</span>
        </label>
      </ListFilterBar>
    </template>

    <ItemList :search="search" :type-filter="typeFilter" :rarity-filter="rarityFilter" :source-filter="sourceFilter" :show-all-scopes="showAllScopes" />
  </ListPageLayout>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconAdd, IconGenerate, IconLibrary } from '@/lib/icons';
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import AppButton from "@/components/common/AppButton.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import ItemList from "@/components/items/ItemList.vue";
import SourcesPickerPanel from "@/components/common/SourcesPickerPanel.vue";
import { useItemSources } from "@/composables/useItems";
import { ITEM_TYPES, ITEM_TYPE_LABELS, ITEM_RARITIES, ITEM_RARITY_LABELS, itemSourceLabel } from "@/types/item.types";
import { useUiStore } from "@/stores/ui";
import { useAvailableLibraryItemSources } from "@/composables/useEnabledSources";

const ui = useUiStore();
const search = computed({
  get: () => ui.vaultSearch,
  set: (v) => { ui.vaultSearch = v; },
});
const typeFilter = computed({
  get: () => ui.vaultFilterType,
  set: (v) => { ui.vaultFilterType = v; },
});
const rarityFilter = computed({
  get: () => ui.vaultFilterRarity,
  set: (v) => { ui.vaultFilterRarity = v; },
});
const sourceFilter = computed({
  get: () => ui.vaultFilterSource,
  set: (v) => { ui.vaultFilterSource = v; },
});
const showAllScopes = computed({
  get: () => ui.vaultShowAllScopes,
  set: (v) => { ui.vaultShowAllScopes = v; },
});

const hasActiveFilters = computed(() => ui.vaultHasActiveFilters);
function clearFilters() { ui.resetVaultFilters(); }

const { data: sources } = useItemSources();

// ── Sources panel ────────────────────────────────────────────────────────────
// The enable/disable wiring (campaign-scoped) now lives inside SourcesPickerPanel.
const { data: availableSourceData, isLoading: sourcesLoading } = useAvailableLibraryItemSources();
</script>
