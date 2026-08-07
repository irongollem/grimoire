<template>
  <!-- ══ Desktop (≥md): existing ListPageLayout chrome — unchanged ══════════ -->
  <ListPageLayout v-if="!isMobile" title="Bestiary" description="Your custom monster compendium">
    <template #title-suffix>
      <ManualHelpLink page="bestiary-overview" />
    </template>

    <template #actions>
      <!-- Sources panel — per-campaign library selection, DB-backed so it persists -->
      <SourcesPickerPanel
        title="Monster Sources"
        description="Enabled sources appear in your Bestiary instantly — no download needed."
        empty-message="No sources available yet. Ask your admin to seed the library_monsters table."
        :available-sources="availableSourceData"
        :is-loading="sourcesLoading"
      >
        <template #trigger="{ open: pickerOpen, toggle }">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors shrink-0"
            :class="pickerOpen ? 'border-primary/50 text-foreground' : ''"
            title="Manage monster sources for this campaign"
            @click="toggle"
          >
            <IconLibrary class="size-3.5 shrink-0" />
          </button>
        </template>
      </SourcesPickerPanel>

      <AppButton
        size="md"
        collapse-label-on-mobile
        :icon="IconGenerate"
        label="Generate"
        @click="ui.monsterGeneratorOpen = true"
      />
      <AppButton
        size="md"
        collapse-label-on-mobile
        variant="primary"
        :icon="IconAdd"
        label="New Monster"
        mobile-label="Monster"
        @click="handleNew"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="ui.monstersHasActiveFilters"
        @clear="ui.resetMonstersFilters()"
      >
        <ListSearchInput v-model="ui.monstersSearch" placeholder="Search monsters…" />
        <ListFilterSelect
          v-model="ui.monstersFilterSource"
          aria-label="Source filter"
        >
          <option value="all">All sources</option>
          <option value="custom">Custom</option>
          <option
            v-for="src in enabledSourceData ?? []"
            :key="src.source_slug"
            :value="src.source_slug"
          >{{ src.source_title ?? src.source_slug }}</option>
        </ListFilterSelect>
        <!--
          Type covers all 14 standard D&D creature types — too many to sit as
          a button row without causing weird widths and wrap on mobile. A
          native select lists them compactly and uses the OS picker on
          touch devices (keeps iOS wheel / Android bottom-sheet).
        -->
        <ListFilterSelect
          v-model="ui.monstersFilterType"
          aria-label="Monster type filter"
        >
          <option v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </ListFilterSelect>
      </ListFilterBar>
    </template>

    <MonsterList />
  </ListPageLayout>

  <!-- ══ Mobile (<md): purpose-built list chrome ═══════════════════════════ -->
  <div v-else class="flex h-full flex-col">
    <div class="shrink-0 px-4 pt-3">
      <!-- Search row -->
      <div class="flex items-center gap-2">
        <div class="relative min-w-0 flex-1">
          <IconSearch
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            v-model="ui.monstersSearch"
            type="search"
            inputmode="search"
            placeholder="Search monsters…"
            class="h-11 w-full rounded-full border border-border bg-card pl-9 pr-9 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            v-if="ui.monstersSearch"
            type="button"
            class="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
            @click="ui.monstersSearch = ''"
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

      <!-- Active-filter chips -->
      <div v-if="activeChips.length" class="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          v-for="chip in activeChips"
          :key="chip.key"
          type="button"
          class="inline-flex items-center gap-1 rounded-full border border-border bg-card py-1 pl-2.5 pr-1.5 text-caption text-foreground"
          @click="chip.clear()"
        >
          {{ chip.label }}
          <IconClose class="size-3 text-muted-foreground" />
        </button>
        <button
          type="button"
          class="text-label-lg font-semibold text-primary"
          @click="ui.resetMonstersFilters()"
        >
          Clear all
        </button>
      </div>
    </div>

    <!-- List body (scrolls). The docked DM bottom nav owns the create "+"
         (Prep mode), so this view no longer has its own bottom New bar.
         The shell's <main> already reserves space for the docked bar. -->
    <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-1">
      <MonsterList />
    </div>

    <!-- Filters bottom sheet -->
    <MobileSheet v-model:open="filtersOpen" title="Filter Monsters">
      <div class="flex flex-col gap-4 py-1">
        <div>
          <p class="mb-1.5 text-label-lg font-semibold text-muted-foreground">Source</p>
          <ListFilterSelect v-model="ui.monstersFilterSource" aria-label="Source filter" class="w-full">
            <option value="all">All sources</option>
            <option value="custom">Custom</option>
            <option
              v-for="src in enabledSourceData ?? []"
              :key="src.source_slug"
              :value="src.source_slug"
            >{{ src.source_title ?? src.source_slug }}</option>
          </ListFilterSelect>
        </div>
        <div>
          <p class="mb-1.5 text-label-lg font-semibold text-muted-foreground">Type</p>
          <ListFilterSelect v-model="ui.monstersFilterType" aria-label="Monster type filter" class="w-full">
            <option v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </ListFilterSelect>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="h-11 flex-1 rounded-xl border border-border bg-card font-cinzel text-sm font-semibold tracking-wider text-muted-foreground"
            @click="ui.resetMonstersFilters()"
          >
            Clear all
          </button>
          <button
            type="button"
            class="h-11 flex-1 rounded-xl bg-primary font-cinzel text-sm font-semibold tracking-wider text-primary-foreground"
            @click="filtersOpen = false"
          >
            Show {{ matchCount }}
          </button>
        </div>
      </template>
    </MobileSheet>

    <!-- Overflow ⋮ sheet -->
    <MobileSheet v-model:open="overflowOpen" title="More">
      <div class="flex flex-col gap-1 py-1">
        <button
          type="button"
          class="flex items-center gap-3 rounded-lg px-2 py-3 text-left text-body text-foreground hover:bg-muted/50"
          @click="overflowOpen = false; sourcesOpen = true"
        >
          <IconLibrary class="size-5 shrink-0 text-muted-foreground" /> Monster Sources
        </button>
        <button
          type="button"
          class="flex items-center gap-3 rounded-lg px-2 py-3 text-left text-body text-foreground hover:bg-muted/50"
          @click="overflowOpen = false; ui.monsterGeneratorOpen = true"
        >
          <IconGenerate class="size-5 shrink-0 text-muted-foreground" /> Generate
        </button>
      </div>
    </MobileSheet>

    <!-- Sources picker sheet -->
    <MobileSheet v-model:open="sourcesOpen" title="Monster Sources">
      <SourcesPickerPanel
        variant="sheet"
        description="Enabled sources appear in your Bestiary instantly — no download needed."
        empty-message="No sources available yet. Ask your admin to seed the library_monsters table."
        :available-sources="availableSourceData"
        :is-loading="sourcesLoading"
      />
    </MobileSheet>
  </div>

  <PaywallModal v-model="showPaywall" resource="monsters" />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useMediaQuery } from "@vueuse/core";
import {
  IconAdd, IconClose, IconGenerate, IconLibrary,
  IconSearch, IconSettings,
} from '@/lib/icons';
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import AppButton from "@/components/common/AppButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import MonsterList from "@/components/monsters/MonsterList.vue";
import SourcesPickerPanel from "@/components/common/SourcesPickerPanel.vue";
import { useUiStore } from "@/stores/ui";
import { useRouter } from "vue-router";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useQuota } from "@/composables/useQuota";
import { useAllMonsters } from "@/composables/useMonsters";
import { useEnabledSources, useAvailableLibrarySources } from "@/composables/useEnabledSources";

// IconSettings (sliders) reads as "filters". The overflow ⋮ has no kebab glyph
// in the icon set, so it is rendered as an inline SVG in the template.
const IconFilter = IconSettings;

const router = useRouter();
const ui = useUiStore();
const { canCreate } = useQuota("monsters");
const showPaywall = ref(false);
const isMobile = useMediaQuery("(max-width: 767px)");

const filtersOpen = ref(false);
const overflowOpen = ref(false);
const sourcesOpen = ref(false);

function handleNew() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  router.push("/monsters/new");
}

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "aberration", label: "Aberration" },
  { value: "beast", label: "Beast" },
  { value: "celestial", label: "Celestial" },
  { value: "construct", label: "Construct" },
  { value: "dragon", label: "Dragon" },
  { value: "elemental", label: "Elemental" },
  { value: "fey", label: "Fey" },
  { value: "fiend", label: "Fiend" },
  { value: "giant", label: "Giant" },
  { value: "humanoid", label: "Humanoid" },
  { value: "monstrosity", label: "Monstrosity" },
  { value: "ooze", label: "Ooze" },
  { value: "plant", label: "Plant" },
  { value: "undead", label: "Undead" },
] as const;

// ── Sources panel ────────────────────────────────────────────────────────────
// enabledSourceData also feeds the Source filter dropdown below; the enable/
// disable wiring itself now lives inside SourcesPickerPanel.
const { data: enabledSourceData } = useEnabledSources();
const { data: availableSourceData, isLoading: sourcesLoading } = useAvailableLibrarySources();

// ── Mobile filter chrome ────────────────────────────────────────────────────

const { data: allMonsters } = useAllMonsters();

const sourceLabel = (slug: string): string => {
  if (slug === "custom") return "Custom";
  return enabledSourceData.value?.find((s) => s.source_slug === slug)?.source_title ?? slug;
};
const typeLabel = (v: string) => TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;

const activeChips = computed(() => {
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (ui.monstersSearch) chips.push({ key: "search", label: `"${ui.monstersSearch}"`, clear: () => { ui.monstersSearch = ""; } });
  if (ui.monstersFilterSource !== "all") chips.push({ key: "source", label: sourceLabel(ui.monstersFilterSource), clear: () => { ui.monstersFilterSource = "all"; } });
  if (ui.monstersFilterType !== "all") chips.push({ key: "type", label: typeLabel(ui.monstersFilterType), clear: () => { ui.monstersFilterType = "all"; } });
  return chips;
});

const activeFilterCount = computed(() =>
  activeChips.value.filter((c) => c.key !== "search").length,
);

// Live "Show N" count — mirrors MonsterList filtering.
const matchCount = computed(() => {
  let list = allMonsters.value ?? [];
  if (ui.monstersFilterSource === "custom") list = list.filter((m) => !m.is_shared);
  else if (ui.monstersFilterSource !== "all") list = list.filter((m) => m.source === ui.monstersFilterSource);
  if (ui.monstersSearch.trim()) {
    const q = ui.monstersSearch.trim().toLowerCase();
    list = list.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.monster_type.toLowerCase().includes(q) ||
        m.habitat?.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  if (ui.monstersFilterType !== "all") list = list.filter((m) => m.monster_type === ui.monstersFilterType);
  return list.length;
});
</script>
