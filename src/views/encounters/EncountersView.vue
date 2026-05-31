<template>
  <!-- ══ Desktop (≥md): existing ListPageLayout chrome — unchanged ══════════ -->
  <ListPageLayout v-if="!isMobile" title="Encounters" description="Build and run combat encounters">
    <template #actions>
      <ListActionButton
        :icon="IconAdd"
        label="New Encounter"
        mobile-label="Encounter"
        variant="primary"
        @click="handleNew"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="ui.encountersHasActiveFilters"
        @clear="ui.resetEncountersFilters()"
      >
        <ListSearchInput v-model="ui.encountersSearch" placeholder="Search encounters…" />
        <ListFilterSelect
          v-model="ui.encountersFilterQuestId"
          aria-label="Quest filter"
        >
          <option value="all">All quests</option>
          <option value="unassigned">Unassigned</option>
          <option v-for="q in quests" :key="q.id" :value="q.id">{{ q.title }}</option>
        </ListFilterSelect>
        <ListActionButton
          :icon="IconCheckDouble"
          :label="ui.encountersHideFinished ? 'Active' : 'All'"
          :collapse-on-mobile="false"
          :tooltip="ui.encountersHideFinished ? 'Show all encounters' : 'Hide finished encounters'"
          :variant="ui.encountersHideFinished ? 'primary' : 'ghost'"
          @click="ui.encountersHideFinished = !ui.encountersHideFinished"
        />
      </ListFilterBar>
    </template>

    <EncounterList />
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
            v-model="ui.encountersSearch"
            type="search"
            inputmode="search"
            placeholder="Search encounters…"
            class="h-11 w-full rounded-full border border-border bg-card pl-9 pr-9 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            v-if="ui.encountersSearch"
            type="button"
            class="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
            @click="ui.encountersSearch = ''"
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
          @click="ui.resetEncountersFilters()"
        >
          Clear all
        </button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-1">
      <EncounterList />
    </div>

    <!-- Filters bottom sheet -->
    <MobileSheet v-model:open="filtersOpen" title="Filter Encounters">
      <div class="flex flex-col gap-4 py-1">
        <div>
          <p class="mb-1.5 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">Status</p>
          <ListFilterGroup
            v-model="hideFinishedToggle"
            :options="HIDE_FINISHED_OPTIONS"
            aria-label="Show/hide finished encounters"
          />
        </div>
        <div>
          <p class="mb-1.5 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">Quest</p>
          <ListFilterSelect v-model="ui.encountersFilterQuestId" aria-label="Quest filter" class="w-full">
            <option value="all">All quests</option>
            <option value="unassigned">Unassigned</option>
            <option v-for="q in quests" :key="q.id" :value="q.id">{{ q.title }}</option>
          </ListFilterSelect>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="h-11 flex-1 rounded-xl border border-border bg-card font-cinzel text-sm font-semibold tracking-wider text-muted-foreground"
            @click="ui.resetEncountersFilters()"
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
        <p class="px-2 py-3 font-fell text-sm text-muted-foreground italic">No additional actions.</p>
      </div>
    </MobileSheet>
  </div>

  <PaywallModal v-model="showPaywall" resource="encounters" />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useMediaQuery } from "@vueuse/core";
import { IconAdd, IconCheckDouble, IconClose, IconSearch, IconSettings } from '@/lib/icons';
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterGroup from "@/components/common/ListFilterGroup.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import EncounterList from "@/components/encounters/EncounterList.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useUiStore } from "@/stores/ui";
import { useAllQuests } from "@/composables/useQuests";
import { useQuota } from "@/composables/useQuota";

// IconSettings (sliders) reads as "filters".
const IconFilter = IconSettings;

const router = useRouter();
const ui = useUiStore();
const isMobile = useMediaQuery("(max-width: 767px)");
const { data: quests } = useAllQuests();
const { canCreate } = useQuota("encounters");
const showPaywall = ref(false);

const filtersOpen = ref(false);
const overflowOpen = ref(false);

function handleNew() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  router.push("/encounters/new");
}

const HIDE_FINISHED_OPTIONS = [
  { value: "active", label: "Active only" },
  { value: "all", label: "Show all" },
] as const satisfies ReadonlyArray<{ value: string; label: string }>;

const hideFinishedToggle = computed({
  get: () => (ui.encountersHideFinished ? "active" : "all"),
  set: (v: string) => { ui.encountersHideFinished = v === "active"; },
});

const questLabel = (id: string) => {
  if (id === "all") return "All quests";
  if (id === "unassigned") return "Unassigned";
  return quests.value?.find((q) => q.id === id)?.title ?? "Quest";
};

const activeChips = computed(() => {
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (ui.encountersSearch) chips.push({ key: "search", label: `"${ui.encountersSearch}"`, clear: () => { ui.encountersSearch = ""; } });
  if (!ui.encountersHideFinished) chips.push({ key: "hide-finished", label: "Showing finished", clear: () => { ui.encountersHideFinished = true; } });
  if (ui.encountersFilterQuestId !== "all") chips.push({ key: "quest", label: questLabel(ui.encountersFilterQuestId), clear: () => { ui.encountersFilterQuestId = "all"; } });
  return chips;
});

const activeFilterCount = computed(() =>
  activeChips.value.filter((c) => c.key !== "search").length,
);
</script>
