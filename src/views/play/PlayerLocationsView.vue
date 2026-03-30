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

    <div v-else class="flex flex-col gap-2">
      <div
        v-for="entry in flatTree"
        :key="entry.loc.id"
        class="rounded-lg border border-border bg-card overflow-hidden"
        :style="{ marginLeft: `${entry.depth * 16}px` }"
      >
        <!-- Header row -->
        <button
          type="button"
          class="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
          @click="toggle(entry.loc.id)"
        >
          <span
            class="h-2 w-2 rounded-full shrink-0"
            :style="{ backgroundColor: locColor(entry.loc.location_type) }"
          />
          <span class="flex-1 font-cinzel text-sm font-semibold text-foreground">{{ entry.loc.name }}</span>
          <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">
            {{ locLabel(entry.loc.location_type) }}
          </span>
          <ChevronDown
            class="h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 shrink-0"
            :class="expanded.has(entry.loc.id) ? 'rotate-180' : ''"
          />
        </button>

        <!-- Expanded: map + player notes -->
        <div v-if="expanded.has(entry.loc.id)" class="px-4 pb-4 flex flex-col gap-4">
          <div v-if="entry.loc.map_url">
            <LocationMap
              :map-url="entry.loc.map_url"
              :pins="playerPins(entry.loc)"
              :children="[]"
              mode="view"
              :show-hidden-pins="false"
              :compact="!fullSizeMaps.has(entry.loc.id)"
              @pin-click="onPinClick"
            />
            <div class="flex items-center justify-between mt-1">
              <p
                v-if="!playerPins(entry.loc).length"
                class="font-fell text-xs text-muted-foreground italic"
              >
                No pins placed yet.
              </p>
              <span v-else />
              <button
                type="button"
                class="font-cinzel text-[10px] text-muted-foreground hover:text-foreground transition-colors tracking-wider"
                @click="toggleMapSize(entry.loc.id)"
              >
                {{ fullSizeMaps.has(entry.loc.id) ? 'Compact' : 'Full size' }}
              </button>
            </div>
          </div>
          <PlayerNotesWidget
            entity-type="location"
            :entity-id="entry.loc.id"
            placeholder="Notes about this place…"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ChevronDown } from "lucide-vue-next";
import { useSharedLocations } from "@/composables/useLocations";
import { LOCATION_TYPE_LABELS, LOCATION_TYPE_COLORS } from "@/types/location.types";
import type { Location } from "@/types/location.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import LocationMap from "@/components/locations/LocationMap.vue";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";

const { data: locations, isLoading } = useSharedLocations();

// Build a depth-annotated flat list preserving parent → children order.
// A location whose parent is not in the shared set is treated as a root (depth 0)
// so that sharing a child without its parent still makes it visible.
const flatTree = computed(() => {
  const all = locations.value ?? [];
  const sharedIds = new Set(all.map((l) => l.id));
  const result: { loc: Location; depth: number }[] = [];

  function walk(parentId: string | null, depth: number) {
    for (const loc of all) {
      if (loc.parent_id === parentId) {
        result.push({ loc, depth });
        walk(loc.id, depth + 1);
      }
    }
  }

  // Start from true roots AND from locations whose parent wasn't shared
  walk(null, 0);
  for (const loc of all) {
    if (loc.parent_id !== null && !sharedIds.has(loc.parent_id)) {
      result.push({ loc, depth: 0 });
      walk(loc.id, 1);
    }
  }

  // Deduplicate (a location can't be both a true root and an orphaned child)
  const seen = new Set<string>();
  return result.filter((e) => {
    if (seen.has(e.loc.id)) return false;
    seen.add(e.loc.id);
    return true;
  });
});

const expanded = ref(new Set<string>());
const fullSizeMaps = ref(new Set<string>());

function toggleMapSize(id: string) {
  if (fullSizeMaps.value.has(id)) {
    fullSizeMaps.value.delete(id);
  } else {
    fullSizeMaps.value.add(id);
  }
  fullSizeMaps.value = new Set(fullSizeMaps.value);
}

function toggle(id: string) {
  if (expanded.value.has(id)) {
    expanded.value.delete(id);
  } else {
    expanded.value.add(id);
  }
  // trigger reactivity
  expanded.value = new Set(expanded.value);
}

function locColor(type: Location["location_type"]): string {
  return LOCATION_TYPE_COLORS[type];
}

function locLabel(type: Location["location_type"]): string {
  return LOCATION_TYPE_LABELS[type];
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
