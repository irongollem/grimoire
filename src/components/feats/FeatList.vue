<template>
  <ListSkeleton v-if="isLoading" :variant="layout === 'rows' ? 'tiles' : 'text'" :columns="layout === 'rows' ? 1 : 4" :count="8" />

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

  <FeatureCollection
    v-else
    :features="filtered"
    list-key="codex-feats"
    :fallback-icon="IconAward"
    :badges-for="badgesFor"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconAdd, IconAward } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import FeatureCollection from "@/components/features/FeatureCollection.vue";
import { useListLayout } from "@/composables/useListLayout";
import { useCodexUiStore } from "@/stores/ui/codex";
import { useAllFeats } from "@/composables/rules/useFeatures";
import { FEAT_CATEGORY_LABELS, type ClassFeature } from "@/types/feature.types";

const codexUi = useCodexUiStore();
const { data: all, isLoading } = useAllFeats();
// The Codex header's toggle writes the same key.
const layout = useListLayout("codex-feats", "rows");

function badgesFor(feat: ClassFeature): string[] {
  const badges: string[] = [];
  if (feat.feat_category) badges.push(FEAT_CATEGORY_LABELS[feat.feat_category]);
  if (feat.ruleset) badges.push(feat.ruleset);
  return badges;
}

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
