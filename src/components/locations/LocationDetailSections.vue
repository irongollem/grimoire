<template>
  <!--
    The read-only body of a location: everything that is *about* the place
    rather than *where it sits*.

    Shared by `LocationSheet` (the /locations/:id detail page) and
    `AtlasPlacePane` (the explorer's right pane). It exists because the Atlas
    pane needed the same six sections the sheet already had, and a second copy
    would have drifted within a release — the sheet's People card grid and the
    pane's list were already two designs for one thing.

    Placement (breadcrumb, identity, scale rail, sub-locations, map) stays with
    each caller, because that genuinely differs: the sheet is a page, the pane is
    one half of an explorer.
  -->
  <div class="flex flex-col gap-6">
    <section v-if="hasDescription" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">Description</h2>
      <RichTextViewer :content="location.description" />
    </section>

    <!-- Durable, provenance-tracked Explored/Cleared/Looted facts (#787,
         epic #780). No location-type gate, same as Prepared Here below: the
         migration is explicit that a district can be cleared and a whole
         dungeon can be looted, not only a room.
         Titled "Progress" rather than "Site State" precisely because there is
         no gate — this renders on rooms, taverns and continents too, and a
         room is not a site. "Site" is the tier above it (district, building,
         dungeon, wilderness), so the word was actively wrong wherever this
         panel is most used. -->
    <section class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">Progress</h2>
      <LocationStateControls :location-id="location.id" />
    </section>

    <!-- Related Locations — non-hierarchical links (trade routes, tunnels,
         connected districts). Hidden on room-typed places: Ways out below is
         the room-scoped version of "what this connects to", and rendering
         both would be the same list of connections twice, in two mechanisms —
         the duplication #783 already removed from the Atlas tree's Interiors
         group. `related_location_ids` itself is untouched; a room simply
         doesn't render this section. -->
    <section v-if="relatedLocations.length && !isRoom" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Related Locations
        <span class="font-fell font-normal text-muted-foreground">({{ relatedLocations.length }})</span>
      </h2>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          v-for="rel in relatedLocations"
          :key="rel.id"
          :to="`/locations/${rel.id}`"
          class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 hover:border-primary/50 transition-colors"
        >
          <span
            class="h-2 w-2 rounded-full shrink-0"
            :style="{ backgroundColor: LOCATION_TYPE_COLORS[rel.location_type] }"
          />
          <span class="font-cinzel text-xs text-foreground truncate max-w-40">{{ rel.name }}</span>
        </RouterLink>
      </div>
    </section>

    <!-- Ways out — named, directional, lockable doors to sibling rooms
         (#785, epic #780). Same self-contained, always-editable shape as
         Rooms/Prepared Here below; this is the section that makes Related
         Locations redundant on a room, per the comment above. -->
    <section v-if="isRoom" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">Ways out</h2>
      <LocationDoors :room-id="location.id" :parent-id="location.parent_id" />
    </section>

    <!-- Store inventory — self-contained editable component. Useful enough
         to keep in view mode so a DM running a shop scene doesn't need to
         enter full-edit just to restock. -->
    <section v-if="isStoreType" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">Store</h2>
      <StoreInventory :location-id="location.id" :owner-npc-name="ownerNpcName" />
    </section>

    <!-- Site map — the place's image + live Cartographer map + room regions
         on a site-tier place (#784, epic #780). Self-contained, same
         scalar-prop shape as the panels around it. -->
    <section v-if="isSite" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">Site Map</h2>
      <SiteMapView :location-id="location.id" />
    </section>

    <!-- Site rooms — numbered, orderable rooms inside a site-tier place
         (district/building/dungeon/wilderness). Same self-contained,
         always-editable shape as Store above; replaces the Atlas tree's
         "Interiors" group for site-tier locations (AtlasPlacePane), so a
         dungeon's rooms are never rendered in two places at once. -->
    <section v-if="isSite" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">Rooms</h2>
      <SiteRoomsPanel :location-id="location.id" />
    </section>

    <!-- Prepared Here — traps, dungeon features, roll tables and loot
         tables anchored to this room (#788). No location-type gate: a trap
         in a tavern's back room is exactly as valid as one in a dungeon
         corridor, unlike Store/Rooms above which apply to a subset of types. -->
    <section class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">Prepared Here</h2>
      <LocationPlacements :location-id="location.id" />
    </section>

    <!-- People in the Area — NPCs whose location is this or any descendant. -->
    <section v-if="locationNpcs?.length" class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
          People in the Area
          <span class="font-fell font-normal text-muted-foreground">({{ locationNpcs.length }})</span>
        </h2>
        <AppButton
          v-if="locationNpcs.length > NPC_PREVIEW"
          variant="ghost"
          size="inline-xs"
          :label="npcsExpanded ? 'Show less' : `Show all ${locationNpcs.length}`"
          @click="npcsExpanded = !npcsExpanded"
        />
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <RouterLink
          v-for="npc in visibleNpcs"
          :key="npc.id"
          :to="`/npcs/${npc.id}`"
          class="group flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/50"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate font-cinzel text-sm font-semibold text-foreground">{{ npc.name }}</p>
            <p
              v-if="npc.occupation || npc.race"
              class="truncate text-caption text-muted-foreground italic"
            >{{ [npc.race, npc.occupation].filter(Boolean).join(" · ") }}</p>
            <p
              v-if="npc.location_id && npc.location_id !== location.id"
              class="mt-0.5 truncate font-cinzel text-2xs tracking-wide text-muted-foreground/60"
            >{{ locationNameOf(npc.location_id) }}</p>
          </div>
          <IconChevronRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
        </RouterLink>
      </div>
    </section>

    <section v-if="locationEncounters?.length" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Encounters Here
        <span class="font-fell font-normal text-muted-foreground">({{ locationEncounters.length }})</span>
      </h2>
      <div class="flex flex-col gap-2">
        <RouterLink
          v-for="enc in locationEncounters"
          :key="enc.id"
          :to="`/encounters/${enc.id}`"
          class="group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/50"
        >
          <span class="flex-1 truncate font-cinzel text-sm font-semibold text-foreground">{{ enc.name }}</span>
          <span v-if="enc.is_finished" class="text-label text-muted-foreground">Done</span>
          <IconChevronRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
        </RouterLink>
      </div>
    </section>

    <!-- Currently Here — party members whose effective position (their own
         override, or the party's location) is this id. Read-only; moving
         members happens in the editor. -->
    <section v-if="membersHere.length" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Currently Here
        <span class="font-fell font-normal text-muted-foreground">({{ membersHere.length }})</span>
      </h2>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          v-for="m in membersHere"
          :key="m.id"
          :to="`/party/${m.id}`"
          class="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 transition-colors hover:border-primary/50"
        >
          <span class="font-cinzel text-xs font-semibold text-foreground">{{ m.name }}</span>
          <span v-if="m.class" class="text-caption-sm text-muted-foreground italic">{{ m.class }}</span>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import LocationDoors from "@/components/locations/LocationDoors.vue";
import LocationPlacements from "@/components/locations/LocationPlacements.vue";
import LocationStateControls from "@/components/locations/LocationStateControls.vue";
import SiteMapView from "@/components/locations/SiteMapView.vue";
import SiteRoomsPanel from "@/components/locations/SiteRoomsPanel.vue";
import StoreInventory from "@/components/locations/StoreInventory.vue";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useEncountersByLocation } from "@/composables/encounters/useEncounters";
import { useNpcs, useNpcsByLocations } from "@/composables/npcs/useNpcs";
import { useParty } from "@/composables/party/useParty";
import { useCampaignStore } from "@/stores/campaign";
import { IconChevronRight } from "@/lib/icons";
import { isSiteType } from "@/lib/locations/tiers";
import { buildAtlasIndex, descendantsOf } from "@/lib/locations/tree";
import { extractTiptapText } from "@/lib/utils";
import { effectiveLocationId } from "@/lib/partyPosition";
import { LOCATION_TYPE_COLORS, STORE_LOCATION_TYPES } from "@/types/location.types";
import type { Location } from "@/types/location.types";

const { location } = defineProps<{ location: Location }>();

const NPC_PREVIEW = 3;
const npcsExpanded = ref(false);

const { data: allLocations } = useAllLocations();

const hasDescription = computed(() => extractTiptapText(location.description, 1).length > 0);

const relatedLocations = computed<Location[]>(() => {
  const ids = location.related_location_ids;
  if (!ids.length || !allLocations.value?.length) return [];
  return ids
    .map((id) => allLocations.value!.find((l) => l.id === id))
    .filter((l): l is Location => !!l);
});

/** This place plus everything under it — an NPC in a town is in its region. */
const subtreeIds = computed(() => {
  const index = buildAtlasIndex(allLocations.value ?? []);
  return [location.id, ...descendantsOf(index, location.id).map((l) => l.id)];
});

const { data: locationNpcs } = useNpcsByLocations(subtreeIds);
const { data: locationEncounters } = useEncountersByLocation(computed(() => location.id));

const visibleNpcs = computed(() =>
  npcsExpanded.value ? (locationNpcs.value ?? []) : (locationNpcs.value ?? []).slice(0, NPC_PREVIEW),
);

const { data: allPartyMembers } = useParty();
const campaign = useCampaignStore();
// #786: current_location_id on a member is an override; a member with none
// is wherever the party is, so this reads the derived position, not the
// raw column — otherwise a follower never shows up as "currently here".
const membersHere = computed(() =>
  (allPartyMembers.value ?? []).filter(
    (m) => effectiveLocationId(m, campaign.activeCampaign?.current_location_id ?? null) === location.id,
  ),
);

const isStoreType = computed(() => STORE_LOCATION_TYPES.has(location.location_type));
const isSite = computed(() => isSiteType(location.location_type));
const isRoom = computed(() => location.location_type === "room");

const { data: allNpcs } = useNpcs();
const ownerNpcName = computed(
  () => allNpcs.value?.find((n) => n.id === location.npc_owner_id)?.name ?? null,
);

function locationNameOf(id: string): string {
  return allLocations.value?.find((l) => l.id === id)?.name ?? "";
}

/**
 * Two different questions were being asked of one flag, and #788 made them
 * disagree.
 *
 * The body used to be gated on "does any section render?". "Prepared Here"
 * has no location-type gate — every place can hold a trap or a table, unlike
 * Store (store types) or Rooms (site tier) — so from #788 that answer is always
 * yes, and the gate went with it rather than being left as a condition that
 * cannot be false. The body is always present on purpose: a DM opening a bare
 * room has to be able to put something in it, and a panel you cannot reach
 * until the location already has content is no use.
 *
 * `hasSubstance` answers the different question the Atlas pane actually asks —
 * is there anything *here*, as opposed to an empty place with editing
 * affordances on it? It deliberately excludes the always-present editing
 * panels (Rooms, Prepared Here, Ways out, Progress), so "Nothing inside X
 * yet" keeps meaning what it meant before those sections existed. Folding one
 * of them into the body gate alone would have silently retired that message
 * for every location in the app. Progress (#787) is the newest of the four:
 * every location gets the section whether or not a fact has ever been
 * asserted, so counting it toward substance would make a bare, freshly
 * created place register as non-empty the instant this section mounted.
 */
const hasSubstance = computed(
  () =>
    hasDescription.value ||
    // Only counts when the Related Locations section itself would render —
    // on a room it never does (Ways out replaces it), so a stray
    // `related_location_ids` set before the place became a room must not
    // claim substance the body no longer shows.
    (relatedLocations.value.length > 0 && !isRoom.value) ||
    (locationNpcs.value?.length ?? 0) > 0 ||
    (locationEncounters.value?.length ?? 0) > 0 ||
    membersHere.value.length > 0,
);

defineExpose({ hasSubstance });

// An expanded roster belongs to the place it was expanded on; carrying it into
// the next selection in the Atlas pane would be stale context, not a preference.
watch(
  () => location.id,
  () => {
    npcsExpanded.value = false;
  },
);
</script>
