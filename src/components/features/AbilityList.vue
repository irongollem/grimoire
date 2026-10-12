<template>
  <ListSkeleton v-if="isLoading" :variant="layout === 'rows' ? 'tiles' : 'text'" :columns="layout === 'rows' ? 1 : 4" :count="8" />

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

  <FeatureCollection
    v-else
    :features="filtered"
    list-key="codex-abilities"
    :fallback-icon="IconLightning"
    :badges-for="badgesFor"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconAdd, IconLightning } from '@/lib/icons';
import AppButton from "@/components/common/controls/AppButton.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import FeatureCollection from "@/components/features/FeatureCollection.vue";
import { useListLayout } from "@/composables/useListLayout";
import { useCodexUiStore } from "@/stores/ui/codex";
import { useAllFeatures } from "@/composables/rules/useFeatures";
import { ACTIVATION_LABELS, type ClassFeature } from "@/types/feature.types";

const codexUi = useCodexUiStore();
const { data: all, isLoading } = useAllFeatures();
// The Codex header's toggle writes the same key.
const layout = useListLayout("codex-abilities", "rows");

function badgesFor(feat: ClassFeature): string[] {
  return [feat.mechanics.activation ? ACTIVATION_LABELS[feat.mechanics.activation] : "Passive"];
}

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
