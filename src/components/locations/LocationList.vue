<template>
  <div>
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!filtered.length && !props.search && props.typeFilter === 'all'"
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
      <LocationCard
        v-for="loc in filtered"
        :key="loc.id"
        :loc="loc"
        :parent-name="parentName(loc)"
        :description="descriptionPreview(loc)"
      />
    </div>

    <p v-if="filtered.length" class="mt-4 font-fell text-xs text-muted-foreground italic text-right">
      {{ filtered.length }} of {{ locations?.length ?? 0 }} locations
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useAllLocations } from "@/composables/useLocations";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import { extractTiptapText } from "@/lib/utils";
import LocationCard from "@/components/locations/LocationCard.vue";
import type { Location } from "@/types/location.types";

const props = defineProps<{
  search: string;
  typeFilter: string;
}>();

const { data: locations, isLoading } = useAllLocations();

const filtered = computed(() => {
  let list = [...(locations.value ?? [])];
  if (props.typeFilter !== "all") list = list.filter((l) => l.location_type === props.typeFilter);
  if (props.search.trim()) {
    const q = props.search.toLowerCase();
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
