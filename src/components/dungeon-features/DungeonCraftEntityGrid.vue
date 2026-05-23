<template>
  <div v-if="isLoading" class="flex justify-center py-16">
    <LoadingSpinner />
  </div>
  <template v-else-if="items?.length">
    <div class="flex flex-wrap items-center gap-2 mb-4">
      <input
        :value="search"
        type="search"
        :placeholder="searchPlaceholder"
        class="flex-1 min-w-40 bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="emit('update:search', ($event.target as HTMLInputElement).value)"
      />
      <slot name="filters" />
    </div>
    <p v-if="!filteredCount" class="text-center font-fell text-sm text-muted-foreground italic py-8">
      {{ noMatchText }}
    </p>
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      <slot name="card" />
    </div>
  </template>
  <EmptyState
    v-else
    :icon="emptyIcon"
    :title="emptyTitle"
    :description="emptyDescription"
    :action-label="emptyActionLabel"
    @action="emit('empty-action')"
  />
</template>

<script setup lang="ts">
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";

const {
  items,
  isLoading,
  search,
  filteredCount,
  searchPlaceholder = "Search…",
  noMatchText = "No items match your filter.",
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
} = defineProps<{
  items: unknown[] | undefined;
  isLoading: boolean;
  search: string;
  filteredCount: number;
  searchPlaceholder?: string;
  noMatchText?: string;
  emptyIcon: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyActionLabel: string;
}>();

const emit = defineEmits<{
  "update:search": [value: string];
  "empty-action": [];
}>();
</script>
