<template>
  <div class="flex items-center gap-2">
    <div class="relative flex-1">
      <IconSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <input
        :value="search"
        type="text"
        placeholder="Search locations…"
        class="w-full rounded-md border border-border bg-muted/40 pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="$emit('update:search', ($event.target as HTMLInputElement).value)"
      />
    </div>
    <select
      :value="typeFilter"
      aria-label="Location type filter"
      class="rounded-md border border-border bg-muted/40 px-2 py-1.5 text-label md:text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      @change="$emit('update:typeFilter', ($event.target as HTMLSelectElement).value)"
    >
      <option value="all">All types</option>
      <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
    </select>
    <button
      v-if="hasActiveFilters"
      type="button"
      class="text-label md:text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
      @click="$emit('clear')"
    >Clear</button>
  </div>
</template>

<script setup lang="ts">
import { IconSearch } from '@/lib/icons';

interface TypeOption {
  value: string;
  label: string;
}

const { search, typeFilter, typeOptions } = defineProps<{
  search: string;
  typeFilter: string;
  typeOptions: TypeOption[];
  hasActiveFilters: boolean;
}>();

defineEmits<{
  'update:search': [value: string];
  'update:typeFilter': [value: string];
  clear: [];
}>();
</script>
