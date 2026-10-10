<template>
  <div v-if="isLoading" class="flex justify-center py-16">
    <LoadingSpinner />
  </div>

  <EmptyState
    v-else-if="filtered.length === 0 && !codexUi.featuresHasActiveFilters"
    title="No abilities yet"
    description="Add class features, special abilities, and passive traits here. Custom subclasses and classes can then reference them by name."
  >
    <AppButton to="/features/new" variant="primary" size="md" :icon="IconAdd" label="New Ability" />
  </EmptyState>

  <EmptyState
    v-else-if="filtered.length === 0"
    title="No results"
    description="Try adjusting your search or type filter."
  />

  <div v-else class="divide-y divide-border">
    <FeatureListRow v-for="feat in filtered" :key="feat.id" :feature="feat" :to="`/features/${feat.id}`">
      <template #badges>
        <AppButton
          as="span"
          variant="tinted"
          tone="neutral"
          emphasis="soft"
          size="xs"
          :label="feat.mechanics.activation ? ACTIVATION_LABELS[feat.mechanics.activation] : 'Passive'"
        />
      </template>
    </FeatureListRow>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconAdd } from '@/lib/icons';
import AppButton from "@/components/common/controls/AppButton.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import FeatureListRow from "@/components/features/FeatureListRow.vue";
import { useCodexUiStore } from "@/stores/ui/codex";
import { useAllFeatures } from "@/composables/rules/useFeatures";
import { ACTIVATION_LABELS } from "@/types/feature.types";

const codexUi = useCodexUiStore();
const { data: all, isLoading } = useAllFeatures();

/** Abilities are the granted features; the feats have their own tab. */
const filtered = computed(() => {
  const search = codexUi.featuresSearch.toLowerCase();
  const activation = codexUi.featuresFilterActivation;
  return (all.value ?? []).filter(f => {
    if (f.kind !== "feature") return false;
    if (activation === "passive" ? !!f.mechanics.activation : activation !== "all" && f.mechanics.activation !== activation) return false;
    if (search && !f.name.toLowerCase().includes(search) && !f.tags.some(t => t.toLowerCase().includes(search))) return false;
    return true;
  });
});
</script>
