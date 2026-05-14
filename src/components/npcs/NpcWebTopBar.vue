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

    <div class="ml-auto flex items-center gap-2 flex-wrap">
      <!-- Search -->
      <div class="relative">
        <IconSearch class="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          :value="searchQuery"
          type="text"
          placeholder="Filter nodes…"
          class="pl-7 pr-3 py-1.5 rounded-md border border-border bg-card font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-36"
          @input="$emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
        />
      </div>

      <!-- Show PCs toggle -->
      <button
        type="button"
        class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border font-cinzel text-xs font-semibold tracking-wider transition-colors"
        :class="showPcs
          ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
          : 'border-border text-muted-foreground hover:text-foreground'"
        @click="$emit('update:showPcs', !showPcs)"
      >
        <IconShield class="h-3 w-3" />
        Party Members
      </button>

      <!-- Location filter -->
      <select
        :value="locationFilter"
        class="px-2.5 py-1.5 rounded-md border border-border bg-card font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @change="$emit('update:locationFilter', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">All Locations</option>
        <option v-for="loc in locationOptions" :key="loc.id" :value="loc.id">
          {{ '  '.repeat(loc.depth) }}{{ loc.name }}
        </option>
      </select>

      <!-- Relationship type filter -->
      <select
        :value="typeFilter"
        class="px-2.5 py-1.5 rounded-md border border-border bg-card font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @change="$emit('update:typeFilter', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">All Relationships</option>
        <option v-for="[k, label] in typeOptions" :key="k" :value="k">{{ label }}</option>
      </select>

      <!-- Legend -->
      <div class="flex items-center gap-3 pl-2 border-l border-border">
        <span v-for="[type, color] in legendItems" :key="type" class="flex items-center gap-1.5 font-cinzel text-[10px] tracking-wider text-muted-foreground">
          <span class="inline-block h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: color }" />
          {{ type }}
        </span>
        <span class="flex items-center gap-1.5 font-cinzel text-[10px] tracking-wider text-muted-foreground">
          <span class="inline-block w-5 border-t-2 border-dashed border-muted-foreground/70" />
          PC link
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { IconChevronLeft, IconSearch, IconShield } from '@/lib/icons';
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
}>();

defineEmits<{
  'update:searchQuery': [value: string];
  'update:showPcs': [value: boolean];
  'update:locationFilter': [value: string];
  'update:typeFilter': [value: NpcRelationshipType | ''];
}>();
</script>
