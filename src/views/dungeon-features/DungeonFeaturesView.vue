<template>
  <PageHeader title="Dungeon Craft" description="Secret doors, hidden passages & concealed treasures">
    <template #actions>
      <ListActionButton
        :icon="populateMutation.isPending.value ? IconLoading : IconPopulate"
        :label="populateStatusLabel"
        :disabled="populateMutation.isPending.value"
        @click="handlePopulate"
      />
      <ListActionButton
        variant="primary"
        :icon="IconAdd"
        label="New Feature"
        mobile-label="Feature"
        @click="router.push('/dungeon-features/new')"
      />
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <template v-else-if="features?.length">
      <!-- Filters -->
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <input
          v-model="search"
          type="search"
          placeholder="Search features…"
          class="flex-1 min-w-40 bg-card border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <select
          v-model="typeFilter"
          class="bg-card border border-border rounded-md px-3 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All Types</option>
          <option v-for="t in DUNGEON_FEATURE_TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
        <AppButton
          v-if="ui.dungeonFeaturesHasActiveFilters"
          variant="tinted"
          size="sm"
          label="Clear"
          class="border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/40"
          @click="ui.resetDungeonFeaturesFilters()"
        />
      </div>

      <p v-if="!filtered.length" class="text-center text-body text-muted-foreground italic py-8">
        No features match your filter.
      </p>

      <!-- Grid -->
      <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <RouterLink
          v-for="feature in filtered"
          :key="feature.id"
          :to="`/dungeon-features/${feature.id}`"
          class="flex flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors group"
        >
          <!-- Image / placeholder -->
          <div class="relative aspect-square bg-muted overflow-hidden shrink-0">
            <FocalImage
              :src="feature.image_url"
              :alt="feature.name"
              format="portrait"
              :focal-point="feature.image_focal_point"
              placeholder="/assets/placeholders/dungeonfeature.webp"
              class="group-hover:scale-105 transition-transform duration-300"
            />
            <!-- Type badge -->
            <span
              class="absolute top-2 left-2 text-label px-1.5 py-0.5 rounded text-white font-bold"
              :style="{ backgroundColor: DUNGEON_FEATURE_TYPE_COLORS[feature.feature_type] + 'DD' }"
            >{{ feature.feature_type }}</span>
          </div>

          <!-- Info -->
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
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { IconAdd, IconLoading, IconPopulate } from '@/lib/icons';
import { useDungeonFeatures, usePopulateDungeonFeatures } from "@/composables/useDungeonFeatures";
import { DUNGEON_FEATURE_TYPES, DUNGEON_FEATURE_TYPE_COLORS } from "@/types/dungeonFeature.types";
import PageHeader from "@/components/common/PageHeader.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import AppButton from "@/components/common/AppButton.vue";
import { useUiStore } from "@/stores/ui";

const router = useRouter();
const ui = useUiStore();
const { data: features, isLoading } = useDungeonFeatures();

const search = computed({
  get: () => ui.dungeonFeaturesSearch,
  set: (v) => { ui.dungeonFeaturesSearch = v; },
});
const typeFilter = computed({
  get: () => ui.dungeonFeaturesFilterType,
  set: (v) => { ui.dungeonFeaturesFilterType = v; },
});

const populateMutation = usePopulateDungeonFeatures();
const populateStatus   = ref<"idle" | "done" | "uptodate">("idle");
const populatedCount   = ref(0);
const populateError    = ref<string | null>(null);

const populateStatusLabel = computed(() => {
  if (populateMutation.isPending.value) return "Populating…";
  if (populateError.value) return `Error: ${populateError.value}`;
  if (populateStatus.value === "done") return `Added ${populatedCount.value} features`;
  if (populateStatus.value === "uptodate") return "Already up to date";
  return "Populate Dungeon Craft";
});

async function handlePopulate() {
  populateStatus.value = "idle";
  populateError.value  = null;
  try {
    const count = await populateMutation.mutateAsync();
    populatedCount.value = count;
    populateStatus.value = count === 0 ? "uptodate" : "done";
  } catch (e) {
    populateError.value = e instanceof Error ? e.message : String(e);
  }
  setTimeout(() => {
    populateStatus.value = "idle";
    populateError.value  = null;
  }, 8000);
}

const filtered = computed(() => {
  let list = features.value ?? [];
  if (typeFilter.value) list = list.filter((f) => f.feature_type === typeFilter.value);
  const q = search.value.toLowerCase().trim();
  if (q) list = list.filter((f) =>
    f.name.toLowerCase().includes(q) ||
    (f.trigger_type ?? "").toLowerCase().includes(q) ||
    f.tags.some((tag) => tag.toLowerCase().includes(q)),
  );
  return list;
});
</script>
