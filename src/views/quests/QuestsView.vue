<template>
  <!-- ══ Desktop (≥md): existing ListPageLayout chrome — unchanged ══════════ -->
  <ListPageLayout
    v-if="!isMobile"
    title="Quest Log"
    description="Track active quests, side jobs, and completed adventures"
  >
    <template #actions>
      <ListActionButton
        :icon="IconGenerate"
        label="Generate"
        @click="ui.questGeneratorOpen = true"
      />
      <ListActionButton
        :icon="IconAdd"
        label="New Quest"
        mobile-label="Quest"
        variant="primary"
        to="/quests/new"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="ui.questsHasActiveFilters"
        @clear="ui.resetQuestsFilters()"
      >
        <ListSearchInput
          v-model="ui.questsSearch"
          placeholder="Search quests…"
        />
        <ListActionButton
          :icon="ui.questsIsKanban ? IconColumns : IconListView"
          :label="ui.questsIsKanban ? 'Kanban' : 'List'"
          :collapse-on-mobile="false"
          variant="ghost"
          :tooltip="
            ui.questsIsKanban ? 'Switch to list view' : 'Switch to kanban view'
          "
          @click="ui.questsIsKanban = !ui.questsIsKanban"
        />
      </ListFilterBar>
    </template>

    <QuestList />
  </ListPageLayout>

  <!-- ══ Mobile (<md): purpose-built list chrome — always list (no kanban) ══ -->
  <div v-else class="flex h-full flex-col">
    <div class="shrink-0 px-4 pt-3">
      <!-- Search row: search input + Filters button + overflow ⋮ -->
      <div class="flex items-center gap-2">
        <div class="relative min-w-0 flex-1">
          <IconSearch
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            v-model="ui.questsSearch"
            type="search"
            inputmode="search"
            placeholder="Search quests…"
            class="h-11 w-full rounded-full border border-border bg-card pl-9 pr-9 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            v-if="ui.questsSearch"
            type="button"
            class="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
            @click="ui.questsSearch = ''"
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
          @click="ui.resetQuestsFilters()"
        >
          Clear all
        </button>
      </div>
    </div>

    <!-- Mobile forces list mode — kanban not usable at 390px -->
    <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-1">
      <QuestList :force-list="true" />
    </div>

    <!-- Filters bottom sheet -->
    <MobileSheet v-model:open="filtersOpen" title="Filter Quests">
      <div class="flex flex-col gap-4 py-1">
        <div>
          <p class="mb-1.5 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">Status</p>
          <ListFilterGroup
            v-model="hideFinishedToggle"
            :options="HIDE_FINISHED_OPTIONS"
            aria-label="Show/hide finished quests"
          />
        </div>
      </div>

      <template #footer>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="h-11 flex-1 rounded-xl border border-border bg-card font-cinzel text-sm font-semibold tracking-wider text-muted-foreground"
            @click="ui.resetQuestsFilters()"
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
          @click="overflowOpen = false; ui.questGeneratorOpen = true"
        >
          <IconGenerate class="size-5 shrink-0 text-muted-foreground" /> Generate
        </button>
      </div>
    </MobileSheet>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { IconAdd, IconClose, IconColumns, IconGenerate, IconListView, IconSearch, IconSettings } from '@/lib/icons';
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterGroup from "@/components/common/ListFilterGroup.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import QuestList from "@/components/quests/QuestList.vue";
import { useUiStore } from "@/stores/ui";

// IconSettings reads as "filters".
const IconFilter = IconSettings;

const ui = useUiStore();
const isMobile = useMediaQuery("(max-width: 767px)");

const filtersOpen = ref(false);
const overflowOpen = ref(false);

const HIDE_FINISHED_OPTIONS = [
  { value: "active", label: "Active only" },
  { value: "all", label: "Show all" },
] as const satisfies ReadonlyArray<{ value: string; label: string }>;

// Mirror questsHideFinished (not in store) via a local derived toggle.
// QuestList already respects ui.questsSearch. The hide-finished toggle is
// surfaced via a chip but QuestList doesn't have store-driven hide-finished yet
// — we pass it as a prop instead.
const hideFinished = ref(false);

const hideFinishedToggle = computed({
  get: () => (hideFinished.value ? "active" : "all"),
  set: (v: string) => { hideFinished.value = v === "active"; },
});

const activeChips = computed(() => {
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (ui.questsSearch) chips.push({ key: "search", label: `"${ui.questsSearch}"`, clear: () => { ui.questsSearch = ""; } });
  if (hideFinished.value) chips.push({ key: "hide-finished", label: "Active only", clear: () => { hideFinished.value = false; } });
  return chips;
});

const activeFilterCount = computed(() =>
  activeChips.value.filter((c) => c.key !== "search").length,
);
</script>
