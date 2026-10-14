<template>
  <div class="p-4 md:p-6">
    <EntityCollection
      :items="features"
      :item-key="featureKey"
      :layout="layout"
      :grid-columns="columns"
      :grid-row-estimate="GRID_ROW_PX"
      :row-estimate="ROW_PX"
    >
      <template #card="{ item: feat }">
        <EntityTextCard
          :to="`/features/${feat.id}`"
          :title="feat.name"
          :subtitle="feat.prerequisite"
          :fallback-icon="fallbackIcon"
          :tags="tagsFor(feat)"
        />
      </template>
      <template #row="{ item: feat }">
        <EntityListRow
          :to="`/features/${feat.id}`"
          :title="feat.name"
          :subtitle="feat.prerequisite"
          :fallback-icon="fallbackIcon"
          :tags="tagsFor(feat)"
          :max-tags="5"
        />
      </template>
    </EntityCollection>
  </div>
</template>

<script setup lang="ts">
import type { Component } from "vue";
import EntityCollection from "@/components/common/list/EntityCollection.vue";
import EntityListRow from "@/components/common/entity/EntityListRow.vue";
import EntityTextCard from "@/components/common/entity/EntityTextCard.vue";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import { useListLayout } from "@/composables/useListLayout";
import { useSourceTitles } from "@/composables/library/useSourceTitles";
import type { ClassFeature } from "@/types/feature.types";

/**
 * The body of the Abilities and Feats tabs: the same feature rows in either
 * layout. The parent decides what is leading the tag line (`badgesFor`: an
 * activation, a feat category); the official mark, the book and the feature's
 * own tags follow.
 */
const { features, listKey, fallbackIcon, badgesFor } = defineProps<{
  features: ClassFeature[];
  /** The `useListLayout` key the header toggle writes. */
  listKey: string;
  fallbackIcon: Component;
  badgesFor: (feature: ClassFeature) => string[];
}>();

const layout = useListLayout(listKey, "rows");
const columns = useBreakpointColumns({ base: 1, sm: 2, lg: 3, xl: 4 });
const { labelFor } = useSourceTitles();
const featureKey = (f: ClassFeature) => f.id;

function tagsFor(feat: ClassFeature): string[] {
  const book = labelFor(feat.source);
  return [...(book ? [book] : []), ...badgesFor(feat), ...feat.tags];
}

// Row heights before measuring (px). Row: p-4 (32) + border (2) + title 20,
// prerequisite 18, tags 26 = 98. Card: p-4 (32) + border (2) + header 40 +
// gap 8 + tags 26 (pt-1 + 22) = 108.
const ROW_PX = 98;
const GRID_ROW_PX = 108;
</script>
