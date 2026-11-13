<template>
  <DungeonCraftEntityGrid
    :items="features"
    :is-loading="featuresLoading"
    v-model:search="featuresSearch"
    :shown="filteredFeatures"
    :item-key="featureKey"
    list-key="dungeon-features"
    search-placeholder="Search features…"
    no-match-text="No features match your filter."
    empty-icon="DoorOpen"
    empty-title="No dungeon features yet"
    :empty-description="emptyDescription"
    empty-action-label="New Feature"
    :ledger="FEATURE_LEDGER"
    @empty-action="router.push('/dungeon-features/new')"
  >
    <template #filters>
      <AppSelect v-model="featuresTypeFilter" tone="card" size="body">
        <option value="">All Types</option>
        <option v-for="t in DUNGEON_FEATURE_TYPES" :key="t" :value="t">{{ t }}</option>
      </AppSelect>
    </template>
    <template #card="{ item: feature }">
      <DungeonCraftCard
        :to="`/dungeon-features/${feature.id}`"
        :name="feature.name"
        kind="Dungeon feature"
        :type="feature.feature_type"
        :type-class="DUNGEON_FEATURE_TYPE_BG[feature.feature_type]"
        :image-url="feature.image_url"
        :focal-point="feature.image_focal_point"
        :placeholder="placeholderUrl('dungeonfeature')"
        :subtitle="featureSubtitle(feature)"
        :rooms="placedInRows(feature.id)"
        :source="isLibraryFeature(feature) ? feature.source : undefined"
      />
    </template>
    <template #row="{ item: feature }">
      <EntityListRow
        :to="`/dungeon-features/${feature.id}`"
        :title="feature.name"
        :subtitle="featureSubtitle(feature)"
        :image-url="feature.image_url"
        :fallback-icon="IconNavDungeonCraft"
        :tags="featureTags(feature)"
        :cells="[featureSubtitle(feature), featureSource(feature)]"
      />
    </template>
  </DungeonCraftEntityGrid>
</template>

<script setup lang="ts">
import { useDungeonCraftBooksOffered } from "@/composables/library/useEnabledSources";
import { useSourceTitles } from "@/composables/library/useSourceTitles";
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useDungeonFeatureIndex } from "@/composables/dungeon-features/useDungeonFeatures";
import { isLibraryFeature } from "@/lib/dungeon-features/library";
import { usePlacedInRooms } from "@/composables/dungeon-features/usePlacedInRooms";
import { DUNGEON_FEATURE_TYPES, DUNGEON_FEATURE_TYPE_BG } from "@/types/dungeonFeature.types";
import EntityListRow from "@/components/common/entity/EntityListRow.vue";
import { IconNavDungeonCraft } from "@/lib/icons";
import type { DungeonFeatureEntry } from "@/types/dungeonFeature.types";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import DungeonCraftEntityGrid from "./DungeonCraftEntityGrid.vue";
import DungeonCraftCard from "./DungeonCraftCard.vue";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";

const router = useRouter();
const { labelFor } = useSourceTitles();

// Low art's ledger (#1179, frame 03): the subtitle as one column, then the source.
const FEATURE_LEDGER = [
  { label: "Details", track: "minmax(0,1fr)" },
  { label: "Source", track: "10rem" },
];
function featureSource(feature: DungeonFeatureEntry): string | null {
  return isLibraryFeature(feature) ? labelFor(feature.source) : null;
}

// Only library rows carry a source; an own row's tags start at its type.
function featureTags(feature: DungeonFeatureEntry): string[] {
  const label = isLibraryFeature(feature) ? labelFor(feature.source) : null;
  return label ? [label, feature.feature_type, ...feature.tags] : [feature.feature_type, ...feature.tags];
}
// An empty list with Grimoire's books on offer means none is switched on (#1060).
const booksOffered = useDungeonCraftBooksOffered();
const emptyDescription = computed(() =>
  booksOffered.value ? "Switch on a book from the book icon above, or create your own." : "Add secret doors, hidden passages, treasure chests and more.",
);

const { data: features, isLoading: featuresLoading } = useDungeonFeatureIndex();
const featuresSearch     = ref("");
const featuresTypeFilter = ref("");

// ── Placed in (#868, S8, frame 11) ────────────────────────────────────────────
const featureIds = computed(() => (features.value ?? []).map((f) => f.id));
const { placedInRows } = usePlacedInRooms("dungeon_feature", featureIds);

const featureKey = (feature: DungeonFeatureEntry) => feature.id;
function featureSubtitle(feature: DungeonFeatureEntry): string | null {
  const parts = [feature.trigger_type, feature.perception_dc ? `Perc ${feature.perception_dc}` : null,
    feature.object_ac !== null ? `AC ${feature.object_ac}` : null,
  ];
  return parts.filter((p): p is string => !!p).join(" · ") || null;
}

const filteredFeatures = computed(() => {
  let list = features.value ?? [];
  if (featuresTypeFilter.value) list = list.filter((f) => f.feature_type === featuresTypeFilter.value);
  const q = featuresSearch.value.toLowerCase().trim();
  if (q) list = list.filter((f) =>
    f.name.toLowerCase().includes(q) ||
    (f.trigger_type ?? "").toLowerCase().includes(q) ||
    f.tags.some((t) => t.toLowerCase().includes(q)),
  );
  return list;
});
</script>
