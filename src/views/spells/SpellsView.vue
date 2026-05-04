<template>
  <ListPageLayout title="Spellbook" description="Your custom spell compendium">
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
          <Library class="size-3.5 shrink-0" />
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
            <Loader2 class="size-4 animate-spin text-muted-foreground" />
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
        :icon="Wand2"
        label="Generate"
        @click="ui.spellGeneratorOpen = true"
      />
      <ListActionButton
        :icon="Plus"
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
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { onClickOutside } from "@vueuse/core";
import { Plus, Wand2, Loader2, Library } from "lucide-vue-next";
import { useUiStore } from "@/stores/ui";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterGroup from "@/components/common/ListFilterGroup.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import SpellList from "@/components/spells/SpellList.vue";
import { SPELL_SCHOOLS, SPELL_CLASSES } from "@/types/spell.types";
import {
  useEnabledSources,
  useAvailableSrdSpellSources,
  useEnableSource,
  useDisableSource,
  type AvailableSrdSource,
} from "@/composables/useEnabledSources";

const ui = useUiStore();

const LEVEL_FILTERS = [
  { value: "", label: "All" },
  { value: "0", label: "C" },
  { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" },
  { value: "4", label: "4" }, { value: "5", label: "5" }, { value: "6", label: "6" },
  { value: "7", label: "7" }, { value: "8", label: "8" }, { value: "9", label: "9" },
] as const;

// ── Sources panel ────────────────────────────────────────────────────────────
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
</script>
