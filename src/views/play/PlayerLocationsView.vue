<template>
  <div>
    <h1 class="font-cinzel text-xl font-bold text-foreground mb-1">Atlas</h1>
    <p class="font-fell text-sm text-muted-foreground italic mb-4">Maps shared by your DM.</p>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <p
      v-else-if="!locations?.length"
      class="text-center font-fell text-sm text-muted-foreground italic py-12"
    >
      No maps have been shared yet.
    </p>

    <div v-else class="flex flex-col gap-4">
      <div
        v-for="loc in locations"
        :key="loc.id"
        class="rounded-lg border border-border bg-card overflow-hidden"
      >
        <!-- Header row -->
        <button
          type="button"
          class="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
          @click="toggle(loc.id)"
        >
          <span
            class="h-2 w-2 rounded-full shrink-0"
            :style="{ backgroundColor: LOCATION_TYPE_COLORS[loc.location_type] }"
          />
          <span class="flex-1 font-cinzel text-sm font-semibold text-foreground">{{ loc.name }}</span>
          <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">
            {{ LOCATION_TYPE_LABELS[loc.location_type] }}
          </span>
          <ChevronDown
            class="h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 shrink-0"
            :class="expanded.has(loc.id) ? 'rotate-180' : ''"
          />
        </button>

        <!-- Expanded: map -->
        <div v-if="expanded.has(loc.id)" class="px-4 pb-4">
          <LocationMap
            :map-url="loc.map_url!"
            :pins="playerPins(loc)"
            :children="[]"
            mode="view"
            :show-hidden-pins="false"
            @pin-click="onPinClick"
          />
          <p
            v-if="!playerPins(loc).length"
            class="text-center font-fell text-xs text-muted-foreground italic mt-2"
          >
            No pins placed yet.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ChevronDown } from "lucide-vue-next";
import { useSharedLocations } from "@/composables/useLocations";
import { LOCATION_TYPE_LABELS, LOCATION_TYPE_COLORS } from "@/types/location.types";
import type { Location } from "@/types/location.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import LocationMap from "@/components/locations/LocationMap.vue";

const { data: locations, isLoading } = useSharedLocations();

const expanded = ref(new Set<string>());

function toggle(id: string) {
  if (expanded.value.has(id)) {
    expanded.value.delete(id);
  } else {
    expanded.value.add(id);
  }
  // trigger reactivity
  expanded.value = new Set(expanded.value);
}

function playerPins(loc: Location) {
  return (loc.map_pins ?? []).filter((p) => p.visible_to_players);
}

/** If the clicked child location also has a shared map, expand it. */
function onPinClick(childId: string) {
  const child = locations.value?.find((l) => l.id === childId);
  if (child) toggle(child.id);
}
</script>
