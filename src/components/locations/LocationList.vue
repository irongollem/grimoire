<template>
  <div>
    <!-- Filters -->
    <div class="flex flex-col gap-2 mb-5">
      <div class="relative">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          v-model="search"
          type="text"
          placeholder="Search locations…"
          class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="opt in TYPE_OPTIONS"
          :key="opt.value"
          class="px-2.5 py-1 rounded-md border text-xs font-cinzel font-semibold tracking-wider transition-colors"
          :class="typeFilter === opt.value
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-card text-muted-foreground border-border hover:text-foreground'"
          @click="typeFilter = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!filtered.length && !search && typeFilter === 'all'"
      title="No locations yet"
      description="Chart the lands, cities, and dungeons of your realm."
    >
      <template #action>
        <RouterLink
          to="/locations/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          Add your first location
        </RouterLink>
      </template>
    </EmptyState>

    <p v-else-if="!filtered.length" class="text-center font-fell text-sm text-muted-foreground italic py-12">
      No locations match your filters.
    </p>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      <RouterLink
        v-for="loc in filtered"
        :key="loc.id"
        :to="`/locations/${loc.id}`"
        class="group flex flex-col rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
      >
        <!-- Type colour bar -->
        <div class="h-1.5 w-full shrink-0" :style="{ backgroundColor: LOCATION_TYPE_COLORS[loc.location_type] }" />

        <div class="p-3 flex flex-col gap-2 flex-1">
          <!-- Title row -->
          <div class="flex items-start gap-2">
            <div
              class="h-7 w-7 shrink-0 rounded overflow-hidden mt-0.5"
              :style="loc.image_url ? {} : { backgroundColor: LOCATION_TYPE_COLORS[loc.location_type] }"
            >
              <FocalImage
                v-if="loc.image_url"
                :src="loc.image_url"
                :alt="loc.name"
                format="portrait"
                :focal-point="null"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-white text-[10px] font-cinzel font-bold">
                {{ loc.location_type.slice(0, 2).toUpperCase() }}
              </div>
            </div>
            <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight line-clamp-2 flex-1">
              {{ loc.name || "Unnamed Location" }}
            </h3>
          </div>

          <!-- Type badge + parent -->
          <div class="flex items-center gap-1.5 flex-wrap">
            <span
              class="px-1.5 py-0.5 rounded font-cinzel text-[10px] font-bold tracking-wider capitalize"
              :style="{
                backgroundColor: LOCATION_TYPE_COLORS[loc.location_type] + '22',
                color: LOCATION_TYPE_COLORS[loc.location_type],
              }"
            >
              {{ LOCATION_TYPE_LABELS[loc.location_type] }}
            </span>
            <span v-if="parentName(loc)" class="font-fell text-[10px] text-muted-foreground italic truncate">
              in {{ parentName(loc) }}
            </span>
          </div>

          <!-- Description preview -->
          <p v-if="descriptionPreview(loc)" class="font-fell text-xs text-muted-foreground italic line-clamp-3 flex-1">
            {{ descriptionPreview(loc) }}
          </p>
          <div v-else class="flex-1" />

          <!-- Tags + date -->
          <div class="flex items-end justify-between gap-2 mt-auto">
            <div v-if="loc.tags.length" class="flex flex-wrap gap-1">
              <span
                v-for="tag in loc.tags.slice(0, 2)"
                :key="tag"
                class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground tracking-wider"
              >
                {{ tag }}
              </span>
            </div>
            <span class="font-fell text-[10px] text-muted-foreground italic shrink-0 ml-auto">
              {{ timeAgo(loc.updated_at) }}
            </span>
          </div>
        </div>
      </RouterLink>
    </div>

    <p v-if="filtered.length" class="mt-4 font-fell text-xs text-muted-foreground italic text-right">
      {{ filtered.length }} of {{ locations?.length ?? 0 }} locations
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Search } from "lucide-vue-next";
import FocalImage from "@/components/common/FocalImage.vue";
import { useAllLocations } from "@/composables/useLocations";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import { timeAgo, extractTiptapText } from "@/lib/utils";
import { LOCATION_TYPE_LABELS, LOCATION_TYPE_COLORS } from "@/types/location.types";
import type { Location } from "@/types/location.types";

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  ...Object.entries(LOCATION_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

const search = ref("");
const typeFilter = ref("all");

const { data: locations, isLoading } = useAllLocations();

const filtered = computed(() => {
  let list = [...(locations.value ?? [])];
  if (typeFilter.value !== "all") list = list.filter((l) => l.location_type === typeFilter.value);
  if (search.value.trim()) {
    const q = search.value.toLowerCase();
    list = list.filter((l) =>
      l.name.toLowerCase().includes(q) ||
      l.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  return list;
});

function parentName(loc: Location): string {
  if (!loc.parent_id) return "";
  return locations.value?.find((l) => l.id === loc.parent_id)?.name ?? "";
}

function descriptionPreview(loc: Location): string {
  return extractTiptapText(loc.description);
}
</script>
