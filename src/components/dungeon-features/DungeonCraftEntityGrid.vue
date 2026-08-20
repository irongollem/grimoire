<template>
  <div v-if="isLoading" class="flex justify-center py-16">
    <LoadingSpinner />
  </div>
  <template v-else-if="items?.length">
    <div class="flex flex-wrap items-center gap-2 mb-4">
      <AppInput
        v-model="searchModel"
        type="search"
        tone="card"
        size="body"
        :block="false"
        class="flex-1 min-w-40"
        :placeholder="searchPlaceholder"
      />
      <slot name="filters" />
    </div>
    <p v-if="!filteredCount" class="text-center text-body text-muted-foreground italic py-8">
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
import { computed } from "vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import AppInput from "@/components/common/AppInput.vue";

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

// AppInput requires a v-model; this component receives its search value as a
// prop and re-emits `update:search`, so the model is a writable proxy over
// that prop/emit pair rather than a local ref.
const searchModel = computed({
  get: () => search,
  set: (value: string) => emit("update:search", value),
});
</script>
