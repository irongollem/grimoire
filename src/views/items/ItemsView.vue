<template>
  <!-- ══ Desktop (≥md): existing ListPageLayout chrome — unchanged ══════════ -->
  <ListPageLayout
    v-if="!isMobile"
    title="Vault"
    description="Your mundane equipment and magic items"
  >
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
          <span class="font-cinzel text-[11px] tracking-wider text-muted-foreground">Show items from all campaigns</span>
        </label>
      </ListFilterBar>
    </template>

    <ItemList :search="search" :type-filter="typeFilter" :rarity-filter="rarityFilter" :source-filter="sourceFilter" :show-all-scopes="showAllScopes" />
  </ListPageLayout>

  <!-- ══ Mobile (<md): purpose-built list chrome ═══════════════════════════ -->
  <div v-else class="flex h-full flex-col">
    <div class="shrink-0 px-4 pt-3">
      <!-- Search row: search input + Filters button + overflow ⋮ -->
      <div class="flex items-center gap-2">
        <div class="relative min-w-0 flex-1">
          <IconSearch
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            v-model="search"
            type="search"
            inputmode="search"
            placeholder="Search items…"
            class="h-11 w-full rounded-full border border-border bg-card pl-9 pr-9 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            v-if="search"
            type="button"
            class="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
            @click="search = ''"
          >
            <IconClose class="size-4" />
          </button>
        </div>

        <button
          type="button"
          class="relative flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground"
          aria-label="Filters"
          @click="filtersOpen = true"
        >
          <IconFilter class="size-5" />
          <span
            v-if="activeFilterCount"
            class="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 font-cinzel text-2xs font-bold text-primary-foreground"
          >
            {{ activeFilterCount }}
          </span>
        </button>

        <button
          type="button"
          class="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground"
          aria-label="More actions"
          @click="overflowOpen = true"
        >
          <!-- Vertical ⋮ — no kebab glyph in the icon set, so render inline -->
          <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>
      </div>

      <!-- Active-filter chips (wrap, no horizontal scroll) -->
      <div v-if="activeChips.length" class="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          v-for="chip in activeChips"
          :key="chip.key"
          type="button"
          class="inline-flex items-center gap-1 rounded-full border border-border bg-card py-1 pl-2.5 pr-1.5 font-fell text-xs text-foreground"
          @click="chip.clear()"
        >
          {{ chip.label }}
          <IconClose class="size-3 text-muted-foreground" />
        </button>
        <button
          type="button"
          class="font-cinzel text-xs font-semibold tracking-wider text-primary"
          @click="clearFilters"
        >
          Clear all
        </button>
      </div>
    </div>

    <!-- List body (scrolls). The docked DM bottom nav owns the create "+"
         (Prep mode), so this view has no bottom New bar. The shell's <main>
         already reserves space for the docked bar. -->
    <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-1">
      <ItemList :search="search" :type-filter="typeFilter" :rarity-filter="rarityFilter" :source-filter="sourceFilter" :show-all-scopes="showAllScopes" />
    </div>

    <!-- Filters bottom sheet -->
    <MobileSheet v-model:open="filtersOpen" title="Filter items">
      <div class="flex flex-col gap-4 py-1">
        <div>
          <p class="mb-1.5 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">Type</p>
          <ListFilterSelect v-model="typeFilter" class="w-full" aria-label="Item type filter">
            <option value="">All types</option>
            <option v-for="t in ITEM_TYPES" :key="t" :value="t">{{ ITEM_TYPE_LABELS[t] }}</option>
          </ListFilterSelect>
        </div>
        <div>
          <p class="mb-1.5 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">Rarity</p>
          <ListFilterSelect v-model="rarityFilter" class="w-full" aria-label="Rarity filter">
            <option value="">All rarities</option>
            <option v-for="r in ITEM_RARITIES" :key="r" :value="r">{{ ITEM_RARITY_LABELS[r] }}</option>
          </ListFilterSelect>
        </div>
        <div v-if="sources?.length">
          <p class="mb-1.5 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">Source</p>
          <ListFilterSelect v-model="sourceFilter" class="w-full" aria-label="Source filter">
            <option value="">All sources</option>
            <option v-for="s in sources" :key="s.slug" :value="s.slug">{{ itemSourceLabel(s.slug, s.title) }}</option>
          </ListFilterSelect>
        </div>
        <label class="flex cursor-pointer items-center gap-2">
          <input type="checkbox" v-model="showAllScopes" class="size-4 rounded border-border accent-primary" />
          <span class="font-fell text-sm text-foreground">Show items from all campaigns</span>
        </label>
      </div>

      <template #footer>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="h-11 flex-1 rounded-xl border border-border bg-card font-cinzel text-sm font-semibold tracking-wider text-muted-foreground"
            @click="clearFilters"
          >
            Clear all
          </button>
          <button
            type="button"
            class="h-11 flex-1 rounded-xl bg-primary font-cinzel text-sm font-semibold tracking-wider text-primary-foreground"
            @click="filtersOpen = false"
          >
            Done
          </button>
        </div>
      </template>
    </MobileSheet>

    <!-- Overflow ⋮ sheet -->
    <MobileSheet v-model:open="overflowOpen" title="More">
      <div class="flex flex-col gap-1 py-1">
        <button
          type="button"
          class="flex items-center gap-3 rounded-lg px-2 py-3 text-left font-fell text-sm text-foreground hover:bg-muted/50"
          @click="overflowOpen = false; ui.itemGeneratorOpen = true"
        >
          <IconGenerate class="size-5 shrink-0 text-muted-foreground" /> Generate
        </button>
        <button
          type="button"
          :disabled="importMutation.isPending.value"
          class="flex items-center gap-3 rounded-lg px-2 py-3 text-left font-fell text-sm text-foreground hover:bg-muted/50 disabled:opacity-50"
          @click="overflowOpen = false; handleImport()"
        >
          <component :is="importMutation.isPending.value ? IconLoading : IconDownload" class="size-5 shrink-0 text-muted-foreground" />
          {{ importStatusLabel }}
        </button>
      </div>
    </MobileSheet>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { IconAdd, IconClose, IconDownload, IconGenerate, IconLoading, IconSearch, IconSettings } from '@/lib/icons';
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import ItemList from "@/components/items/ItemList.vue";
import { useImportSrdItems, useItemSources } from "@/composables/useItems";
import { ITEM_TYPES, ITEM_TYPE_LABELS, ITEM_RARITIES, ITEM_RARITY_LABELS, itemSourceLabel } from "@/types/item.types";
import { useUiStore } from "@/stores/ui";

// IconSettings (sliders) reads as "filters". The overflow ⋮ has no kebab glyph
// in the icon set, so it is rendered as an inline SVG in the template.
const IconFilter = IconSettings;

const isMobile = useMediaQuery("(max-width: 767px)");
const filtersOpen = ref(false);
const overflowOpen = ref(false);

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

// ── Mobile filter chrome ────────────────────────────────────────────────────

const typeLabel = (v: string) => ITEM_TYPE_LABELS[v as keyof typeof ITEM_TYPE_LABELS] ?? v;
const rarityLabel = (v: string) => ITEM_RARITY_LABELS[v as keyof typeof ITEM_RARITY_LABELS] ?? v;
const sourceLabel = (slug: string) =>
  sources.value?.find((s) => s.slug === slug)
    ? itemSourceLabel(slug, sources.value.find((s) => s.slug === slug)?.title)
    : slug;

// One chip per active filter; each removes only its own filter.
const activeChips = computed(() => {
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (search.value) chips.push({ key: "search", label: `"${search.value}"`, clear: () => { search.value = ""; } });
  if (typeFilter.value) chips.push({ key: "type", label: typeLabel(typeFilter.value), clear: () => { typeFilter.value = ""; } });
  if (rarityFilter.value) chips.push({ key: "rarity", label: rarityLabel(rarityFilter.value), clear: () => { rarityFilter.value = ""; } });
  if (sourceFilter.value) chips.push({ key: "source", label: sourceLabel(sourceFilter.value), clear: () => { sourceFilter.value = ""; } });
  if (showAllScopes.value) chips.push({ key: "scopes", label: "All campaigns", clear: () => { showAllScopes.value = false; } });
  return chips;
});

// Badge count on the Filters button (search is shown as its own chip, so it is
// excluded here to keep the badge reflecting "filters" not "search").
const activeFilterCount = computed(() =>
  activeChips.value.filter((c) => c.key !== "search").length,
);
</script>
