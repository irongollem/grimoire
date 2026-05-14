<template>
  <div>
    <h1 class="font-cinzel text-xl font-bold text-foreground mb-1">Atlas</h1>
    <p class="font-fell text-sm text-muted-foreground italic mb-4">Maps shared by your DM.</p>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!locations?.length"
      title="No maps shared yet"
      description="Your DM hasn't shared any locations with the party."
    />

    <div v-else class="flex flex-col gap-2">
      <PlayerLocationFiltersBar
        :search="search"
        :type-filter="typeFilter"
        :type-options="TYPE_OPTIONS"
        :has-active-filters="!!(search || typeFilter !== 'all')"
        @update:search="search = $event"
        @update:type-filter="typeFilter = $event"
        @clear="search = ''; typeFilter = 'all'"
      />

      <!-- Favourites pinned section -->
      <div v-if="!isFiltering && favouriteLocations.length" class="flex flex-col gap-1.5">
        <p class="font-cinzel text-2xs md:text-sm tracking-wider text-muted-foreground uppercase">Favourites</p>
        <PlayerLocationCard
          v-for="loc in favouriteLocations"
          :key="`fav-${loc.id}`"
          :data-location-id="loc.id"
          :loc="loc"
          :is-new="isNew(loc.id, loc.updated_at)"
          :is-favourite="true"
          :has-children="hasSharedChildren.has(loc.id)"
          :children-open="childrenOpen.has(loc.id)"
          :detail-open="detailOpen.has(loc.id)"
          @toggle-children="toggleChildren"
          @toggle-favourite="toggleFavourite"
          @toggle-detail="toggleDetail"
        >
          <template #detail>
            <PlayerLocationDetailPanel
              v-if="detailOpen.has(loc.id)"
              :loc="loc"
              :npcs="sharedNpcsByLocation[loc.id] ?? []"
              :shared-child-ids="sharedChildIds"
              :is-full-size="fullSizeMaps.has(loc.id)"
              @lightbox="lightboxSrc = $event"
              @toggle-map-size="toggleMapSize"
              @pin-click="onPinClick"
              @pin-go="onPinGo"
              @pin-watch="onPinWatch"
              @open-npc="openNpc"
            />
          </template>
        </PlayerLocationCard>
        <div class="border-t border-border mt-1 mb-1" />
      </div>

      <div class="flex justify-end">
        <button
          type="button"
          class="font-cinzel text-2xs md:text-sm tracking-wider transition-colors"
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

      <PlayerLocationCard
        v-for="entry in visibleTree"
        :key="entry.loc.id"
        :data-location-id="entry.loc.id"
        :loc="entry.loc"
        :is-new="isNew(entry.loc.id, entry.loc.updated_at)"
        :is-favourite="favouriteIds.has(entry.loc.id)"
        :has-children="hasSharedChildren.has(entry.loc.id)"
        :children-open="childrenOpen.has(entry.loc.id)"
        :detail-open="detailOpen.has(entry.loc.id)"
        :depth="entry.depth"
        @toggle-children="toggleChildren"
        @toggle-favourite="toggleFavourite"
        @toggle-detail="toggleDetail"
      >
        <template #detail>
          <PlayerLocationDetailPanel
            v-if="detailOpen.has(entry.loc.id)"
            :loc="entry.loc"
            :npcs="sharedNpcsByLocation[entry.loc.id] ?? []"
            :shared-child-ids="sharedChildIds"
            :is-full-size="fullSizeMaps.has(entry.loc.id)"
            @lightbox="lightboxSrc = $event"
            @toggle-map-size="toggleMapSize"
            @pin-click="onPinClick"
            @pin-go="onPinGo"
            @pin-watch="onPinWatch"
            @open-npc="openNpc"
          />
        </template>
      </PlayerLocationCard>
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

  <!-- NPC lightbox -->
  <Teleport to="body">
    <div
      v-if="selectedNpc"
      class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      @click.self="selectedNpc = null"
    >
      <div class="bg-card rounded-xl border border-border w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div class="relative shrink-0">
          <div v-if="selectedNpc.player_visible_fields?.includes('portrait') && getNpcDisplayPortrait(selectedNpc)" class="w-full h-72 overflow-hidden">
            <FocalImage
              :src="getNpcDisplayPortrait(selectedNpc)!"
              :alt="getNpcDisplayName(selectedNpc)"
              format="portrait"
              :focal-point="getNpcDisplayFocalPoint(selectedNpc)"
              :lightbox="true"
            />
          </div>
          <button
            class="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white hover:bg-black/70 transition-colors"
            @click="selectedNpc = null"
          >
            <IconClose class="h-4 w-4" />
          </button>
        </div>
        <div class="p-4 overflow-y-auto space-y-4">
          <div>
            <h2 class="font-cinzel text-lg font-bold text-foreground">
              {{ selectedNpc.player_visible_fields?.includes('name') ? getNpcDisplayName(selectedNpc) : '???' }}
            </h2>
            <p v-if="selectedNpc.player_visible_fields?.includes('race') && selectedNpc.race"
              class="mt-1 font-fell text-sm text-muted-foreground italic">{{ selectedNpc.race }}</p>
            <p v-if="selectedNpc.player_visible_fields?.includes('occupation') && selectedNpc.occupation"
              class="font-fell text-sm text-muted-foreground">{{ selectedNpc.occupation }}</p>
          </div>
          <PlayerNotesWidget entity-type="npc" :entity-id="selectedNpc.id" placeholder="Your observations about this character…" />
        </div>
      </div>
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
        <div class="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <span
            class="h-2 w-2 rounded-full shrink-0"
            :style="{ backgroundColor: LOCATION_TYPE_COLORS[watchingLocation.location_type] }"
          />
          <h2 class="font-cinzel text-sm font-semibold text-foreground flex-1 truncate">
            {{ watchingLocation.name }}
          </h2>
          <span class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider shrink-0">
            {{ LOCATION_TYPE_LABELS[watchingLocation.location_type] }}
          </span>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground transition-colors ml-1 shrink-0"
            @click="watchingLocation = null"
          >
            <IconClose class="h-4 w-4" />
          </button>
        </div>
        <div class="flex-1 overflow-y-auto">
          <div v-if="watchingLocation.image_url" class="w-full aspect-video">
            <FocalImage
              :src="watchingLocation.image_url"
              :alt="watchingLocation.name"
              format="landscape"
              class="w-full h-full"
            />
          </div>
          <div class="px-4 py-4 flex flex-col gap-4">
            <p v-if="watchingLocation.player_summary" class="font-fell text-sm text-foreground italic">
              {{ watchingLocation.player_summary }}
            </p>
            <p v-else class="font-fell text-xs text-muted-foreground italic">
              No description shared yet.
            </p>
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
import { ref, computed, nextTick, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconClose } from '@/lib/icons';
import { useReadItems, useMarkRead } from "@/composables/useReadItems";
import { useSharedLocations } from "@/composables/useLocations";
import { usePlayerFavourites } from "@/composables/usePlayerFavourites";
import { useUiStore } from "@/stores/ui";
import { useSharedNpcsByLocations } from "@/composables/useNpcs";
import { getNpcDisplayName, getNpcDisplayPortrait, getNpcDisplayFocalPoint } from "@/lib/npcDisplay";
import type { Npc } from "@/types/npc.types";
import { extractTiptapText } from "@/lib/utils";
import { LOCATION_TYPE_LABELS, LOCATION_TYPE_COLORS } from "@/types/location.types";
import type { Location, LocationType } from "@/types/location.types";

import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";
import PlayerLocationFiltersBar from "@/components/play/PlayerLocationFiltersBar.vue";
import PlayerLocationCard from "@/components/play/PlayerLocationCard.vue";
import PlayerLocationDetailPanel from "@/components/play/PlayerLocationDetailPanel.vue";

const TYPE_OPTIONS = Object.entries(LOCATION_TYPE_LABELS).map(([value, label]) => ({ value, label }));

interface WatchTarget {
  id: string;
  name: string;
  location_type: LocationType;
  image_url: string | null;
  player_summary: string | null;
}

const { data: locations, isLoading } = useSharedLocations();
const { favouriteIds, toggleFavourite } = usePlayerFavourites("location");
const { isNew } = useReadItems("location");
const { mutate: markRead } = useMarkRead();

const route = useRoute();
const router = useRouter();

const search = ref("");
const typeFilter = ref("all");
const lightboxSrc = ref<string | null>(null);

const selectedNpc = ref<Npc | null>(null);
function openNpc(npc: Npc) {
  selectedNpc.value = npc;
}

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

  walk(null, 0);
  for (const loc of all) {
    if (loc.parent_id !== null && !sharedIds.has(loc.parent_id)) {
      result.push({ loc, depth: 0 });
      walk(loc.id, 1);
    }
  }

  const seen = new Set<string>();
  return result.filter((e) => {
    if (seen.has(e.loc.id)) return false;
    seen.add(e.loc.id);
    return true;
  });
});

const favouriteLocations = computed(() =>
  (locations.value ?? []).filter((l) => favouriteIds.value.has(l.id)),
);

const ui = useUiStore();
const childrenOpen = computed({
  get: () => ui.atlasChildrenOpen,
  set: (v) => { ui.atlasChildrenOpen = v; },
});
const detailOpen = computed({
  get: () => ui.atlasDetailOpen,
  set: (v) => { ui.atlasDetailOpen = v; },
});
const fullSizeMaps = ref(new Set<string>());

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

const npcSharedLocationIds = computed(() =>
  (locations.value ?? []).filter((l) => l.is_npcs_shared).map((l) => l.id),
);
const { data: sharedNpcs } = useSharedNpcsByLocations(npcSharedLocationIds);

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
  if (s.has(id)) { s.delete(id); } else {
    s.add(id);
    markRead({ entityType: "location", entityId: id });
  }
  detailOpen.value = s;
}

function toggleChildren(id: string) {
  const s = new Set(childrenOpen.value);
  if (s.has(id)) { s.delete(id); } else { s.add(id); }
  childrenOpen.value = s;
}

const sharedChildIds = computed(() => new Set((locations.value ?? []).map((l) => l.id)));

const watchingLocation = ref<WatchTarget | null>(null);

const pendingOpenId = ref<string | null>((route.query.open as string) || null);
if (pendingOpenId.value) {
  void router.replace({ path: route.path });
}
watch(
  [locations, pendingOpenId] as const,
  async ([locs, openId]) => {
    if (locs?.length && openId) {
      pendingOpenId.value = null;
      await goToLocation(openId);
    }
  },
  { immediate: true },
);

async function goToLocation(locationId: string) {
  const allLocs = locations.value ?? [];
  const sharedIds = new Set(allLocs.map((l) => l.id));
  const newChildren = new Set(childrenOpen.value);
  const newDetail = new Set(detailOpen.value);

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
