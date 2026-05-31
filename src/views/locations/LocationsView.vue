<template>
  <!-- ══ Desktop (≥md): existing ListPageLayout chrome — unchanged ══════════ -->
  <ListPageLayout
    v-if="!isMobile"
    title="Atlas"
    description="Continents, cities, dungeons, and every place in between"
  >
    <template #actions>
      <ListActionButton
        :icon="planarMutation.isPending.value ? IconLoading : IconFaction"
        :label="planarStatusLabel"
        :disabled="planarMutation.isPending.value"
        @click="handlePopulatePlanes"
      />
      <ListActionButton
        :icon="populateMutation.isPending.value ? IconLoading : IconPopulate"
        :label="populateStatusLabel"
        :disabled="populateMutation.isPending.value"
        @click="handlePopulate"
      />
      <ListActionButton
        :icon="IconGenerate"
        label="Generate"
        @click="ui.locationGeneratorOpen = true"
      />
      <ListActionButton
        :icon="IconAdd"
        label="New Location"
        mobile-label="Location"
        variant="primary"
        to="/locations/new"
      />
    </template>

    <template #filters>
      <ListFilterBar>
        <ListSearchInput v-model="search" placeholder="Search locations…" />
        <ListFilterSelect v-model="typeFilter" aria-label="Location type filter">
          <option v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </ListFilterSelect>
      </ListFilterBar>
    </template>

    <LocationList :search="search" :type-filter="typeFilter" />
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
            placeholder="Search locations…"
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
          <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>
      </div>

      <!-- Active-filter chips -->
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

    <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-1">
      <LocationList :search="search" :type-filter="typeFilter" />
    </div>

    <!-- Filters bottom sheet -->
    <MobileSheet v-model:open="filtersOpen" title="Filter Locations">
      <div class="flex flex-col gap-4 py-1">
        <div>
          <p class="mb-1.5 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">Type</p>
          <ListFilterSelect v-model="typeFilter" aria-label="Location type filter" class="w-full">
            <option v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </ListFilterSelect>
        </div>
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
          @click="overflowOpen = false; ui.locationGeneratorOpen = true"
        >
          <IconGenerate class="size-5 shrink-0 text-muted-foreground" /> Generate
        </button>
        <button
          type="button"
          :disabled="populateMutation.isPending.value"
          class="flex items-center gap-3 rounded-lg px-2 py-3 text-left font-fell text-sm text-foreground hover:bg-muted/50 disabled:opacity-50"
          @click="overflowOpen = false; handlePopulate()"
        >
          <component :is="populateMutation.isPending.value ? IconLoading : IconPopulate" class="size-5 shrink-0 text-muted-foreground" />
          {{ populateStatusLabel }}
        </button>
        <button
          type="button"
          :disabled="planarMutation.isPending.value"
          class="flex items-center gap-3 rounded-lg px-2 py-3 text-left font-fell text-sm text-foreground hover:bg-muted/50 disabled:opacity-50"
          @click="overflowOpen = false; handlePopulatePlanes()"
        >
          <component :is="planarMutation.isPending.value ? IconLoading : IconFaction" class="size-5 shrink-0 text-muted-foreground" />
          {{ planarStatusLabel }}
        </button>
      </div>
    </MobileSheet>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { IconAdd, IconClose, IconFaction, IconGenerate, IconLoading, IconPopulate, IconSearch, IconSettings } from '@/lib/icons';
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import LocationList from "@/components/locations/LocationList.vue";
import { usePopulateLocations, usePopulatePlanarLocations } from "@/composables/useLocations";
import { useUiStore } from "@/stores/ui";
import { LOCATION_TYPE_LABELS } from "@/types/location.types";

// IconSettings (sliders) reads as "filters".
const IconFilter = IconSettings;

const ui = useUiStore();
const isMobile = useMediaQuery("(max-width: 767px)");

const filtersOpen = ref(false);
const overflowOpen = ref(false);

// Filter state — local refs (locations has no ui-store filter state).
const search = ref("");
const typeFilter = ref("all");

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  ...Object.entries(LOCATION_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

const populateMutation = usePopulateLocations();
const populateStatus = ref<"idle" | "done" | "uptodate">("idle");
const populatedCount = ref(0);
const populateError = ref<string | null>(null);

const populateStatusLabel = computed(() => {
  if (populateMutation.isPending.value) return "Populating…";
  if (populateError.value) return `Error: ${populateError.value}`;
  if (populateStatus.value === "done") return `Added ${populatedCount.value} locations`;
  if (populateStatus.value === "uptodate") return "Already up to date";
  return "Populate Setting";
});

async function handlePopulate() {
  populateStatus.value = "idle";
  populateError.value = null;
  try {
    const count = await populateMutation.mutateAsync();
    populatedCount.value = count;
    populateStatus.value = count === 0 ? "uptodate" : "done";
  } catch (e) {
    populateError.value = e instanceof Error ? e.message : String(e);
  }
  setTimeout(() => {
    populateStatus.value = "idle";
    populateError.value = null;
  }, 8000);
}

const planarMutation = usePopulatePlanarLocations();
const planarStatus = ref<"idle" | "done" | "uptodate">("idle");
const planarCount = ref(0);
const planarError = ref<string | null>(null);

const planarStatusLabel = computed(() => {
  if (planarMutation.isPending.value) return "Populating…";
  if (planarError.value) return `Error: ${planarError.value}`;
  if (planarStatus.value === "done") return `Added ${planarCount.value} planes`;
  if (planarStatus.value === "uptodate") return "Planes up to date";
  return "Populate Planes";
});

async function handlePopulatePlanes() {
  planarStatus.value = "idle";
  planarError.value = null;
  try {
    const count = await planarMutation.mutateAsync();
    planarCount.value = count;
    planarStatus.value = count === 0 ? "uptodate" : "done";
  } catch (e) {
    planarError.value = e instanceof Error ? e.message : String(e);
  }
  setTimeout(() => {
    planarStatus.value = "idle";
    planarError.value = null;
  }, 8000);
}

function clearFilters() {
  search.value = "";
  typeFilter.value = "all";
}

const typeLabel = (v: string) => TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;

const activeChips = computed(() => {
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (search.value) chips.push({ key: "search", label: `"${search.value}"`, clear: () => { search.value = ""; } });
  if (typeFilter.value !== "all") chips.push({ key: "type", label: typeLabel(typeFilter.value), clear: () => { typeFilter.value = "all"; } });
  return chips;
});

const activeFilterCount = computed(() =>
  activeChips.value.filter((c) => c.key !== "search").length,
);
</script>
