<template>
  <div class="flex flex-col gap-3">
    <!-- No internal heading: `LocationDetailSections` already titles this
         section — "Rooms" for most sites, "Grounds" for a `wilds` site
         (#886) — and repeating the word a line apart is noise.
         `StoreInventory` avoids the same collision by calling its own list
         "Inventory" under a "Store" heading; here there is no second word
         worth inventing, so the row simply goes. -->

    <!-- Site-default ambience (#868) — the floor every themeless space here
         falls back to. Always editable (#1125: Build is retired, the page reads
         the same at the table and at the desk). -->
    <div
      v-if="site"
      class="flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2"
    >
      <span class="min-w-0 shrink-0 truncate text-caption font-semibold text-foreground">{{ site.name }}</span>
      <RoomAmbienceCell
        :location-id="site.id"
        :own-theme="site.audio_theme"
        :resolved="siteAmbience"
        :theme-options="themeOptions"
        @save="saveAmbience"
        @edit-start="themesWanted = true"
      />
    </div>

    <!-- Space list, always draggable (#1125). -->
    <VueDraggable
      v-if="dragList.length"
      v-model="dragList"
      handle=".space-drag-handle"
      :animation="150"
      ghost-class="opacity-40"
      class="flex flex-col gap-1.5"
      @end="persistOrder"
    >
      <div
        v-for="(space, idx) in dragList"
        :key="space.id"
        class="flex flex-col gap-1 rounded-md border border-border bg-card px-3 py-2"
      >
        <div class="flex items-center gap-2">
          <div
            class="space-drag-handle shrink-0 cursor-grab text-muted-foreground/40 transition-colors hover:text-muted-foreground/80 active:cursor-grabbing"
            title="Drag to reorder"
          >
            <IconDrag class="h-3.5 w-3.5" />
          </div>

          <span class="w-5 shrink-0 text-caption-sm tabular-nums text-muted-foreground">{{ idx + 1 }}.</span>

          <!-- Renaming and deleting a room live on its own Details; the name
               opens it. -->
          <RouterLink
            :to="placeRoute(space.id)"
            class="min-w-0 flex-1 truncate text-caption font-semibold text-foreground hover:underline"
          >{{ space.name }}</RouterLink>

          <!-- Read-only cleared/looted markers (#787, epic #780) — a play
               fact, so it stays visible in Browse. The toggles themselves
               live on the space's own detail page (LocationStateControls);
               this is a glance-only indicator, so it shows only a positive
               assertion — an "unknown" or explicit-false space renders no
               marker at all, keeping the row exactly as dense as before this
               feature. -->
          <IconShieldCheck
            v-if="siteStateOf(space.id, 'cleared')?.value"
            class="h-3.5 w-3.5 shrink-0 text-tone-success"
            aria-label="Cleared"
            title="Cleared"
          />
          <IconLoot
            v-if="siteStateOf(space.id, 'looted')?.value"
            class="h-3.5 w-3.5 shrink-0 text-tone-caution"
            aria-label="Looted"
            title="Looted"
          />

        </div>

        <!-- Ambience (#868), indented under the drag handle + index so it
             reads as this space's own second line, not a sibling row. -->
        <div class="pl-7">
          <RoomAmbienceCell
            :location-id="space.id"
            :own-theme="space.audio_theme"
            :resolved="spaceAmbience(space.id)"
            :theme-options="themeOptions"
            @save="saveAmbience"
            @edit-start="themesWanted = true"
          />
        </div>
      </div>
    </VueDraggable>

    <p v-else class="text-caption text-muted-foreground italic">
      No {{ childTypePlural }} yet. Add the first one below.
    </p>

    <!-- The add row is always there (frame 02). -->
    <div
      class="flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2"
    >
      <IconAdd class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <AppInput
        v-model="newSpaceName"
        type="text"
        tone="bare"
        size="xs"
        :block="false"
        :placeholder="`Add ${childTypeArticled}…`"
        class="flex-1 px-0 text-caption"
        @keydown.enter="addSpace"
      />
      <AppButton
        variant="ghost"
        size="inline-xs"
        label="Add"
        :disabled="!newSpaceName.trim() || isCreating"
        @click="addSpace"
      />
    </div>

    <PaywallModal v-model="showPaywall" resource="locations" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import { IconAdd, IconDrag, IconLoot, IconShieldCheck } from "@/lib/icons";
import { useToast } from "@/composables/useToast";
import { isQuotaExceeded } from "@/lib/quotaError";
import {
  useLocations,
  useAllLocations,
  useCreateLocation,
  useUpdateLocation,
  useReorderLocations,
} from "@/composables/locations/useLocations";
import { useLocationStateForRooms } from "@/composables/locations/useLocationState";
import { stateReadScope } from "@/lib/locations/stateReadScope";
import { buildAtlasIndex } from "@/lib/locations/tree";
import { childSpaceType, isInteriorType, spaceNoun } from "@/lib/locations/tiers";
import { placeRoute } from "@/lib/locations/placeRoute";
import { resolveInheritedTheme } from "@/lib/locations/ambience";
import { collectThemes } from "@/lib/audio/audioThemes";
import { usePlaylists } from "@/composables/soundboard/useSoundboardPlaylists";
import { useSounds } from "@/composables/soundboard/useSounds";
import RoomAmbienceCell from "@/components/locations/site/RoomAmbienceCell.vue";
import type { Location, LocationInsert, LocationType } from "@/types/location.types";

/**
 * A site's numbered interior spaces — the panel #783 gives a dungeon (or any
 * site-tier place). A space is an ordinary interior-typed (`room`, or #886's
 * `grounds`) direct child; there is no membership table, because `parent_id`
 * already owns that fact. What this panel adds is the missing *order*
 * (`sort_order`, reordered via drag) and a dedicated surface to add/rename/
 * remove them without opening full edit.
 *
 * Which type gets created follows the parent (#886): a `wilds` site — a
 * wood, a marsh, a graveyard — creates `grounds` when the DM adds one, so its
 * parts arrive named for what they are instead of all being called rooms.
 * Every other site type still creates `room`. The type stays editable on the
 * child's own Details form afterward; this panel only picks the default.
 *
 * Mirrors `StoreInventory`'s shape: a self-contained view-mode component keyed
 * off a `locationId` prop rather than a route param, because `AtlasPlacePane`
 * reuses one mounted instance across every selected location instead of
 * remounting per id.
 *
 * Add, reorder and ambience are always available (#1125: Build is retired);
 * rename and delete are the room's own Details, one click away on its name.
 */
const { locationId } = defineProps<{
  locationId: string;
}>();

const locationIdRef = computed(() => locationId);
const { data: children } = useLocations(locationIdRef);
const spaces = computed(() => (children.value ?? []).filter((l) => isInteriorType(l.location_type)));

// Batched rather than one query per row — the reason `useLocationStateForRooms`
// exists at all. Read-only here: the toggles that actually assert a fact live
// on the space's own detail page (LocationStateControls), keyed by locationId.
// The same id set the Progress toggles read (`stateReadScope`), so the two
// panels share one request (#972).
const stateScope = computed(() => stateReadScope(locationId, children.value));
const { stateOf: siteStateOf } = useLocationStateForRooms(stateScope);

const toast = useToast();

const { mutate: updateLocation } = useUpdateLocation();

// ── Ambience (#868) ───────────────────────────────────────────────────────
// Full campaign list (shared query key — the Atlas already pays for this
// fetch) rather than just this site's own children: a site itself can
// inherit from an ancestor further up, and the walk needs the whole chain.
const { data: allLocations } = useAllLocations();
const ambienceById = computed(() => buildAtlasIndex(allLocations.value ?? []).byId);
const site = computed(() => ambienceById.value.get(locationId) ?? null);
const siteAmbience = computed(() => resolveInheritedTheme(locationId, ambienceById.value));
function spaceAmbience(spaceId: string) {
  return resolveInheritedTheme(spaceId, ambienceById.value);
}

// The suggestions are only needed once a theme input opens, so the two
// catalogue reads wait for the first edit rather than running on every
// selection (#972).
const themesWanted = ref(false);
const { data: playlists } = usePlaylists(() => themesWanted.value);
const { data: sounds } = useSounds(() => themesWanted.value);
const themeOptions = computed(() =>
  collectThemes(playlists.value === undefined ? [] : playlists.value, sounds.value === undefined ? [] : sounds.value),
);

function saveAmbience(id: string, theme: string | null): void {
  updateLocation({ id, update: { audio_theme: theme } }, { onError: (e) => toast.error(toast.fromError(e)) });
}

// ── Drag-to-reorder ─────────────────────────────────────────────────────────────
// Local mutable copy for VueDraggable (it reorders this in place); kept in
// sync with the server-derived list, persisted to the RPC on drag end.
const dragList = ref<Location[]>([]);
watch(spaces, (list) => { dragList.value = [...list]; }, { immediate: true });

const { mutate: reorder } = useReorderLocations();

function persistOrder() {
  reorder(dragList.value.map((s) => s.id));
}

// ── Add ─────────────────────────────────────────────────────────────────────────
// The type a new space gets follows the parent — see `childSpaceType`'s
// docstring for the rule. `site` is this panel's own location (looked up
// above for the ambience row), so its `location_type` is already in scope —
// no second query.
const childType = computed(() => childSpaceType(site.value?.location_type));
const childTypePlural = computed(() => spaceNoun(site.value?.location_type).plural);
// "grounds" reads fine bare ("Add grounds…", like "Add supplies…"); "room"
// needs its article back once it's no longer the fixed word in a template
// literal.
const childTypeArticled = computed(() => (childType.value === "grounds" ? "grounds" : "a room"));

const newSpaceName = ref("");
const { mutate: createLocation, isPending: isCreating } = useCreateLocation();
const showPaywall = ref(false);

function buildSpaceInsert(name: string, type: LocationType): Omit<LocationInsert, "campaign_id"> {
  return {
    name,
    location_type: type,
    parent_id: locationId,
    description: null,
    notes: null,
    tags: [],
    image_url: null,
    map_url: null,
    map_pins: [],
    is_map_shared: false,
    player_visible_to: [],
    player_summary: null,
    is_description_shared: false,
    is_npcs_shared: false,
    is_inventory_shared: false,
    npc_owner_id: null,
    related_location_ids: [],
    source_map_id: null,
    is_battle_map: false,
    grid_calibration: null,
    era_start: null,
    era_end: null,
  };
}

function addSpace() {
  const trimmed = newSpaceName.value.trim();
  if (!trimmed) return;
  // The DB trigger (guard_location_room_parent) is the actual authority on
  // which types may hold an interior space — this panel only ever inserts
  // under the site it is mounted on, so it never duplicates that check
  // client-side. A rejection still surfaces here rather than vanishing
  // silently.
  createLocation(buildSpaceInsert(trimmed, childType.value), {
    onSuccess: () => { newSpaceName.value = ""; },
    onError: (e) => {
      if (isQuotaExceeded(e)) { showPaywall.value = true; return; }
      toast.error(toast.fromError(e));
    },
  });
}
</script>
