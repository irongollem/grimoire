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
      <!-- Search + filter bar -->
      <div class="flex items-center gap-2">
        <div class="relative flex-1">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            v-model="search"
            type="text"
            placeholder="Search locations…"
            class="w-full rounded-md border border-border bg-muted/40 pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <select
          v-model="typeFilter"
          aria-label="Location type filter"
          class="rounded-md border border-border bg-muted/40 px-2 py-1.5 font-cinzel text-[10px] tracking-wider text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">All types</option>
          <option v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <button
          v-if="search || typeFilter !== 'all'"
          type="button"
          class="font-cinzel text-[10px] tracking-wider text-muted-foreground hover:text-foreground transition-colors shrink-0"
          @click="search = ''; typeFilter = 'all'"
        >Clear</button>
      </div>

      <div class="flex justify-end">
        <button
          type="button"
          class="font-cinzel text-[10px] tracking-wider transition-colors"
          :class="detailOpen.size > 0 || childrenOpen.size > 0
            ? 'text-muted-foreground hover:text-foreground'
            : 'invisible pointer-events-none'"
          @click="detailOpen = new Set(); childrenOpen = new Set()"
        >
          Close all
        </button>
      </div>
      <p v-if="isFiltering && !visibleTree.length" class="text-center font-fell text-sm text-muted-foreground italic py-8">
        No locations match your search.
      </p>
      <div
        v-for="entry in visibleTree"
        :key="entry.loc.id"
        :data-location-id="entry.loc.id"
        class="rounded-lg border border-border bg-card overflow-hidden"
        :style="{ marginLeft: `${entry.depth * 16}px` }"
      >
        <!-- Header row -->
        <div class="w-full flex items-stretch">
          <!-- Main bar: toggles children visibility -->
          <button
            type="button"
            class="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left min-w-0"
            @click="toggleChildren(entry.loc.id)"
          >
            <span
              class="h-2 w-2 rounded-full shrink-0"
              :style="{ backgroundColor: locColor(entry.loc.location_type) }"
            />
            <span class="flex-1 font-cinzel text-sm font-semibold text-foreground truncate">{{ entry.loc.name }}</span>
            <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider shrink-0">
              {{ locLabel(entry.loc.location_type) }}
            </span>
            <ChevronDown
              v-if="hasSharedChildren.has(entry.loc.id)"
              class="h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 shrink-0"
              :class="childrenOpen.has(entry.loc.id) ? 'rotate-180' : ''"
            />
          </button>
          <!-- Details button: toggles detail panel -->
          <button
            type="button"
            class="shrink-0 flex items-center gap-1.5 px-3 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors border-l border-border"
            :class="detailOpen.has(entry.loc.id) ? 'text-foreground' : ''"
            :title="detailOpen.has(entry.loc.id) ? 'Hide details' : 'Show details'"
            @click="toggleDetail(entry.loc.id)"
          >
            <Eye class="h-3.5 w-3.5 shrink-0" />
            <span class="hidden sm:inline font-cinzel text-[10px] tracking-wider">Details</span>
          </button>
        </div>

        <!-- Detail panel: art, summary, map, description, NPCs, player notes -->
        <div v-if="detailOpen.has(entry.loc.id)" class="px-4 pb-4 flex flex-col gap-4">
          <!-- Sigil + player summary -->
          <div class="flex items-start gap-3 pt-1">
            <button
              v-if="entry.loc.image_url"
              type="button"
              class="w-14 shrink-0 rounded-md overflow-hidden aspect-3/4 cursor-zoom-in"
              @click="lightboxSrc = entry.loc.image_url"
            >
              <FocalImage
                :src="entry.loc.image_url"
                :alt="entry.loc.name"
                format="portrait"
                :focal-point="null"
              />
            </button>
            <p
              v-if="entry.loc.player_summary"
              class="font-fell text-sm text-foreground italic flex-1"
            >
              {{ entry.loc.player_summary }}
            </p>
          </div>

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
                  <p class="font-cinzel text-xs font-semibold text-foreground truncate">{{ getNpcDisplayName(npc) }}</p>
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

  <!-- Image lightbox -->
  <Teleport to="body">
    <div
      v-if="lightboxSrc"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-zoom-out"
      @click="lightboxSrc = null"
      @keydown.escape="lightboxSrc = null"
    >
      <img :src="lightboxSrc" class="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl" />
    </div>
  </Teleport>

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
import { ref, computed, nextTick } from "vue";
import { ChevronDown, X, Eye, Search } from "lucide-vue-next";
import { useSharedLocations } from "@/composables/useLocations";
import { useSharedNpcsByLocations } from "@/composables/useNpcs";
import { getNpcDisplayName } from "@/lib/npcDisplay";
import { extractTiptapText } from "@/lib/utils";
import { LOCATION_TYPE_LABELS, LOCATION_TYPE_COLORS, STORE_LOCATION_TYPES } from "@/types/location.types";
import type { Location, LocationType } from "@/types/location.types";

const TYPE_OPTIONS = Object.entries(LOCATION_TYPE_LABELS).map(([value, label]) => ({ value, label }));

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

const search = ref("");
const typeFilter = ref("all");
const lightboxSrc = ref<string | null>(null);

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

// childrenOpen — which locations have their child cards visible in the list.
// detailOpen   — which locations have their detail panel (map/description/NPCs) open.
const childrenOpen = ref(new Set<string>());
const detailOpen = ref(new Set<string>());
const fullSizeMaps = ref(new Set<string>());

// Locations that have at least one shared child.
const hasSharedChildren = computed(() => {
  const sharedIds = new Set((locations.value ?? []).map((l) => l.id));
  const result = new Set<string>();
  for (const entry of flatTree.value) {
    if (entry.loc.parent_id && sharedIds.has(entry.loc.parent_id)) {
      result.add(entry.loc.parent_id);
    }
  }
  return result;
});

// When searching or filtering, show a flat list of matches.
// Otherwise use the normal collapsible tree.
const isFiltering = computed(() => search.value.trim() || typeFilter.value !== "all");

const filteredFlat = computed(() => {
  const all = locations.value ?? [];
  let list = all;
  if (typeFilter.value !== "all") {
    list = list.filter((l) => l.location_type === typeFilter.value);
  }
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase();
    list = list.filter((l) =>
      l.name.toLowerCase().includes(q) ||
      (l.player_summary ?? "").toLowerCase().includes(q) ||
      (l.is_description_shared ? extractTiptapText(l.description, 500).toLowerCase().includes(q) : false),
    );
  }
  return list.map((loc) => ({ loc, depth: 0 }));
});

// visibleTree hides children whose parent is not in childrenOpen.
// Because flatTree is parent-before-child, a single pass propagates transitively.
const visibleTree = computed(() => {
  if (isFiltering.value) return filteredFlat.value;

  const all = flatTree.value;
  const sharedIds = new Set((locations.value ?? []).map((l) => l.id));
  const hiddenIds = new Set<string>();

  for (const entry of all) {
    const parentId = entry.loc.parent_id;
    const parentIsShared = parentId !== null && sharedIds.has(parentId);
    const parentIsCollapsed = parentIsShared && !childrenOpen.value.has(parentId);
    const parentIsHidden = parentId !== null && hiddenIds.has(parentId);
    if (parentIsCollapsed || parentIsHidden) {
      hiddenIds.add(entry.loc.id);
    }
  }

  return all.filter((e) => !hiddenIds.has(e.loc.id));
});

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

function toggleDetail(id: string) {
  const s = new Set(detailOpen.value);
  if (s.has(id)) { s.delete(id); } else { s.add(id); }
  detailOpen.value = s;
}

function toggleChildren(id: string) {
  const s = new Set(childrenOpen.value);
  if (s.has(id)) { s.delete(id); } else { s.add(id); }
  childrenOpen.value = s;
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

/**
 * Expand the target location (and all its shared ancestors so it becomes visible),
 * then scroll it into view. Used by both pin-click and pin-go.
 */
async function goToLocation(locationId: string) {
  const allLocs = locations.value ?? [];
  const sharedIds = new Set(allLocs.map((l) => l.id));
  const newChildren = new Set(childrenOpen.value);
  const newDetail = new Set(detailOpen.value);

  // Walk up the ancestor chain, opening children at each level so the target is visible.
  let current: typeof allLocs[number] | undefined = allLocs.find((l) => l.id === locationId);
  while (current) {
    newDetail.add(current.id);
    if (!current.parent_id || !sharedIds.has(current.parent_id)) break;
    newChildren.add(current.parent_id);
    current = allLocs.find((l) => l.id === current!.parent_id);
  }
  childrenOpen.value = newChildren;
  detailOpen.value = newDetail;

  await nextTick();
  document
    .querySelector(`[data-location-id="${locationId}"]`)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function onPinClick(childId: string) {
  if (locations.value?.some((l) => l.id === childId)) {
    goToLocation(childId);
  }
}

function onPinGo(childId: string) {
  goToLocation(childId);
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
