<template>
  <!-- ══ Desktop (≥md): existing ListPageLayout chrome — unchanged ══════════ -->
  <ListPageLayout
    v-if="!isMobile"
    title="Factions"
    description="Guilds, cults, governments, and other organisations"
  >
    <template #actions>
      <ListActionButton
        v-if="hasSetting"
        :icon="populateMutation.isPending.value ? IconLoading : IconPopulate"
        :label="populateStatusLabel"
        :disabled="populateMutation.isPending.value"
        @click="handlePopulate"
      />
      <ListActionButton
        :icon="IconGenerate"
        label="Generate"
        @click="ui.factionGeneratorOpen = true"
      />
      <ListActionButton
        :icon="IconAdd"
        label="New Faction"
        mobile-label="Faction"
        variant="primary"
        to="/factions/new"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="ui.factionsHasActiveFilters"
        @clear="ui.resetFactionsFilters()"
      >
        <ListSearchInput v-model="ui.factionsSearch" placeholder="Filter factions…" />
        <ListFilterSelect v-model="ui.factionsFilterType" aria-label="Faction type filter">
          <option value="">All types</option>
          <option v-for="t in FACTION_TYPES" :key="t" :value="t">{{ t }}</option>
        </ListFilterSelect>
      </ListFilterBar>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!factions?.length"
      title="No factions yet"
      description="Create guilds, cults, governments and other organisations."
    />

    <template v-else>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <RouterLink
          v-for="faction in filtered"
          :key="faction.id"
          :to="`/factions/${faction.id}`"
          class="group flex items-center gap-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors p-4"
        >
          <div class="shrink-0 h-12 w-12 rounded-lg border border-border bg-muted overflow-hidden flex items-center justify-center">
            <FocalImage v-if="faction.emblem_url" :src="faction.emblem_url" format="square" :render-width="200" />
            <IconShield v-else class="h-5 w-5 text-muted-foreground/40" />
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <p class="font-cinzel text-sm font-bold text-foreground truncate flex-1">{{ faction.name }}</p>
              <IconReveal v-if="faction.player_visible_to?.length" class="h-3 w-3 shrink-0 text-elven-green" />
            </div>
            <p v-if="faction.faction_type" class="font-cinzel text-[10px] text-muted-foreground tracking-wider mt-0.5">
              {{ faction.faction_type }}
            </p>
            <div v-if="faction.tags.length" class="flex flex-wrap gap-1 mt-1.5">
              <span
                v-for="tag in faction.tags.slice(0, 3)"
                :key="tag"
                class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground tracking-wider"
              >{{ tag }}</span>
            </div>
          </div>

          <IconChevronRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
        </RouterLink>
      </div>
    </template>
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
            v-model="ui.factionsSearch"
            type="search"
            inputmode="search"
            placeholder="Search factions…"
            class="h-11 w-full rounded-full border border-border bg-card pl-9 pr-9 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            v-if="ui.factionsSearch"
            type="button"
            class="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
            @click="ui.factionsSearch = ''"
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
          @click="ui.resetFactionsFilters()"
        >
          Clear all
        </button>
      </div>
    </div>

    <!-- List body -->
    <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-1">
      <div v-if="isLoading" class="flex justify-center py-16">
        <LoadingSpinner />
      </div>

      <EmptyState
        v-else-if="!factions?.length"
        title="No factions yet"
        description="Create guilds, cults, governments and other organisations."
      />

      <p
        v-else-if="!filtered.length"
        class="py-12 text-center font-fell text-sm italic text-muted-foreground"
      >
        No factions match your filters.
      </p>

      <template v-else>
        <MobileEntityMetaRow
          v-model:layout="layout"
          :shown="filtered.length"
          :total="factions?.length ?? 0"
          plural="Factions"
        />
        <div
          :class="layout === 'gallery'
            ? 'grid grid-cols-2 gap-3 pb-2'
            : 'flex flex-col gap-2 pb-2'"
        >
          <EntityMobileCard
            v-for="faction in filtered"
            :key="faction.id"
            :layout="layout"
            :to="`/factions/${faction.id}`"
            :title="faction.name"
            :subtitle="faction.faction_type ?? undefined"
            :image-url="faction.emblem_url"
            placeholder="/assets/placeholders/faction.webp"
            :shared="(faction.player_visible_to?.length ?? 0) > 0"
          />
        </div>
      </template>
    </div>

    <!-- Filters bottom sheet -->
    <MobileSheet v-model:open="filtersOpen" title="Filter Factions">
      <div class="flex flex-col gap-4 py-1">
        <div>
          <p class="mb-1.5 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">Type</p>
          <ListFilterSelect v-model="ui.factionsFilterType" aria-label="Faction type filter" class="w-full">
            <option value="">All types</option>
            <option v-for="t in FACTION_TYPES" :key="t" :value="t">{{ t }}</option>
          </ListFilterSelect>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="h-11 flex-1 rounded-xl border border-border bg-card font-cinzel text-sm font-semibold tracking-wider text-muted-foreground"
            @click="ui.resetFactionsFilters()"
          >
            Clear all
          </button>
          <button
            type="button"
            class="h-11 flex-1 rounded-xl bg-primary font-cinzel text-sm font-semibold tracking-wider text-primary-foreground"
            @click="filtersOpen = false"
          >
            Show {{ filtered.length }}
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
          @click="overflowOpen = false; ui.factionGeneratorOpen = true"
        >
          <IconGenerate class="size-5 shrink-0 text-muted-foreground" /> Generate
        </button>
        <button
          v-if="hasSetting"
          type="button"
          :disabled="populateMutation.isPending.value"
          class="flex items-center gap-3 rounded-lg px-2 py-3 text-left font-fell text-sm text-foreground hover:bg-muted/50 disabled:opacity-50"
          @click="overflowOpen = false; handlePopulate()"
        >
          <component :is="populateMutation.isPending.value ? IconLoading : IconPopulate" class="size-5 shrink-0 text-muted-foreground" />
          {{ populateStatusLabel }}
        </button>
      </div>
    </MobileSheet>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useMediaQuery } from "@vueuse/core";
import {
  IconAdd, IconChevronRight, IconClose, IconGenerate, IconLoading,
  IconPopulate, IconReveal, IconSearch, IconSettings, IconShield,
} from '@/lib/icons';
import { useAllFactions, usePopulateFactions } from "@/composables/useFactions";
import { FACTION_TYPES } from "@/types/faction.types";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { getSetting } from "@/settings/index";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import MobileEntityMetaRow from "@/components/common/MobileEntityMetaRow.vue";
import EntityMobileCard from "@/components/common/EntityMobileCard.vue";

// IconSettings (sliders) reads as "filters"
const IconFilter = IconSettings;

const ui = useUiStore();
const campaign = useCampaignStore();
const isMobile = useMediaQuery("(max-width: 767px)");

const filtersOpen = ref(false);
const overflowOpen = ref(false);

const layout = computed({
  get: () => ui.entityListLayout,
  set: (v: "rows" | "gallery") => { ui.entityListLayout = v; },
});

const { data: factions, isLoading } = useAllFactions();

const hasSetting = computed(() => !!getSetting(campaign.activeCampaign?.calendar_id ?? ""));

const filtered = computed(() => {
  const q = ui.factionsSearch.trim().toLowerCase();
  return (factions.value ?? []).filter((f) => {
    if (ui.factionsFilterType && f.faction_type !== ui.factionsFilterType) return false;
    if (q && !f.name.toLowerCase().includes(q) && !f.tags.some((t) => t.toLowerCase().includes(q))) return false;
    return true;
  });
});

const populateMutation = usePopulateFactions();
const populateStatus = ref<"idle" | "done" | "uptodate">("idle");
const populatedCount = ref(0);
const populateError = ref<string | null>(null);

const populateStatusLabel = computed(() => {
  if (populateMutation.isPending.value) return "Populating…";
  if (populateError.value) return `Error: ${populateError.value}`;
  if (populateStatus.value === "done") return `Added ${populatedCount.value} faction${populatedCount.value !== 1 ? "s" : ""}`;
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
    populateError.value = e instanceof Error ? e.message : "Unknown error";
  }
}

// ── Mobile filter chrome ────────────────────────────────────────────────────

const activeChips = computed(() => {
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (ui.factionsSearch) chips.push({ key: "search", label: `"${ui.factionsSearch}"`, clear: () => { ui.factionsSearch = ""; } });
  if (ui.factionsFilterType) chips.push({ key: "type", label: ui.factionsFilterType, clear: () => { ui.factionsFilterType = ""; } });
  return chips;
});

const activeFilterCount = computed(() =>
  activeChips.value.filter((c) => c.key !== "search").length,
);
</script>
