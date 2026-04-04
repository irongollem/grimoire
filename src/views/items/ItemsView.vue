<template>
  <PageHeader title="Vault" description="Your mundane equipment and magic items">
    <template #actions>
      <button
        type="button"
        :disabled="importMutation.isPending.value"
        class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
        @click="handleImport"
      >
        <Loader2 v-if="importMutation.isPending.value" class="size-3.5 animate-spin shrink-0" />
        <Download v-else class="size-3.5 shrink-0" />
        {{ importStatusLabel }}
      </button>
      <RouterLink
        to="/vault/new"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
      >
        + New Item
      </RouterLink>
    </template>

    <template #sticky>
      <div class="flex items-center gap-2 flex-wrap">
        <div class="relative flex-1 min-w-40">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            v-model="search"
            type="text"
            placeholder="Search items…"
            class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <select
          v-model="typeFilter"
          class="bg-card border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All types</option>
          <option v-for="t in ITEM_TYPES" :key="t" :value="t">{{ ITEM_TYPE_LABELS[t] }}</option>
        </select>
        <select
          v-model="rarityFilter"
          class="bg-card border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All rarities</option>
          <option v-for="r in ITEM_RARITIES" :key="r" :value="r">{{ ITEM_RARITY_LABELS[r] }}</option>
        </select>
        <button
          v-if="hasActiveFilters"
          type="button"
          class="px-2.5 py-1.5 rounded-md border border-border bg-card font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          @click="clearFilters"
        >
          Clear
        </button>
      </div>
    </template>

    <ItemList :search="search" :type-filter="typeFilter" :rarity-filter="rarityFilter" />
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Loader2, Download, Search } from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
import ItemList from "@/components/items/ItemList.vue";
import { useImportSrdItems } from "@/composables/useItems";
import { ITEM_TYPES, ITEM_TYPE_LABELS, ITEM_RARITIES, ITEM_RARITY_LABELS } from "@/types/item.types";
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

const hasActiveFilters = computed(() => ui.vaultHasActiveFilters);
function clearFilters() { ui.resetVaultFilters(); }

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
