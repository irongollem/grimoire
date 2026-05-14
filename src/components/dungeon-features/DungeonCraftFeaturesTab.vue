<template>
  <div v-if="featuresLoading" class="flex justify-center py-16">
    <LoadingSpinner />
  </div>
  <template v-else-if="features?.length">
    <div class="flex flex-wrap items-center gap-2 mb-4">
      <input
        v-model="featuresSearch"
        type="search"
        placeholder="Search features…"
        class="flex-1 min-w-40 bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <select
        v-model="featuresTypeFilter"
        class="bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All Types</option>
        <option v-for="t in DUNGEON_FEATURE_TYPES" :key="t" :value="t">{{ t }}</option>
      </select>
    </div>
    <p v-if="!filteredFeatures.length" class="text-center font-fell text-sm text-muted-foreground italic py-8">
      No features match your filter.
    </p>
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
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
            class="absolute top-2 left-2 font-cinzel text-[9px] px-1.5 py-0.5 rounded tracking-wider text-white font-bold"
            :style="{ backgroundColor: DUNGEON_FEATURE_TYPE_COLORS[feature.feature_type] + 'DD' }"
          >{{ feature.feature_type }}</span>
        </div>
        <div class="p-2.5 flex flex-col gap-0.5">
          <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight truncate">{{ feature.name }}</h3>
          <div class="flex items-center gap-2">
            <span v-if="feature.trigger_type" class="font-fell text-[10px] text-muted-foreground italic truncate">
              {{ feature.trigger_type }}
            </span>
            <span v-if="feature.perception_dc" class="font-cinzel text-[10px] text-muted-foreground tracking-wider">
              Perc {{ feature.perception_dc }}
            </span>
          </div>
        </div>
      </RouterLink>
    </div>
  </template>
  <EmptyState
    v-else
    icon="DoorOpen"
    title="No dungeon features yet"
    description="Add secret doors, hidden passages, treasure chests and more."
    action-label="New Feature"
    @action="router.push('/dungeon-features/new')"
  />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { useDungeonFeatures } from "@/composables/useDungeonFeatures";
import { DUNGEON_FEATURE_TYPES, DUNGEON_FEATURE_TYPE_COLORS } from "@/types/dungeonFeature.types";
import FocalImage from "@/components/common/FocalImage.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";

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
