<template>
  <!-- ══ Desktop (≥md): existing ListPageLayout chrome — unchanged ══════════ -->
  <ListPageLayout v-if="!isMobile" title="Spellbook" description="Your custom spell compendium">
    <template #actions>
      <!-- Sources panel — per-campaign library selection, DB-backed so it persists -->
      <div ref="sourcePickerRef" class="relative shrink-0">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors shrink-0"
          :class="showSourcePicker ? 'border-primary/50 text-foreground' : ''"
          title="Manage spell sources for this campaign"
          @click="showSourcePicker = !showSourcePicker"
        >
          <IconLibrary class="size-3.5 shrink-0" />
        </button>
        <div
          v-show="showSourcePicker"
          class="absolute right-0 top-full mt-1 z-50 w-80 rounded-md border border-border bg-popover shadow-lg"
        >
          <div class="p-3 border-b border-border">
            <p class="font-cinzel text-xs font-semibold text-foreground">Spell Sources</p>
            <p class="font-fell text-xs text-muted-foreground mt-0.5 italic">
              Enabled sources appear in your Spellbook instantly — no download needed.
            </p>
          </div>
          <div v-if="sourcesLoading" class="p-4 flex items-center justify-center">
            <IconLoading class="size-4 animate-spin text-muted-foreground" />
          </div>
          <div v-else-if="availableSources.length === 0" class="p-4">
            <p class="font-fell text-xs text-muted-foreground italic">No sources available yet. Ask your admin to seed the srd_spells table.</p>
          </div>
          <div v-else class="p-2 flex flex-col gap-0.5 max-h-72 overflow-y-auto">
            <label
              v-for="src in availableSources"
              :key="src.source"
              class="flex items-center gap-2.5 px-2 py-2 rounded cursor-pointer hover:bg-accent transition-colors"
              :class="(enableEnable.isPending.value || enableDisable.isPending.value) ? 'pointer-events-none opacity-60' : ''"
            >
              <input
                type="checkbox"
                :checked="isEnabled(src.source)"
                class="accent-primary shrink-0"
                @change="toggleSource(src)"
              />
              <span class="font-fell text-sm text-foreground flex-1 min-w-0 truncate">
                {{ src.source_title ?? src.source }}
              </span>
              <span class="font-cinzel text-[10px] text-muted-foreground shrink-0">{{ src.count.toLocaleString() }}</span>
            </label>
          </div>
        </div>
      </div>

      <ListActionButton
        :icon="IconGenerate"
        label="Generate"
        @click="ui.spellGeneratorOpen = true"
      />
      <ListActionButton
        :icon="IconAdd"
        label="New Spell"
        mobile-label="Spell"
        variant="primary"
        to="/spells/new"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="ui.spellsHasActiveFilters"
        @clear="ui.resetSpellsFilters()"
      >
        <ListSearchInput v-model="ui.spellsSearch" placeholder="Search by name…" />
        <ListFilterGroup
          :model-value="ui.spellsFilterLevel"
          :options="LEVEL_FILTERS"
          aria-label="Spell level filter"
          @update:model-value="ui.spellsFilterLevel = $event"
        />
        <ListFilterSelect v-model="ui.spellsFilterSchool" aria-label="School filter">
          <option value="">All Schools</option>
          <option v-for="s in SPELL_SCHOOLS" :key="s" :value="s" class="capitalize">{{ s }}</option>
        </ListFilterSelect>
        <ListFilterSelect v-model="ui.spellsFilterClass" aria-label="Class filter">
          <option value="">All Classes</option>
          <option v-for="c in SPELL_CLASSES" :key="c" :value="c">{{ c }}</option>
        </ListFilterSelect>
        <ListFilterSelect v-model="ui.spellsFilterSource" aria-label="Source filter">
          <option value="all">All Sources</option>
          <option value="custom">Custom</option>
          <option
            v-for="src in enabledSourceData ?? []"
            :key="src.source_slug"
            :value="src.source_slug"
          >{{ src.source_title ?? src.source_slug }}</option>
        </ListFilterSelect>
      </ListFilterBar>
    </template>

    <SpellList
      :search="ui.spellsSearch"
      :level-filter="ui.spellsFilterLevel"
      :school-filter="ui.spellsFilterSchool"
      :class-filter="ui.spellsFilterClass"
      :source-filter="ui.spellsFilterSource"
    />
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
            v-model="ui.spellsSearch"
            type="search"
            inputmode="search"
            placeholder="Search by name…"
            class="h-11 w-full rounded-full border border-border bg-card pl-9 pr-9 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            v-if="ui.spellsSearch"
            type="button"
            class="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
            @click="ui.spellsSearch = ''"
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
          @click="ui.resetSpellsFilters()"
        >
          Clear all
        </button>
      </div>
    </div>

    <!-- List body (scrolls). The docked DM bottom nav owns the create "+",
         so this view has no bottom New bar. SpellList renders the mobile
         rows/gallery cards + count toggle for <md DM mode. -->
    <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-1">
      <SpellList
        :search="ui.spellsSearch"
        :level-filter="ui.spellsFilterLevel"
        :school-filter="ui.spellsFilterSchool"
        :class-filter="ui.spellsFilterClass"
        :source-filter="ui.spellsFilterSource"
      />
    </div>

    <!-- Filters bottom sheet -->
    <MobileSheet v-model:open="filtersOpen" title="Filter Spells">
      <div class="flex flex-col gap-4 py-1">
        <div>
          <p class="mb-1.5 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">Level</p>
          <ListFilterGroup
            :model-value="ui.spellsFilterLevel"
            :options="LEVEL_FILTERS"
            aria-label="Spell level filter"
            @update:model-value="ui.spellsFilterLevel = $event"
          />
        </div>
        <div>
          <p class="mb-1.5 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">School</p>
          <ListFilterSelect v-model="ui.spellsFilterSchool" aria-label="School filter" class="w-full">
            <option value="">All Schools</option>
            <option v-for="s in SPELL_SCHOOLS" :key="s" :value="s" class="capitalize">{{ s }}</option>
          </ListFilterSelect>
        </div>
        <div>
          <p class="mb-1.5 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">Class</p>
          <ListFilterSelect v-model="ui.spellsFilterClass" aria-label="Class filter" class="w-full">
            <option value="">All Classes</option>
            <option v-for="c in SPELL_CLASSES" :key="c" :value="c">{{ c }}</option>
          </ListFilterSelect>
        </div>
        <div>
          <p class="mb-1.5 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">Source</p>
          <ListFilterSelect v-model="ui.spellsFilterSource" aria-label="Source filter" class="w-full">
            <option value="all">All Sources</option>
            <option value="custom">Custom</option>
            <option
              v-for="src in enabledSourceData ?? []"
              :key="src.source_slug"
              :value="src.source_slug"
            >{{ src.source_title ?? src.source_slug }}</option>
          </ListFilterSelect>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="h-11 flex-1 rounded-xl border border-border bg-card font-cinzel text-sm font-semibold tracking-wider text-muted-foreground"
            @click="ui.resetSpellsFilters()"
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
          class="flex items-center gap-3 rounded-lg px-2 py-3 text-left font-fell text-sm text-foreground hover:bg-muted/50"
          @click="overflowOpen = false; sourcesOpen = true"
        >
          <IconLibrary class="size-5 shrink-0 text-muted-foreground" /> Spell Sources
        </button>
        <button
          type="button"
          class="flex items-center gap-3 rounded-lg px-2 py-3 text-left font-fell text-sm text-foreground hover:bg-muted/50"
          @click="overflowOpen = false; ui.spellGeneratorOpen = true"
        >
          <IconGenerate class="size-5 shrink-0 text-muted-foreground" /> Generate
        </button>
      </div>
    </MobileSheet>

    <!-- Sources picker sheet -->
    <MobileSheet v-model:open="sourcesOpen" title="Spell Sources">
      <p class="mb-3 font-fell text-xs italic text-muted-foreground">
        Enabled sources appear in your Spellbook instantly — no download needed.
      </p>
      <div v-if="sourcesLoading" class="flex items-center justify-center py-6">
        <IconLoading class="size-5 animate-spin text-muted-foreground" />
      </div>
      <p v-else-if="availableSources.length === 0" class="py-4 font-fell text-sm italic text-muted-foreground">
        No sources available yet. Ask your admin to seed the srd_spells table.
      </p>
      <div v-else class="flex flex-col gap-0.5">
        <label
          v-for="src in availableSources"
          :key="src.source"
          class="flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-muted/50"
          :class="(enableEnable.isPending.value || enableDisable.isPending.value) ? 'pointer-events-none opacity-60' : ''"
        >
          <input
            type="checkbox"
            :checked="isEnabled(src.source)"
            class="size-4 shrink-0 accent-primary"
            @change="toggleSource(src)"
          />
          <span class="min-w-0 flex-1 truncate font-fell text-sm text-foreground">
            {{ src.source_title ?? src.source }}
          </span>
          <span class="shrink-0 font-cinzel text-2xs text-muted-foreground">{{ src.count.toLocaleString() }}</span>
        </label>
      </div>
    </MobileSheet>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { onClickOutside, useMediaQuery } from "@vueuse/core";
import { IconAdd, IconClose, IconGenerate, IconLibrary, IconLoading, IconSearch, IconSettings } from '@/lib/icons';
import { useUiStore } from "@/stores/ui";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterGroup from "@/components/common/ListFilterGroup.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import SpellList from "@/components/spells/SpellList.vue";
import { useAllSpells } from "@/composables/useSpells";
import { SPELL_SCHOOLS, SPELL_CLASSES } from "@/types/spell.types";
import {
  useEnabledSources,
  useAvailableSrdSpellSources,
  useEnableSource,
  useDisableSource,
  type AvailableSrdSource,
} from "@/composables/useEnabledSources";

// IconSettings (sliders) reads as "filters". The overflow ⋮ has no kebab glyph
// in the icon set, so it is rendered as an inline SVG in the template.
const IconFilter = IconSettings;

const ui = useUiStore();
const isMobile = useMediaQuery("(max-width: 767px)");

const filtersOpen = ref(false);
const overflowOpen = ref(false);
const sourcesOpen = ref(false);

const LEVEL_FILTERS = [
  { value: "", label: "All" },
  { value: "0", label: "C" },
  { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" },
  { value: "4", label: "4" }, { value: "5", label: "5" }, { value: "6", label: "6" },
  { value: "7", label: "7" }, { value: "8", label: "8" }, { value: "9", label: "9" },
] as const;

// ── Sources panel (desktop popover) ──────────────────────────────────────────
const showSourcePicker = ref(false);
const sourcePickerRef  = ref<HTMLElement | null>(null);
onClickOutside(sourcePickerRef, () => { showSourcePicker.value = false; });

const { data: enabledSourceData }                              = useEnabledSources();
const { data: availableSourceData, isLoading: sourcesLoading } = useAvailableSrdSpellSources();
const enableEnable  = useEnableSource();
const enableDisable = useDisableSource();

const availableSources = computed(() => availableSourceData.value ?? []);
const enabledSlugs     = computed(() => new Set(enabledSourceData.value?.map((e) => e.source_slug) ?? []));

function isEnabled(slug: string) { return enabledSlugs.value.has(slug); }

function toggleSource(src: AvailableSrdSource) {
  if (isEnabled(src.source)) {
    enableDisable.mutate(src.source);
  } else {
    enableEnable.mutate({ source_slug: src.source, source_title: src.source_title });
  }
}

// ── Mobile filter chrome ────────────────────────────────────────────────────
const { data: allSpells } = useAllSpells();

const sourceChipLabel = (slug: string): string => {
  if (slug === "custom") return "Custom";
  return enabledSourceData.value?.find((s) => s.source_slug === slug)?.source_title ?? slug;
};

// One chip per active filter; each removes only its own filter. "Clear all"
// resets everything via resetSpellsFilters.
const activeChips = computed(() => {
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (ui.spellsSearch) chips.push({ key: "search", label: `"${ui.spellsSearch}"`, clear: () => { ui.spellsSearch = ""; } });
  if (ui.spellsFilterLevel !== "")
    chips.push({
      key: "level",
      label: ui.spellsFilterLevel === "0" ? "Cantrip" : `Level ${ui.spellsFilterLevel}`,
      clear: () => { ui.spellsFilterLevel = ""; },
    });
  if (ui.spellsFilterSchool) chips.push({ key: "school", label: ui.spellsFilterSchool, clear: () => { ui.spellsFilterSchool = ""; } });
  if (ui.spellsFilterClass) chips.push({ key: "class", label: ui.spellsFilterClass, clear: () => { ui.spellsFilterClass = ""; } });
  if (ui.spellsFilterSource !== "all") chips.push({ key: "source", label: sourceChipLabel(ui.spellsFilterSource), clear: () => { ui.spellsFilterSource = "all"; } });
  return chips;
});

// Badge count on the Filters button (search is shown as its own chip, so it is
// excluded here to keep the badge reflecting "filters" not "search").
const activeFilterCount = computed(() =>
  activeChips.value.filter((c) => c.key !== "search").length,
);

// Live "Show N" count for the filter sheet footer — mirrors SpellList filtering.
const matchCount = computed(() => {
  let list = allSpells.value ?? [];
  const q = ui.spellsSearch.trim().toLowerCase();
  if (q) list = list.filter((s) => s.name.toLowerCase().includes(q));
  if (ui.spellsFilterLevel !== "") list = list.filter((s) => s.level === parseInt(ui.spellsFilterLevel));
  if (ui.spellsFilterSchool) list = list.filter((s) => s.school === ui.spellsFilterSchool);
  if (ui.spellsFilterClass) list = list.filter((s) => s.classes.includes(ui.spellsFilterClass));
  if (ui.spellsFilterSource !== "all") list = list.filter((s) => s.source === ui.spellsFilterSource);
  return list.length;
});
</script>
