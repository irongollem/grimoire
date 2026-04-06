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

        <!-- Expanded: summary, map, description, NPCs, player notes -->
        <div v-if="expanded.has(entry.loc.id)" class="px-4 pb-4 flex flex-col gap-4">
          <!-- Player summary (always shown when present) -->
          <p
            v-if="entry.loc.player_summary"
            class="font-fell text-sm text-foreground italic"
          >
            {{ entry.loc.player_summary }}
          </p>

          <!-- Map -->
          <div v-if="entry.loc.map_url">
            <LocationMap
              :map-url="entry.loc.map_url"
              :pins="playerPins(entry.loc)"
              :children="[]"
              mode="view"
              :show-hidden-pins="false"
              :compact="!fullSizeMaps.has(entry.loc.id)"
              :shared-child-ids="sharedChildIds"
              @pin-click="onPinClick"
              @pin-go="onPinGo"
              @pin-watch="onPinWatch"
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

          <!-- Full description (when shared) -->
          <div v-if="entry.loc.is_description_shared && entry.loc.description" class="border-t border-border pt-3">
            <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider mb-1">Description</p>
            <RichTextViewer :content="entry.loc.description" />
          </div>

          <!-- Wares (store / tavern / inn when inventory shared) -->
          <div v-if="STORE_LOCATION_TYPES.has(entry.loc.location_type) && entry.loc.is_inventory_shared" class="border-t border-border pt-3">
            <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider mb-2">Wares</p>
            <PlayerStoreWares :location-id="entry.loc.id" />
          </div>

          <!-- Linked NPCs (when shared) -->
          <div v-if="entry.loc.is_npcs_shared" class="border-t border-border pt-3">
            <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider mb-2">People in the Area</p>
            <div v-if="sharedNpcsByLocation[entry.loc.id]?.length" class="flex flex-col gap-1.5">
              <div
                v-for="npc in sharedNpcsByLocation[entry.loc.id]"
                :key="npc.id"
                class="flex items-center gap-2 rounded border border-border bg-muted/30 px-3 py-2"
              >
                <div class="flex-1 min-w-0">
                  <p class="font-cinzel text-xs font-semibold text-foreground truncate">{{ npc.name }}</p>
                  <p v-if="npc.occupation || npc.race" class="font-fell text-xs text-muted-foreground italic truncate">
                    {{ [npc.race, npc.occupation].filter(Boolean).join(" · ") }}
                  </p>
                </div>
              </div>
            </div>
            <p v-else class="font-fell text-xs text-muted-foreground italic">No one here yet.</p>
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

  <!-- Watch panel — art + player summary + notes for a pinned sub-location -->
  <Teleport to="body">
    <div
      v-if="watchingLocation"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      @click.self="watchingLocation = null"
      @keydown.escape="watchingLocation = null"
    >
      <div class="w-full sm:max-w-md bg-card border border-border rounded-t-2xl sm:rounded-xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden">
        <!-- Header -->
        <div class="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <span
            class="h-2 w-2 rounded-full shrink-0"
            :style="{ backgroundColor: locColor(watchingLocation.location_type) }"
          />
          <h2 class="font-cinzel text-sm font-semibold text-foreground flex-1 truncate">
            {{ watchingLocation.name }}
          </h2>
          <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider shrink-0">
            {{ locLabel(watchingLocation.location_type) }}
          </span>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground transition-colors ml-1 shrink-0"
            @click="watchingLocation = null"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <!-- Scrollable body -->
        <div class="flex-1 overflow-y-auto">
          <!-- Art -->
          <div v-if="watchingLocation.image_url" class="w-full aspect-video">
            <FocalImage
              :src="watchingLocation.image_url"
              :alt="watchingLocation.name"
              format="landscape"
              class="w-full h-full"
            />
          </div>

          <div class="px-4 py-4 flex flex-col gap-4">
            <!-- Player summary -->
            <p
              v-if="watchingLocation.player_summary"
              class="font-fell text-sm text-foreground italic"
            >
              {{ watchingLocation.player_summary }}
            </p>
            <p
              v-else
              class="font-fell text-xs text-muted-foreground italic"
            >
              No description shared yet.
            </p>

            <!-- Player notes -->
            <PlayerNotesWidget
              entity-type="location"
              :entity-id="watchingLocation.id"
              placeholder="Notes about this place…"
            />
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ChevronDown, X } from "lucide-vue-next";
import { useSharedLocations } from "@/composables/useLocations";
import { useSharedNpcsByLocations } from "@/composables/useNpcs";
import { LOCATION_TYPE_LABELS, LOCATION_TYPE_COLORS, STORE_LOCATION_TYPES } from "@/types/location.types";
import type { Location, LocationType } from "@/types/location.types";

interface WatchTarget {
  id: string;
  name: string;
  location_type: LocationType;
  image_url: string | null;
  player_summary: string | null;
}
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import PlayerStoreWares from "@/components/locations/PlayerStoreWares.vue";
import LocationMap from "@/components/locations/LocationMap.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";
import FocalImage from "@/components/common/FocalImage.vue";

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

// Fetch shared NPCs for all locations with is_npcs_shared = true
const npcSharedLocationIds = computed(() =>
  (locations.value ?? []).filter((l) => l.is_npcs_shared).map((l) => l.id),
);
const { data: sharedNpcs } = useSharedNpcsByLocations(npcSharedLocationIds);

// Index by location_id for O(1) lookup in the template
const sharedNpcsByLocation = computed(() => {
  const map: Record<string, typeof sharedNpcs.value> = {};
  for (const npc of sharedNpcs.value ?? []) {
    if (!npc.location_id) continue;
    if (!map[npc.location_id]) map[npc.location_id] = [];
    map[npc.location_id]!.push(npc);
  }
  return map;
});

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

// IDs of all shared locations — gates Go-there + Watch buttons on map pins.
const sharedChildIds = computed(() => new Set((locations.value ?? []).map((l) => l.id)));

// Watch panel — shows art, player summary, and notes for a pinned sub-location.
const watchingLocation = ref<WatchTarget | null>(null);

/** If the clicked child location also has a shared map, expand it. */
function onPinClick(childId: string) {
  const child = locations.value?.find((l) => l.id === childId);
  if (child) toggle(child.id);
}

function onPinGo(childId: string) {
  const child = locations.value?.find((l) => l.id === childId);
  if (child) toggle(child.id);
}

function onPinWatch(childId: string) {
  const fullLoc = locations.value?.find((l) => l.id === childId);
  if (fullLoc) {
    watchingLocation.value = {
      id: fullLoc.id,
      name: fullLoc.name,
      location_type: fullLoc.location_type,
      image_url: fullLoc.image_url,
      player_summary: fullLoc.player_summary,
    };
    return;
  }
  // Not a shared location — use denormalised pin data (image + name from pin).
  for (const loc of (locations.value ?? [])) {
    const pin = (loc.map_pins ?? []).find((p) => p.child_location_id === childId);
    if (pin) {
      watchingLocation.value = {
        id: childId,
        name: pin.child_name,
        location_type: pin.child_type,
        image_url: pin.child_image_url,
        player_summary: null,
      };
      return;
    }
  }
}
</script>
