<template>
  <ListPageLayout title="Spellbook" description="Your custom spell compendium">
    <template #title-suffix>
      <ManualHelpLink page="creating-custom-spells" />
    </template>

    <template #actions>
      <!-- Sources panel — per-campaign library selection, DB-backed so it persists -->
      <SourcesPickerPanel
        title="Spell Sources"
        description="Enabled sources appear in your Spellbook instantly — no download needed."
        empty-message="No sources available yet. Ask your admin to seed the library_spells table."
        :available-sources="availableSourceData"
        :is-loading="sourcesLoading"
      >
        <template #trigger="{ open: pickerOpen, toggle }">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors shrink-0"
            :class="pickerOpen ? 'border-primary/50 text-foreground' : ''"
            title="Manage spell sources for this campaign"
            @click="toggle"
          >
            <IconLibrary class="size-3.5 shrink-0" />
          </button>
        </template>
      </SourcesPickerPanel>

      <ListActionButton
        :icon="IconGenerate"
        label="Generate"
        @click="ui.spellGeneratorOpen = true"
      />
      <ListActionButton
        variant="primary"
        :icon="IconAdd"
        label="New Spell"
        mobile-label="Spell"
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
</template>

<script setup lang="ts">
import { IconAdd, IconGenerate, IconLibrary } from '@/lib/icons';
import { useUiStore } from "@/stores/ui";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterGroup from "@/components/common/ListFilterGroup.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import SpellList from "@/components/spells/SpellList.vue";
import SourcesPickerPanel from "@/components/common/SourcesPickerPanel.vue";
import { SPELL_SCHOOLS, SPELL_CLASSES } from "@/types/spell.types";
import { useEnabledSources, useAvailableLibrarySpellSources } from "@/composables/useEnabledSources";

const ui = useUiStore();

const LEVEL_FILTERS = [
  { value: "", label: "All" },
  { value: "0", label: "C" },
  { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" },
  { value: "4", label: "4" }, { value: "5", label: "5" }, { value: "6", label: "6" },
  { value: "7", label: "7" }, { value: "8", label: "8" }, { value: "9", label: "9" },
] as const;

// ── Sources panel ────────────────────────────────────────────────────────────
// enabledSourceData also feeds the Source filter dropdown below; the enable/
// disable wiring itself now lives inside SourcesPickerPanel.
const { data: enabledSourceData } = useEnabledSources();
const { data: availableSourceData, isLoading: sourcesLoading } = useAvailableLibrarySpellSources();
</script>
