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

        <!--
          Combobox rather than a select for both of these: a campaign carries
          hundreds of locations and can carry dozens of factions, which is the
          dynamic-and-numerous case the native control is explicitly not for.
          Relationship type stays a select — fifteen fixed values that change
          only when the enum does.
        -->
        <EntityCombobox
          :model-value="locationFilter"
          :options="locationOptions"
          placeholder="All locations"
          class="min-w-40"
          @update:model-value="emit('update:locationFilter', $event)"
        >
          <template #option="{ opt }">
            <span :style="{ paddingLeft: `${(opt as LocationOption).depth * 12}px` }">{{ opt.name }}</span>
          </template>
        </EntityCombobox>

        <ListFilterSelect v-model="typeModel" aria-label="Relationship type filter">
          <option value="">All Relationships</option>
          <option v-for="[k, label] in typeOptions" :key="k" :value="k">{{ label }}</option>
        </ListFilterSelect>

        <!--
          Focus, not a filter: unlike the others this hides nothing. It draws a
          boundary round one faction's members and dims everyone else, so you can
          still see the guild's reach into the rest of the web.
        -->
        <EntityCombobox
          :model-value="focusFaction"
          :options="factionOptions"
          placeholder="Focus a faction…"
          class="min-w-40"
          @update:model-value="emit('update:focusFaction', $event)"
        />
      </ListFilterBar>

      <!--
        The legend doubles as the attitude filter. It was already a row of
        labelled swatches sitting next to a filter bar, so making it inert was
        the odd choice: clicking Hostile shows only the hostile, clicking it
        again puts everyone back.

        Selected entries stay full strength and the rest fade, which is the same
        grammar the faction focus uses — the swatch you chose is the one thing
        still lit.
      -->
      <div class="flex items-center gap-1 pl-2 border-l border-border">
        <button
          v-for="item in legendItems"
          :key="item.value"
          type="button"
          class="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-label transition-opacity hover:bg-muted"
          :class="relationshipFilter && relationshipFilter !== item.value
            ? 'opacity-40 text-muted-foreground'
            : 'text-muted-foreground'"
          :aria-pressed="relationshipFilter === item.value"
          :title="`Show only ${item.label.toLowerCase()} NPCs`"
          @click="emit('update:relationshipFilter', relationshipFilter === item.value ? '' : item.value)"
        >
          <span class="inline-block h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: item.color }" />
          {{ item.label }}
        </button>
        <span class="flex items-center gap-1.5 pl-1.5 text-label text-muted-foreground">
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
import EntityCombobox from '@/components/common/EntityCombobox.vue';
import ListFilterSelect from '@/components/common/ListFilterSelect.vue';
import ListSearchInput from '@/components/common/ListSearchInput.vue';
import ManualHelpLink from '@/components/common/ManualHelpLink.vue';
import type { NpcRelationship, NpcRelationshipType } from '@/types/npc.types';

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
  focusFaction,
  relationshipFilter,
  locationOptions,
  typeOptions,
  factionOptions,
  legendItems,
} = defineProps<{
  searchQuery: string;
  showPcs: boolean;
  locationFilter: string;
  typeFilter: NpcRelationshipType | '';
  focusFaction: string;
  relationshipFilter: NpcRelationship | '';
  locationOptions: LocationOption[];
  typeOptions: [NpcRelationshipType, string][];
  factionOptions: { id: string; name: string }[];
  legendItems: { value: NpcRelationship; label: string; color: string }[];
  /** Drives the Clear button in the filter bar. */
  hasActiveFilters?: boolean;
}>();

const emit = defineEmits<{
  'update:searchQuery': [value: string];
  'update:showPcs': [value: boolean];
  'update:locationFilter': [value: string];
  'update:typeFilter': [value: NpcRelationshipType | ''];
  'update:focusFaction': [value: string];
  'update:relationshipFilter': [value: NpcRelationship | ''];
  clear: [];
}>();

// The list primitives take a v-model; the bar stays prop/emit-driven so the
// view owns where the state lives. These bridge the two.
const searchModel = computed({
  get: () => searchQuery,
  set: (v) => emit('update:searchQuery', v),
});
const typeModel = computed({
  get: () => typeFilter as string,
  set: (v) => emit('update:typeFilter', v as NpcRelationshipType | ''),
});
</script>
