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
          <AppButton
            variant="subtle"
            size="icon-sm"
            :active="pickerOpen"
            :icon="IconLibrary"
            class="shrink-0"
            tooltip="Manage spell sources for this campaign"
            @click="toggle"
          />
        </template>
      </SourcesPickerPanel>

      <ListActionButton
        :icon="IconListTodo"
        :label="selecting ? 'Done' : 'Select'"
        :active="selecting"
        :collapse-label-on-mobile="false"
        @click="toggleSelecting"
      />
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

    <BulkScopeBar
      v-if="selecting"
      :count="selectedCount"
      :selectable-count="(spellListRef?.selectableIds ?? []).length"
      :busy="isMovingScope"
      :campaign-name="campaignStore.activeCampaign?.name ?? null"
      @select-all="selectAll(spellListRef?.selectableIds ?? [])"
      @clear="clearSelection"
      @stop="stopSelecting"
      @move="handleMove"
      @copy="handleCopyOpen"
    />
    <CopyToCampaignDialog
      :open="copyOpen"
      table="spells"
      :ids="copyIds"
      label="spell"
      @close="copyOpen = false"
      @copied="onCopied"
    />
    <SpellList
      ref="spellListRef"
      :search="ui.spellsSearch"
      :level-filter="ui.spellsFilterLevel"
      :school-filter="ui.spellsFilterSchool"
      :class-filter="ui.spellsFilterClass"
      :source-filter="ui.spellsFilterSource"
      :selecting="selecting"
      :selected-ids="selectedIds"
      @toggle-select="toggleRowSelection"
    />
  </ListPageLayout>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { IconAdd, IconGenerate, IconLibrary, IconListTodo } from '@/lib/icons';
import { useUiStore } from "@/stores/ui";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import AppButton from "@/components/common/AppButton.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterGroup from "@/components/common/ListFilterGroup.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import SpellList from "@/components/spells/SpellList.vue";
import BulkScopeBar from "@/components/common/BulkScopeBar.vue";
import CopyToCampaignDialog from "@/components/common/CopyToCampaignDialog.vue";
import SourcesPickerPanel from "@/components/common/SourcesPickerPanel.vue";
import { SPELL_SCHOOLS, SPELL_CLASSES } from "@/types/spell.types";
import { useEnabledSources, useAvailableLibrarySpellSources } from "@/composables/library/useEnabledSources";
import { useBulkSelection } from "@/composables/useBulkSelection";
import { useCopyToCampaignFlow } from "@/composables/campaign/useCopyToCampaignFlow";
import { useMoveToCampaignFlow } from "@/composables/campaign/useMoveToCampaignFlow";
import { useCampaignStore } from "@/stores/campaign";

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

// ── Bulk move-to-campaign (#875) ─────────────────────────────────────────────
const {
  selecting,
  selectedIds,
  count: selectedCount,
  toggle: toggleRowSelection,
  selectAll,
  clear: clearSelection,
  stop: stopSelecting,
  pruneTo,
} = useBulkSelection();
const campaignStore = useCampaignStore();
const spellListRef = ref<InstanceType<typeof SpellList> | null>(null);

function toggleSelecting() {
  if (selecting.value) stopSelecting();
  else selecting.value = true;
}

// The selection lives here, but which ids are still selectable is decided by
// SpellList's own filters — a search/level/school/class edit there can leave
// this selection holding an id for a row no longer shown. Prune whenever
// that exposed set changes (#875).
watch(
  () => spellListRef.value?.selectableIds ?? [],
  (ids) => pruneTo(ids),
);

const { moving: isMovingScope, move: handleMove } = useMoveToCampaignFlow({
  table: "spells",
  noun: "spell",
  selectableIds: () => spellListRef.value?.selectableIds ?? [],
  pruneTo,
  stop: stopSelecting,
  campaignName: () => campaignStore.activeCampaign?.name ?? null,
});

// ── Bulk copy-to-campaign (#598) ─────────────────────────────────────────────
// Same staleness discipline as handleMove: the selection can hold an id for a
// row the current filters no longer show (#875), and a copy batched from it
// would be just as wrong as a move would be — `useCopyToCampaignFlow` prunes
// at open time for exactly this reason. It also ends selection mode on a
// successful copy, exactly as `handleMove` does: a copy does not remove the
// originals from this list, so keeping the selection would be defensible —
// but the bulk surfaces have to agree on what finishing a bulk action looks
// like, and every `move` already ends it.
const { copyOpen, copyIds, openCopy: handleCopyOpen, onCopied } = useCopyToCampaignFlow({
  noun: "spell",
  selectableIds: () => spellListRef.value?.selectableIds ?? [],
  pruneTo,
  stop: stopSelecting,
});
</script>
