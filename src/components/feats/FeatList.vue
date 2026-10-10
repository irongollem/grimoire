<template>
  <div v-if="isLoading" class="flex justify-center py-16">
    <LoadingSpinner />
  </div>

  <EmptyState
    v-else-if="filtered.length === 0 && !codexUi.featsHasActiveFilters"
    title="No feats yet"
    description="Feats are options a character can take, like Alert or Grappler. Add your own here."
  >
    <AppButton to="/feats/new" variant="primary" size="md" :icon="IconAdd" label="New Feat" />
  </EmptyState>

  <EmptyState
    v-else-if="filtered.length === 0"
    title="No results"
    description="Try adjusting your search, category or edition filter."
  />

  <div v-else class="divide-y divide-border">
    <FeatureListRow v-for="feat in filtered" :key="feat.id" :feature="feat" :to="`/features/${feat.id}`">
      <template #badges>
        <AppButton v-if="feat.feat_category" as="span" variant="tinted" tone="neutral" emphasis="soft" size="xs" :label="FEAT_CATEGORY_LABELS[feat.feat_category]" />
        <AppButton v-if="feat.ruleset" as="span" variant="tinted" tone="neutral" emphasis="soft" size="xs" :label="feat.ruleset" />
      </template>
    </FeatureListRow>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconAdd } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import FeatureListRow from "@/components/features/FeatureListRow.vue";
import { useCodexUiStore } from "@/stores/ui/codex";
import { useAllFeats } from "@/composables/rules/useFeatures";
import { FEAT_CATEGORY_LABELS } from "@/types/feature.types";

const codexUi = useCodexUiStore();
const { data: all, isLoading } = useAllFeats();

const filtered = computed(() => {
  const search = codexUi.featsSearch.toLowerCase();
  const category = codexUi.featsFilterCategory;
  const edition = codexUi.featsFilterEdition;
  return (all.value ?? []).filter(f => {
    if (category !== "all" && f.feat_category !== category) return false;
    if (edition !== "all" && f.ruleset !== edition) return false;
    if (search && !f.name.toLowerCase().includes(search) && !(f.prerequisite ?? "").toLowerCase().includes(search) && !f.tags.some(t => t.toLowerCase().includes(search))) return false;
    return true;
  });
});
</script>
