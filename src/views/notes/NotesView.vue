<template>
  <!-- ══ Desktop (≥md): existing ListPageLayout chrome — unchanged ══════════ -->
  <ListPageLayout
    v-if="!isMobile"
    title="Campaign Notes"
    description="Session logs, lore, and secrets of the realm"
  >
    <template #actions>
      <ListActionButton
        :icon="IconAdd"
        label="New Note"
        variant="primary"
        @click="handleNew"
      />
    </template>

    <NotesList />
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
            v-model="ui.notesSearchQuery"
            type="search"
            inputmode="search"
            placeholder="Search notes…"
            class="h-11 w-full rounded-full border border-border bg-card pl-9 pr-9 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            v-if="ui.notesSearchQuery"
            type="button"
            class="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
            @click="ui.notesSearchQuery = ''"
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
      <NotesList />
    </div>

    <!-- Filters bottom sheet -->
    <MobileSheet v-model:open="filtersOpen" title="Filter Notes">
      <div class="flex flex-col gap-4 py-1">
        <div>
          <p class="mb-1.5 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">Category</p>
          <ListFilterGroup
            v-model="categoryFilter"
            :options="CATEGORY_OPTIONS"
            aria-label="Category filter"
          />
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
        <p class="px-2 py-3 font-fell text-sm text-muted-foreground italic">No additional actions.</p>
      </div>
    </MobileSheet>
  </div>

  <PaywallModal v-model="showPaywall" resource="notes" />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useMediaQuery } from "@vueuse/core";
import { IconAdd, IconClose, IconSearch, IconSettings } from '@/lib/icons';
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterGroup from "@/components/common/ListFilterGroup.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import NotesList from "@/components/notes/NotesList.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useUiStore } from "@/stores/ui";
import { useQuota } from "@/composables/useQuota";
import type { NoteCategory } from "@/types/notes.types";

// IconSettings (sliders) reads as "filters".
const IconFilter = IconSettings;

const router = useRouter();
const ui = useUiStore();
const isMobile = useMediaQuery("(max-width: 767px)");
const { canCreate } = useQuota("notes");
const showPaywall = ref(false);

const filtersOpen = ref(false);
const overflowOpen = ref(false);

function handleNew() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  router.push("/notes/new");
}

const CATEGORY_OPTIONS = [
  { value: "all", label: "All" },
  { value: "general", label: "General" },
  { value: "session", label: "Session" },
  { value: "lore", label: "Lore" },
  { value: "location", label: "Location" },
  { value: "quest", label: "Quest" },
  { value: "faction", label: "Faction" },
] as const satisfies ReadonlyArray<{ value: string; label: string }>;

const categoryFilter = computed({
  get: () => ui.notesFilterCategory as string,
  set: (v: string) => { ui.notesFilterCategory = v as NoteCategory | "all"; },
});

function clearFilters() {
  ui.resetNotesFilters();
}

const categoryLabel = (v: string) => CATEGORY_OPTIONS.find((o) => o.value === v)?.label ?? v;

const activeChips = computed(() => {
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (ui.notesSearchQuery) chips.push({ key: "search", label: `"${ui.notesSearchQuery}"`, clear: () => { ui.notesSearchQuery = ""; } });
  if (ui.notesFilterCategory !== "all") chips.push({ key: "category", label: categoryLabel(ui.notesFilterCategory), clear: () => { ui.notesFilterCategory = "all"; } });
  return chips;
});

const activeFilterCount = computed(() =>
  activeChips.value.filter((c) => c.key !== "search").length,
);
</script>
