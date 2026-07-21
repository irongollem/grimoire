<template>
  <ListPageLayout title="Vault" description="Your mundane equipment and magic items">
    <template #title-suffix>
      <ManualHelpLink page="vault-overview" />
    </template>

    <template #actions>
      <ListActionButton
        :icon="importMutation.isPending.value ? IconLoading : IconDownload"
        :label="importStatusLabel"
        :disabled="importMutation.isPending.value"
        @click="handleImport"
      />
      <ListActionButton
        :icon="IconGenerate"
        label="Generate"
        @click="ui.itemGeneratorOpen = true"
      />
      <ListActionButton
        :icon="IconAdd"
        label="New Item"
        mobile-label="Item"
        variant="primary"
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
import { ref, computed } from "vue";
import { IconAdd, IconDownload, IconGenerate, IconLoading } from '@/lib/icons';
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import ItemList from "@/components/items/ItemList.vue";
import { useImportSrdItems, useItemSources } from "@/composables/useItems";
import { ITEM_TYPES, ITEM_TYPE_LABELS, ITEM_RARITIES, ITEM_RARITY_LABELS, itemSourceLabel } from "@/types/item.types";
import { useUiStore } from "@/stores/ui";

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
const importMutation = useImportSrdItems();

const importStatus = ref<"idle" | "done" | "uptodate">("idle");
const importedCount = ref(0);

const importError = ref<string | null>(null);

const importStatusLabel = computed(() => {
  if (importMutation.isPending.value) return "Importing…";
  if (importError.value) return `Error: ${importError.value}`;
  if (importStatus.value === "done") return `Imported ${importedCount.value} items`;
  if (importStatus.value === "uptodate") return "Already up to date";
  return "Import SRD Items";
});

async function handleImport() {
  importStatus.value = "idle";
  importError.value = null;
  try {
    const count = await importMutation.mutateAsync();
    importedCount.value = count;
    importStatus.value = count === 0 ? "uptodate" : "done";
  } catch (e) {
    importError.value = e instanceof Error ? e.message : String(e);
  }
  setTimeout(() => {
    importStatus.value = "idle";
    importError.value = null;
  }, 8000);
}
</script>
