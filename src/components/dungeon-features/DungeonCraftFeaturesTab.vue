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
    @empty-action="router.push('/dungeon-features/new')"
  >
    <template #filters>
      <AppSelect v-model="featuresTypeFilter" tone="card" size="body">
        <option value="">All Types</option>
        <option v-for="t in DUNGEON_FEATURE_TYPES" :key="t" :value="t">{{ t }}</option>
      </AppSelect>
    </template>
    <template #card="{ item: feature }">
      <RouterLink
        :to="`/dungeon-features/${feature.id}`"
        class="flex h-full flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors group"
      >
        <div class="relative aspect-square bg-muted overflow-hidden shrink-0">
          <FocalImage
            :src="feature.image_url"
            :alt="feature.name"
            format="portrait"
            :focal-point="feature.image_focal_point"
            :placeholder="placeholderUrl('dungeonfeature')"
            class="group-hover:scale-105 transition-transform duration-300"
            ai-badge="right"
          />
          <span
            class="absolute top-2 left-2 text-label px-1.5 py-0.5 rounded text-white font-bold"
            :class="DUNGEON_FEATURE_TYPE_BG[feature.feature_type]"
          >{{ feature.feature_type }}</span>
        </div>
        <div class="p-2.5 flex flex-col gap-1">
          <div class="flex items-start justify-between gap-2">
            <h3 class="flex-1 text-heading-xs font-bold text-foreground leading-tight truncate">{{ feature.name }}</h3>
            <div class="flex shrink-0 items-center gap-1">
              <SourceBadge :source="isLibraryFeature(feature) ? feature.source : undefined" class="max-w-22 truncate" />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span v-if="feature.trigger_type" class="text-caption-sm text-muted-foreground italic truncate">
              {{ feature.trigger_type }}
            </span>
            <span v-if="feature.perception_dc" class="text-label text-muted-foreground">
              Perc {{ feature.perception_dc }}
            </span>
            <span v-if="feature.object_ac !== null" class="text-label text-muted-foreground">
              AC {{ feature.object_ac }}
            </span>
          </div>
          <PlacedInLine :rooms="placedInRows(feature.id)" />
        </div>
      </RouterLink>
    </template>
    <template #row="{ item: feature }">
      <EntityListRow
        :to="`/dungeon-features/${feature.id}`"
        :title="feature.name"
        :subtitle="featureSubtitle(feature)"
        :image-url="feature.image_url"
        :fallback-icon="IconNavDungeonCraft"
        :tags="featureTags(feature)"
      />
    </template>
  </DungeonCraftEntityGrid>
</template>

<script setup lang="ts">
import { useDungeonCraftBooksOffered } from "@/composables/library/useEnabledSources";
import { useSourceTitles } from "@/composables/library/useSourceTitles";
import SourceBadge from "@/components/common/entity/SourceBadge.vue";
import { ref, computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { useDungeonFeatureIndex } from "@/composables/dungeon-features/useDungeonFeatures";
import { isLibraryFeature } from "@/lib/dungeon-features/library";
import { usePlacedInRooms } from "@/composables/dungeon-features/usePlacedInRooms";
import { DUNGEON_FEATURE_TYPES, DUNGEON_FEATURE_TYPE_BG } from "@/types/dungeonFeature.types";
import EntityListRow from "@/components/common/entity/EntityListRow.vue";
import { IconNavDungeonCraft } from "@/lib/icons";
import type { DungeonFeatureEntry } from "@/types/dungeonFeature.types";
import FocalImage from "@/components/common/media/FocalImage.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import DungeonCraftEntityGrid from "./DungeonCraftEntityGrid.vue";
import PlacedInLine from "./PlacedInLine.vue";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";

const router = useRouter();
const { labelFor } = useSourceTitles();

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
