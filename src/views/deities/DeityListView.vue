<template>
  <!-- ══ Desktop (≥md): existing ListPageLayout chrome — unchanged ══════════ -->
  <ListPageLayout
    v-if="!isMobile"
    title="Pantheon"
    description="Gods, deities, and divine beings of your campaign world"
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
        v-if="deities?.length"
        :icon="IconReveal"
        :label="revealStatus === 'done' ? 'All Revealed' : 'Reveal All'"
        :disabled="revealMutation.isPending.value"
        @click="handleRevealAll"
      />
      <ListActionButton
        :icon="IconFire"
        label="Pantheons"
        mobile-label="Pantheons"
        to="/pantheons"
      />
      <ListActionButton
        :icon="IconAdd"
        label="New Deity"
        mobile-label="Deity"
        variant="primary"
        to="/deities/new"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="ui.deitiesHasActiveFilters"
        @clear="ui.resetDeitiesFilters()"
      >
        <ListSearchInput v-model="ui.deitiesSearch" placeholder="Filter deities…" />
        <ListFilterSelect v-model="ui.deitiesFilterDomain" aria-label="Domain filter">
          <option value="">All domains</option>
          <option v-for="d in CLERIC_DOMAINS" :key="d" :value="d">{{ d }}</option>
        </ListFilterSelect>
        <ListFilterSelect v-model="ui.deitiesFilterPantheon" aria-label="Pantheon filter">
          <option value="">All pantheons</option>
          <option v-for="p in pantheons" :key="p.id" :value="p.id">{{ p.name }}</option>
        </ListFilterSelect>
      </ListFilterBar>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!filtered.length"
      title="No deities yet"
      description="Create the gods and divine beings that shape your campaign world."
    />

    <template v-else>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <RouterLink
          v-for="deity in filtered"
          :key="deity.id"
          :to="`/deities/${deity.id}`"
          class="group flex flex-col rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
        >
          <!-- Portrait thumbnail -->
          <div class="relative h-32 bg-muted overflow-hidden">
            <FocalImage
              :src="deity.portrait_url"
              :focal-point="deity.portrait_focal_point ?? null"
              :alt="deity.name"
              format="landscape"
              placeholder="/assets/placeholders/deity.webp"
              class="w-full h-full"
            />
            <!-- Alignment badge -->
            <span
              v-if="deity.alignment"
              class="absolute top-1.5 right-1.5 font-cinzel text-[9px] tracking-wider bg-black/60 text-white px-1.5 py-0.5 rounded"
            >{{ deity.alignment }}</span>
            <!-- Player visible indicator -->
            <IconReveal
              v-if="deity.player_visible_to?.length"
              class="absolute top-1.5 left-1.5 h-3 w-3 text-elven-green"
            />
          </div>

          <div class="p-3 flex flex-col gap-1.5 flex-1">
            <p class="font-cinzel text-sm font-bold text-foreground truncate">{{ deity.name }}</p>
            <p v-if="deity.titles" class="font-fell text-xs text-muted-foreground italic truncate">{{ deity.titles }}</p>

            <!-- Pantheon -->
            <p v-if="deity.pantheon?.name" class="font-cinzel text-[10px] text-muted-foreground tracking-wider">
              {{ deity.pantheon.name }}
            </p>

            <!-- Domains -->
            <div v-if="deity.domains?.length" class="flex flex-wrap gap-1 mt-auto pt-1">
              <span
                v-for="domain in deity.domains.slice(0, 3)"
                :key="domain"
                class="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 font-cinzel text-[9px] text-primary tracking-wider"
              >{{ domain }}</span>
              <span
                v-if="deity.domains.length > 3"
                class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[9px] text-muted-foreground"
              >+{{ deity.domains.length - 3 }}</span>
            </div>
          </div>
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
            v-model="ui.deitiesSearch"
            type="search"
            inputmode="search"
            placeholder="Search deities…"
            class="h-11 w-full rounded-full border border-border bg-card pl-9 pr-9 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            v-if="ui.deitiesSearch"
            type="button"
            class="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
            @click="ui.deitiesSearch = ''"
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
          @click="ui.resetDeitiesFilters()"
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
        v-else-if="!deities?.length"
        title="No deities yet"
        description="Create the gods and divine beings that shape your campaign world."
      />

      <p
        v-else-if="!filtered.length"
        class="py-12 text-center font-fell text-sm italic text-muted-foreground"
      >
        No deities match your filters.
      </p>

      <template v-else>
        <MobileEntityMetaRow
          v-model:layout="layout"
          :shown="filtered.length"
          :total="deities?.length ?? 0"
          plural="Deities"
        />
        <div
          :class="layout === 'gallery'
            ? 'grid grid-cols-2 gap-3 pb-2'
            : 'flex flex-col gap-2 pb-2'"
        >
          <EntityMobileCard
            v-for="deity in filtered"
            :key="deity.id"
            :layout="layout"
            :to="`/deities/${deity.id}`"
            :title="deity.name"
            :subtitle="deitySubtitle(deity)"
            :image-url="deity.portrait_url"
            placeholder="/assets/placeholders/deity.webp"
            :shared="(deity.player_visible_to?.length ?? 0) > 0"
          />
        </div>
      </template>
    </div>

    <!-- Filters bottom sheet -->
    <MobileSheet v-model:open="filtersOpen" title="Filter Deities">
      <div class="flex flex-col gap-4 py-1">
        <div>
          <p class="mb-1.5 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">Domain</p>
          <ListFilterSelect v-model="ui.deitiesFilterDomain" aria-label="Domain filter" class="w-full">
            <option value="">All domains</option>
            <option v-for="d in CLERIC_DOMAINS" :key="d" :value="d">{{ d }}</option>
          </ListFilterSelect>
        </div>
        <div>
          <p class="mb-1.5 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">Pantheon</p>
          <ListFilterSelect v-model="ui.deitiesFilterPantheon" aria-label="Pantheon filter" class="w-full">
            <option value="">All pantheons</option>
            <option v-for="p in pantheons" :key="p.id" :value="p.id">{{ p.name }}</option>
          </ListFilterSelect>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="h-11 flex-1 rounded-xl border border-border bg-card font-cinzel text-sm font-semibold tracking-wider text-muted-foreground"
            @click="ui.resetDeitiesFilters()"
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
        <RouterLink
          to="/pantheons"
          class="flex items-center gap-3 rounded-lg px-2 py-3 font-fell text-sm text-foreground hover:bg-muted/50"
          @click="overflowOpen = false"
        >
          <IconFire class="size-5 shrink-0 text-muted-foreground" /> Pantheons
        </RouterLink>
        <button
          v-if="deities?.length"
          type="button"
          :disabled="revealMutation.isPending.value"
          class="flex items-center gap-3 rounded-lg px-2 py-3 text-left font-fell text-sm text-foreground hover:bg-muted/50 disabled:opacity-50"
          @click="overflowOpen = false; handleRevealAll()"
        >
          <IconReveal class="size-5 shrink-0 text-muted-foreground" />
          {{ revealStatus === 'done' ? 'All Revealed' : 'Reveal All' }}
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
import { computed, ref } from "vue";
import { useMediaQuery } from "@vueuse/core";
import {
  IconAdd, IconClose, IconFire, IconLoading, IconPopulate, IconReveal,
  IconSearch, IconSettings,
} from '@/lib/icons';
import { useAllDeities, useAllPantheons, usePopulateDeities, useRevealAllDeities } from "@/composables/useDeities";
import { CLERIC_DOMAINS } from "@/types/deity.types";
import type { Deity } from "@/types/deity.types";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { getSetting } from "@/settings/index";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import FocalImage from "@/components/common/FocalImage.vue";
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

const { data: deities, isLoading } = useAllDeities();
const { data: pantheons } = useAllPantheons();

const hasSetting = computed(() => {
  const s = getSetting(campaign.activeCampaign?.calendar_id ?? "");
  return !!(s?.pantheons.length || s?.deities.length);
});

const filtered = computed(() => {
  const q = ui.deitiesSearch.trim().toLowerCase();
  return (deities.value ?? []).filter((d) => {
    if (ui.deitiesFilterDomain && !d.domains.includes(ui.deitiesFilterDomain)) return false;
    if (ui.deitiesFilterPantheon && d.pantheon_id !== ui.deitiesFilterPantheon) return false;
    if (q) {
      const haystack = [d.name, d.titles, d.portfolio, ...(d.alternate_names ?? []), ...(d.tags ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
});

function deitySubtitle(deity: Deity): string | undefined {
  const parts: string[] = [];
  if (deity.domains?.length) parts.push(deity.domains.slice(0, 2).join(", "));
  if (deity.pantheon_id) {
    const p = pantheons.value?.find((x) => x.id === deity.pantheon_id);
    if (p) parts.push(p.name);
  }
  return parts.length ? parts.join(" · ") : undefined;
}

const revealMutation = useRevealAllDeities();
const revealStatus = ref<"idle" | "done">("idle");

async function handleRevealAll() {
  revealStatus.value = "idle";
  await revealMutation.mutateAsync();
  revealStatus.value = "done";
}

const populateMutation = usePopulateDeities();
const populateStatus = ref<"idle" | "done" | "uptodate">("idle");
const populatedCounts = ref<[number, number]>([0, 0]);
const populateError = ref<string | null>(null);

const populateStatusLabel = computed(() => {
  if (populateMutation.isPending.value) return "Populating…";
  if (populateError.value) return `Error: ${populateError.value}`;
  if (populateStatus.value === "done") {
    const [p, d] = populatedCounts.value;
    const parts: string[] = [];
    if (p) parts.push(`${p} pantheon${p !== 1 ? "s" : ""}`);
    if (d) parts.push(`${d} ${d !== 1 ? "deities" : "deity"}`);
    return `Updated ${parts.join(", ")}`;
  }
  if (populateStatus.value === "uptodate") return "Already up to date";
  return "Populate Setting";
});

async function handlePopulate() {
  populateStatus.value = "idle";
  populateError.value = null;
  try {
    const counts = await populateMutation.mutateAsync();
    populatedCounts.value = counts;
    populateStatus.value = counts[0] === 0 && counts[1] === 0 ? "uptodate" : "done";
  } catch (e) {
    populateError.value = e instanceof Error ? e.message : "Unknown error";
  }
}

// ── Mobile filter chrome ────────────────────────────────────────────────────

const domainLabel = (v: string) => v;
const pantheonLabel = (id: string) => pantheons.value?.find((p) => p.id === id)?.name ?? "Pantheon";

const activeChips = computed(() => {
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (ui.deitiesSearch) chips.push({ key: "search", label: `"${ui.deitiesSearch}"`, clear: () => { ui.deitiesSearch = ""; } });
  if (ui.deitiesFilterDomain) chips.push({ key: "domain", label: domainLabel(ui.deitiesFilterDomain), clear: () => { ui.deitiesFilterDomain = ""; } });
  if (ui.deitiesFilterPantheon) chips.push({ key: "pantheon", label: pantheonLabel(ui.deitiesFilterPantheon), clear: () => { ui.deitiesFilterPantheon = ""; } });
  return chips;
});

const activeFilterCount = computed(() =>
  activeChips.value.filter((c) => c.key !== "search").length,
);
</script>
