<template>
  <div class="shrink-0 px-4 py-3 border-b border-border bg-background flex items-center gap-3 flex-wrap">
    <RouterLink
      to="/npcs"
      class="inline-flex items-center gap-1 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
    >
      <IconChevronLeft class="h-3.5 w-3.5" />
      NPCs
    </RouterLink>
    <span class="text-border">|</span>
    <h1 class="font-cinzel text-sm font-bold tracking-wider text-foreground">Relationship Web</h1>
    <ManualHelpLink page="npc-relationship-web" />

    <div class="ml-auto flex items-center gap-2 flex-wrap">
      <ListFilterBar :has-active-filters="hasActiveFilters" @clear="$emit('clear')">
        <!--
          Narrower than the list-page default: this bar also carries the page
          title and the legend, so the search does not get to grow into it.
        -->
        <ListSearchInput
          v-model="searchModel"
          :inline="false"
          placeholder="Filter nodes…"
          class="max-w-36"
        />

        <!--
          Show-PCs toggle. `tinted`/`caution` when on is the tokenised form of
          the amber this used to hard-code; `outline` off keeps it neutral, so
          the two states still read as on/off rather than two shades of amber.
        -->
        <AppButton
          :variant="showPcs ? 'tinted' : 'outline'"
          tone="caution"
          emphasis="strong"
          size="md"
          :icon="IconShield"
          label="Party Members"
          @click="$emit('update:showPcs', !showPcs)"
        />

        <ListFilterSelect v-model="locationModel" aria-label="Location filter">
          <option value="">All Locations</option>
          <option v-for="loc in locationOptions" :key="loc.id" :value="loc.id">
            {{ '  '.repeat(loc.depth) }}{{ loc.name }}
          </option>
        </ListFilterSelect>

        <ListFilterSelect v-model="typeModel" aria-label="Relationship type filter">
          <option value="">All Relationships</option>
          <option v-for="[k, label] in typeOptions" :key="k" :value="k">{{ label }}</option>
        </ListFilterSelect>
      </ListFilterBar>

      <!-- Legend -->
      <div class="flex items-center gap-3 pl-2 border-l border-border">
        <span v-for="[type, color] in legendItems" :key="type" class="flex items-center gap-1.5 text-label text-muted-foreground">
          <span class="inline-block h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: color }" />
          {{ type }}
        </span>
        <span class="flex items-center gap-1.5 text-label text-muted-foreground">
          <span class="inline-block w-5 border-t-2 border-dashed border-muted-foreground/70" />
          PC link
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { IconChevronLeft, IconShield } from '@/lib/icons';
import AppButton from '@/components/common/AppButton.vue';
import ListFilterBar from '@/components/common/ListFilterBar.vue';
import ListFilterSelect from '@/components/common/ListFilterSelect.vue';
import ListSearchInput from '@/components/common/ListSearchInput.vue';
import ManualHelpLink from '@/components/common/ManualHelpLink.vue';
import type { NpcRelationshipType } from '@/types/npc.types';

interface LocationOption {
  id: string;
  name: string;
  depth: number;
}

const {
  searchQuery,
  showPcs,
  locationFilter,
  typeFilter,
  locationOptions,
  typeOptions,
  legendItems,
} = defineProps<{
  searchQuery: string;
  showPcs: boolean;
  locationFilter: string;
  typeFilter: NpcRelationshipType | '';
  locationOptions: LocationOption[];
  typeOptions: [NpcRelationshipType, string][];
  legendItems: [string, string][];
  /** Drives the Clear button in the filter bar. */
  hasActiveFilters?: boolean;
}>();

const emit = defineEmits<{
  'update:searchQuery': [value: string];
  'update:showPcs': [value: boolean];
  'update:locationFilter': [value: string];
  'update:typeFilter': [value: NpcRelationshipType | ''];
  clear: [];
}>();

// The list primitives take a v-model; the bar stays prop/emit-driven so the
// view owns where the state lives. These bridge the two.
const searchModel = computed({
  get: () => searchQuery,
  set: (v) => emit('update:searchQuery', v),
});
const locationModel = computed({
  get: () => locationFilter,
  set: (v) => emit('update:locationFilter', v),
});
const typeModel = computed({
  get: () => typeFilter as string,
  set: (v) => emit('update:typeFilter', v as NpcRelationshipType | ''),
});
</script>
