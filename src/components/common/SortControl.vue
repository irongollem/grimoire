<template>
  <div class="flex items-center rounded-md border border-border overflow-hidden">
    <div class="flex items-center gap-1 pl-2 pr-1 text-muted-foreground">
      <IconSort class="h-3.5 w-3.5" />
    </div>
    <select
      v-model="sortBy"
      class="bg-card py-1.5 pr-1 font-cinzel text-xs font-semibold tracking-wider text-foreground focus:outline-none cursor-pointer"
      aria-label="Sort by"
    >
      <option v-for="opt in options" :key="opt.value" :value="opt.value">
        {{ opt.label }}
      </option>
    </select>
    <button
      v-if="sortBy !== 'manual'"
      type="button"
      class="flex items-center justify-center border-l border-border px-2 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
      :title="sortDir === 'asc' ? 'Ascending — click for descending' : 'Descending — click for ascending'"
      @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"
    >
      <IconChevronUp v-if="sortDir === 'asc'" class="h-3.5 w-3.5" />
      <IconChevronDown v-else class="h-3.5 w-3.5" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { IconSort, IconChevronUp, IconChevronDown } from "@/lib/icons";
import type { SortField, SortDir } from "@/lib/noteSort";

defineProps<{
  options: readonly { value: SortField; label: string }[];
}>();

const sortBy = defineModel<SortField>("sortBy", { required: true });
const sortDir = defineModel<SortDir>("sortDir", { required: true });
</script>
