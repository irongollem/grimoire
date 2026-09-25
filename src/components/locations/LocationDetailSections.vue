<template>
  <!--
    The read-only body of a location: everything that is *about* the place
    rather than *where it sits*.

    Mounted by `AtlasPlacePane` (the explorer's right pane). It was extracted
    when a second, full-page location sheet needed the same six sections; that
    page is gone (25 Sep 2026) and this stays a component because the pane is
    long enough without it inline.

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
         no gate — this renders on rooms, districts and continents too, and a
         room is not a site. "Site" means building, dungeon, store, tavern,
         inn or wilds (#810, #886) — the six types with a floor plan — so the
         word was actively wrong wherever this panel is most used. -->
    <section class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">Progress</h2>
      <LocationStateControls :location-id="location.id" />
    </section>

    <!-- Loot — held here until a DM drops it to chat (#830). Same
         hold-then-drop verb `QuestPayoffPanel` gives a beat; dropping it
         is what flips Progress's Looted fact above, so this sits right after
         it. No location-type gate — a shop till or a shrine can hold loot as
         well as a dungeon room — but it does need a campaign, since dropped
         loot is a chat message and `loot_placements` scopes to one: a
         personal, campaign-less location has nowhere for it to land. -->
    <section v-if="location.campaign_id" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">Loot</h2>
      <LocationLootPanel :location-id="location.id" :campaign-id="location.campaign_id" :loot="locationLoot ?? []" />
    </section>

    <!-- Related Locations — non-hierarchical links (trade routes, tunnels,
         connected districts). Hidden on interior places (room, and #886's
         `grounds`): Ways out below is the interior-scoped version of "what
         this connects to", and rendering both would be the same list of
         connections twice, in two mechanisms — the duplication #783 already
         removed from the Atlas tree's Interiors group. `related_location_ids`
         itself is untouched; an interior space simply doesn't render this
         section. -->
    <section v-if="relatedLocations.length && !isInteriorSpace" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Related Locations
        <span class="font-fell font-normal text-muted-foreground">({{ relatedLocations.length }})</span>
      </h2>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          v-for="rel in relatedLocations"
          :key="rel.id"
          :to="placeRoute(rel.id)"
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

    <!-- Ways out — named, directional, lockable doors to sibling interior
         spaces (#785, epic #780; `grounds` joined `room` at #886). Same
         self-contained, always-editable shape as Rooms/Prepared Here below;
         this is the section that makes Related Locations redundant on an
         interior space, per the comment above. -->
    <section v-if="isInteriorSpace" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">Ways out</h2>
      <LocationDoors :room-id="location.id" :parent-id="location.parent_id" :building="authoring" />
    </section>

    <!-- Ways out, lifted to the site (#868, S6) — a site sees its whole door
         graph at once, the same way `SiteRoomsPanel` below replaces the
         "Interiors" tree group. A room's own Ways out section above stays a
         one-room view; this is the other end of the same graph. -->
    <section v-if="isSite" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">Ways out</h2>
      <SiteWaysOutPanel :site-id="location.id" :spaces="siteSpaces" hide-header :building="building" />
    </section>

    <!-- Store inventory — self-contained editable component. Useful enough
         to keep in view mode so a DM running a shop scene doesn't need to
         enter full-edit just to restock. -->
    <section v-if="isStoreType" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">Store</h2>
      <StoreInventory :location-id="location.id" :owner-npc-name="ownerNpcName" />
    </section>

    <!-- Site rooms — numbered, orderable interior spaces inside a site-tier
         place (building/dungeon/store/tavern/inn/wilds — the six types with
         a floor plan, #810, #886). Same self-contained, always-editable
         shape as Store above; replaces the Atlas tree's "Interiors" group
         for site-tier locations (AtlasPlacePane), so a dungeon's rooms (or a
         wilds site's grounds) are never rendered in two places at once. -->
    <section v-if="isSite" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">{{ siteSpacesHeading }}</h2>
      <SiteRoomsPanel :location-id="location.id" :building="building" />
    </section>

    <!-- Prepared Here — traps, dungeon features, roll tables and loot
         tables anchored to this room (#788). No location-type gate: a trap
         in a tavern's back room is exactly as valid as one in a dungeon
         corridor, unlike Store/Rooms above which apply to a subset of types. -->
    <section class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">Prepared Here</h2>
      <LocationPlacements :location-id="location.id" :building="authoring" />
    </section>

    <!-- Sort Into Rooms (#879) — the re-homing backlog: NPCs and encounters
         assigned to this place before its rooms existed, still sitting one
         level too coarse. Self-hiding (no children, nothing to sort into) and
         self-titled, unlike the panels above, because its whole visibility
         condition is data its own query already needs to fetch. -->
    <LocationSortPanel :location-id="location.id" :building="authoring" />

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
import LocationLootPanel from "@/components/locations/LocationLootPanel.vue";
import LocationPlacements from "@/components/locations/LocationPlacements.vue";
import LocationSortPanel from "@/components/locations/LocationSortPanel.vue";
import LocationStateControls from "@/components/locations/LocationStateControls.vue";
import SiteRoomsPanel from "@/components/locations/SiteRoomsPanel.vue";
import SiteWaysOutPanel from "@/components/locations/SiteWaysOutPanel.vue";
import StoreInventory from "@/components/locations/StoreInventory.vue";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useSiteStructure } from "@/composables/locations/useSiteStructure";
import { useEncountersByLocation } from "@/composables/encounters/useEncounters";
import { useLootPlacements } from "@/composables/quests/useQuestFlow";
import { useNpcs, useNpcsByLocations } from "@/composables/npcs/useNpcs";
import { useParty } from "@/composables/party/useParty";
import { useCampaignStore } from "@/stores/campaign";
import { IconChevronRight } from "@/lib/icons";
import { isInteriorType, isSiteType, spaceHeading } from "@/lib/locations/tiers";
import { buildAtlasIndex, descendantsOf } from "@/lib/locations/tree";
import { extractTiptapText } from "@/lib/utils";
import { effectiveLocationId } from "@/lib/partyPosition";
import { placeRoute } from "@/lib/locations/placeRoute";
import { LOCATION_TYPE_COLORS, STORE_LOCATION_TYPES } from "@/types/location.types";
import type { Location } from "@/types/location.types";

const { location, building = false } = defineProps<{
  location: Location;
  /** Build mode (#884) — the site workbench. Threaded to the four
   *  structural sections (Ways out, Rooms, Prepared Here); the play
   *  sections (Progress, Loot, Store) never take it — they stay live in
   *  Browse the same as they always have. */
  building?: boolean;
}>();

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
const { data: locationLoot } = useLootPlacements({ locationId: computed(() => location.id) });

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
// #886/#887: `SiteRoomsPanel` renders no heading of its own (see the comment
// atop its template) — this is the only place the word appears. The
// room/grounds rule itself lives in `spaceHeading`'s docstring.
const siteSpacesHeading = computed(() => spaceHeading(location.location_type));
// Room, or #886's `grounds` — the two interior types, bound to another
// place's floor plan rather than carrying one of their own.
const isInteriorSpace = computed(() => isInteriorType(location.location_type));

/**
 * Whether the two structural panels that render *outside* the site tier
 * (Ways out on a room, Prepared Here everywhere) may be edited.
 *
 * #884 put every structural panel behind the site-only `building` prop, but
 * Build only exists on a site-tier place (`AtlasPlacePane`'s Build/Done pair
 * is itself gated on `isSiteType`) — so a room's own Ways out, and Prepared
 * Here on any non-site place, inherited a mode they can never enter and went
 * permanently read-only. That was collateral, not #884's intent, which said
 * non-site places "keep Edit as it is".
 *
 * A structural panel is editable when the place is in Build, or when the
 * place has no Build state to enter at all. `SiteWaysOutPanel` and
 * `SiteRoomsPanel` below stay on the raw `building` prop — both are already
 * gated to site-tier places, where Build genuinely exists and #884's
 * always-editable-in-Build intent holds exactly as written.
 */
const authoring = computed(() => building || !isSiteType(location.location_type));

// ── Site structure (#868, S6) — spaces for the Ways out panel. `null` when
//    this isn't a site keeps every query inside `useSiteStructure` disabled
//    rather than fetching for a room or a continent. The published-drawing
//    staleness this composable also derives now surfaces through the Layers
//    panel (#884, S5) instead of a strip here — see `SiteMapLayersPanel`. ───
const siteStructureLocation = computed(() => (isSite.value ? location : null));
const { spaces: siteSpaces } = useSiteStructure(siteStructureLocation);

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
    // on an interior space it never does (Ways out replaces it), so a stray
    // `related_location_ids` set before the place became a room or grounds
    // must not claim substance the body no longer shows.
    (relatedLocations.value.length > 0 && !isInteriorSpace.value) ||
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
