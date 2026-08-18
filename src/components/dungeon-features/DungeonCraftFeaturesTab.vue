<template>
  <DungeonCraftEntityGrid
    :items="features"
    :is-loading="featuresLoading"
    v-model:search="featuresSearch"
    :filtered-count="filteredFeatures.length"
    search-placeholder="Search features…"
    no-match-text="No features match your filter."
    empty-icon="DoorOpen"
    empty-title="No dungeon features yet"
    empty-description="Add secret doors, hidden passages, treasure chests and more."
    empty-action-label="New Feature"
    @empty-action="router.push('/dungeon-features/new')"
  >
    <template #filters>
      <select
        v-model="featuresTypeFilter"
        class="bg-card border border-border rounded-md px-3 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All Types</option>
        <option v-for="t in DUNGEON_FEATURE_TYPES" :key="t" :value="t">{{ t }}</option>
      </select>
    </template>
    <template #card>
      <RouterLink
        v-for="feature in filteredFeatures"
        :key="feature.id"
        :to="`/dungeon-features/${feature.id}`"
        class="flex flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors group"
      >
        <div class="relative aspect-square bg-muted overflow-hidden shrink-0">
          <FocalImage
            :src="feature.image_url"
            :alt="feature.name"
            format="portrait"
            :focal-point="feature.image_focal_point"
            placeholder="/assets/placeholders/dungeonfeature.webp"
            class="group-hover:scale-105 transition-transform duration-300"
          />
          <span
            class="absolute top-2 left-2 text-label px-1.5 py-0.5 rounded text-white font-bold"
            :class="DUNGEON_FEATURE_TYPE_BG[feature.feature_type]"
          >{{ feature.feature_type }}</span>
        </div>
        <div class="p-2.5 flex flex-col gap-0.5">
          <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight truncate">{{ feature.name }}</h3>
          <div class="flex items-center gap-2">
            <span v-if="feature.trigger_type" class="text-caption-sm text-muted-foreground italic truncate">
              {{ feature.trigger_type }}
            </span>
            <span v-if="feature.perception_dc" class="text-label text-muted-foreground">
              Perc {{ feature.perception_dc }}
            </span>
          </div>
        </div>
      </RouterLink>
    </template>
  </DungeonCraftEntityGrid>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { useDungeonFeatures } from "@/composables/useDungeonFeatures";
import { DUNGEON_FEATURE_TYPES, DUNGEON_FEATURE_TYPE_BG } from "@/types/dungeonFeature.types";
import FocalImage from "@/components/common/FocalImage.vue";
import DungeonCraftEntityGrid from "./DungeonCraftEntityGrid.vue";

const router = useRouter();
const { data: features, isLoading: featuresLoading } = useDungeonFeatures();
const featuresSearch     = ref("");
const featuresTypeFilter = ref("");

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
