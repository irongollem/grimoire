<template>
  <!-- How far this place is from where the party stands and how long that takes: by road, or where no road joins
       the two, in a straight line on the map both are pinned on. Shown only when one of them can say. -->
  <div v-if="journey" class="flex flex-col gap-2 border border-border bg-card px-3 py-2.5" data-testid="location-journey">
    <p class="text-body text-foreground">
      <span class="font-semibold">{{ formatDistance(journey.summary.distance, journey.summary.unit) }}</span>
      from {{ journey.summary.from?.name }}, where the party is<template v-if="passing">, {{ passing }}</template><template v-if="straightOn">, {{ straightWords }}</template><template v-if="groundText">, {{ groundText }}</template>:
      <span class="font-semibold">{{ formatTravelTime(journey.summary.time) }}</span>
      at a {{ paceLabel }} pace<template v-if="wayName"> by {{ wayName }}</template>.
    </p>
    <!-- Where the journey can pause: each night's camp and each place the road passes, in order. -->
    <p v-if="stops" class="text-caption text-muted-foreground" data-testid="location-journey-stops">On the way: {{ stops }}.</p>
    <!-- Only where the campaign counts food (the optional rule "Rations on the Road"). -->
    <p v-if="food" class="text-caption text-muted-foreground" data-testid="location-journey-food">{{ food }}</p>
    <div class="flex flex-wrap items-center gap-2">
      <SegmentedControl v-model="paceId" :options="PACE_OPTIONS" size="sm" aria-label="Travel pace" />
      <!-- How the party travels: on foot, a mount, a sled, a ship, the air. A ship only matters on water legs, but
           the DM may pick one for a sea road, so every way is listed. -->
      <AppSelect v-model="wayKey" size="sm" aria-label="How you travel" data-testid="location-journey-way">
        <option v-for="w in ways" :key="w.key" :value="w.key">{{ w.name }}</option>
      </AppSelect>
      <div class="ml-auto flex flex-wrap gap-2">
        <AppButton variant="outline" size="sm" :icon="IconAddEvent" label="Add to calendar" data-testid="location-journey-plan" @click="eventOpen = true" />
        <!-- Making the journey (decision 4): the party goes, the day moves on, and the food is eaten. -->
        <AppButton size="sm" :icon="IconCompassRose" label="Set out" data-testid="location-journey-set-out" @click="setOutOpen = true" />
      </div>
    </div>
    <!-- What the road may bring: the encounter tables of the roads this journey takes, for a stop on the way.
         Whether anything happens is the DM's call; the table only says what. -->
    <div v-if="wayTables.length" class="flex flex-col gap-2 border-t border-border pt-2" data-testid="location-journey-tables">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-caption text-muted-foreground">On the road:</span>
        <AppButton v-for="table in wayTables" :key="table.id" variant="outline" size="sm" :icon="IconDice" :label="`Roll on ${table.name}`" @click="rollOn(table)" />
      </div>
      <RollTableResult v-if="rolled" :result="rolled" />
    </div>
    <!-- The travel event is the record of a trip, as it is for a route measured on a map (#932). -->
    <EventModal v-model="eventOpen" :prefill="eventPrefill" />
    <SetOutDialog
      v-if="setOutOpen"
      open
      :destination="{ id: locationId, name: nameOf(locationId) }"
      :journey="journey"
      :pace-label="paceLabel"
      :way-name="wayName"
      :traveller-ids="travelerIds"
      :moves-party="movesParty"
      :description="eventWords"
      @close="setOutOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import EventModal from "@/components/calendar/EventModal.vue";
import SetOutDialog from "./SetOutDialog.vue";
import RollTableResult from "@/components/dungeon-features/RollTableResult.vue";
import { useRollTables } from "@/composables/dungeon-features/useRollTables";
import { rollOnTable, type RollTableRollResult } from "@/lib/dungeon-features/rollTableRoll";
import type { RollTable } from "@/types/rollTable.types";
import { useAllLocations, useLocation } from "@/composables/locations/useLocations";
import { useMapPictureSize } from "@/composables/locations/useMapPictureSize";
import { useLocationRoads } from "@/composables/locations/useLocationRoads";
import { useTravel } from "@/composables/locations/useTravel";
import { useParty } from "@/composables/party/useParty";
import { resolveRuleConfig, useIsRuleEnabled, useOptionalRules } from "@/composables/rules/useOptionalRules";
import { rationsNeeded } from "@/rules/rations";
import { IconAddEvent, IconDice, IconCompassRose } from "@/lib/icons";
import { routeDescription, routeEventPrefill } from "@/lib/locations/mapRoute";
import { formatDistance } from "@/lib/locations/mapScale";
import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import { journeyByRoad, passingText, roadTableIds, stopsText, travellersOf } from "@/lib/travel/journey";
import { journeyByMap, sharedMapOf } from "@/lib/travel/mapLine";
import { tablesForPlaces } from "@/lib/travel/wayTables";
import { useEntityPlacementsFor } from "@/composables/locations/useLocationPlacements";
import { DEFAULT_TRAVEL_PACE, formatTravelTime, getTravelPace, TRAVEL_PACES, type TravelPaceId } from "@/rules/travelPace";
import { ON_FOOT_KEY, WAY_PRESETS, type TravelContext, type WayOfTravel } from "@/rules/travelSpeed";
import { useCalendarStore } from "@/stores/calendar";
import { useCampaignStore } from "@/stores/campaign";

/**
 * The journey by road from where the party is to this place (#1222): the distance along the shortest chain of
 * roads, the places it passes, and the time at a pace, with the same "Add to calendar" a route measured on a map
 * has. The party standing in a room of a town is, for the road, in the town.
 */
const { locationId } = defineProps<{ locationId: string }>();

const campaign = useCampaignStore();
const calendar = useCalendarStore();
const roads = useLocationRoads();
const { data: locations } = useAllLocations();
const { data: party } = useParty();

const PACE_OPTIONS = TRAVEL_PACES.map((p) => ({ value: p.id, label: p.label }));
const paceId = ref<TravelPaceId>(DEFAULT_TRAVEL_PACE);
const paceLabel = computed(() => getTravelPace(paceId.value).label.toLowerCase());

// How the party travels (decision 9: one formula, the campaign's terrains and ways). A way that has gone from the
// campaign (its puller dismissed) falls back to walking rather than leaving the picker on nothing.
const { terrains, ways, companionSpeed, openLand } = useTravel();
const wayKey = ref(ON_FOOT_KEY);
const way = computed<WayOfTravel>(() => ways.value.find((w) => w.key === wayKey.value) ?? ways.value.find((w) => w.key === ON_FOOT_KEY) ?? WAY_PRESETS[0]);
// "by dogsled", but "by The Sea Hag": a book's way is a common noun, the DM's may be a name.
const wayName = computed(() => (way.value.key === ON_FOOT_KEY ? null : way.value.source !== null ? way.value.name.toLowerCase() : way.value.name));
const travel = computed<TravelContext>(() => ({ paceId: paceId.value, way: way.value, terrains: terrains.value, companionSpeed }));
const terrainName = (key: string): string => (terrains.value.find((t) => t.key === key)?.name ?? key).toLowerCase();

// The optional rule "Off the Road": a straight line on a map is lengthened by its winding factor.
const offRoadOn = useIsRuleEnabled("off_road");
const { data: ruleRows } = useOptionalRules();
const offRoadFactor = computed(() => resolveRuleConfig(ruleRows.value, "off_road").factor);

const byId = computed(() => new Map((locations.value ?? []).map((l) => [l.id, l])));

const partyAt = computed(() => (campaign.activeCampaign ? campaign.activeCampaign.current_location_id : null));
const parentOf = (id: string): string | null => byId.value.get(id)?.parent_id ?? null;

const byRoad = computed(() => {
  const all = roads.data.value;
  if (!partyAt.value || !all || byId.value.size === 0) return null;
  return journeyByRoad({
    fromId: partyAt.value,
    toId: locationId,
    roads: all,
    parentOf,
    nameOf: (id) => byId.value.get(id)?.name ?? "a place that is gone",
    travel: travel.value,
  });
});

// With no road between them: the straight line on the map both are pinned on. Its place is read (with its pins,
// scale and picture) only once the roads are known to have no way, so a campaign with roads pays nothing for it.
// A flyer ignores the ground (decision 10), so it asks for the map's line even where roads join the two places.
const flies = computed(() => way.value.kind === "air");
const shared = computed(() => {
  if (!partyAt.value || roads.data.value === undefined || (byRoad.value !== null && !flies.value) || byId.value.size === 0) return null;
  return sharedMapOf(partyAt.value, locationId, parentOf);
});
const { data: mapPlace } = useLocation(() => (shared.value ? shared.value.mapId : null));
const pictureSize = useMapPictureSize(() => (mapPlace.value ? (mapPlace.value.map_url ?? mapPlace.value.map_layer_url) : null));
const byMap = computed(() => {
  const place = mapPlace.value;
  if (!shared.value || !place || place.id !== shared.value.mapId) return null;
  return journeyByMap({ shared: shared.value, pins: place.map_pins, scale: place.map_scale, size: pictureSize.value, travel: travel.value, openLand: { terrain: openLand.value, winding: offRoadOn.value ? offRoadFactor.value : 1 } });
});

// A flyer takes the map's straight line when the two places share a scaled map, and the roads otherwise.
const journey = computed(() => (flies.value ? (byMap.value ?? byRoad.value) : (byRoad.value ?? byMap.value)));
const byTheMap = computed(() => journey.value !== null && journey.value === byMap.value);
/** The place whose map the distance was measured on, when it was not found by road. */
const straightOn = computed(() => (byTheMap.value && mapPlace.value ? mapPlace.value.name : null));
const passing = computed(() => (journey.value ? passingText(journey.value.passing) : ""));

/** How the map line is put in the sentence: a flyer's is flying straight there, a walker's winds when "Off the Road" is on. */
const straightWords = computed(() => {
  const j = journey.value;
  if (!j || straightOn.value === null) return "";
  if (flies.value) return `flying straight there over the map of ${straightOn.value}`;
  return offRoadOn.value ? `about ${formatDistance(j.summary.distance, j.summary.unit)} off the road, on the map of ${straightOn.value}` : `in a straight line on the map of ${straightOn.value}`;
});

/** "12 mi of snow and 3 mi of difficult going": the ground the journey crosses, in the campaign's words. */
const groundText = computed(() => {
  const j = journey.value;
  // A flyer is not slowed by the ground it passes over, so the ground is not worth naming.
  if (!j || j.offRoad || j.grounds.length === 0 || way.value.kind === "air") return "";
  const parts = j.grounds.map((g) => `${formatDistance(g.distance, j.summary.unit)} of ${terrainName(g.terrain)}`);
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
});

const stops = computed(() => (journey.value ? stopsText(journey.value.stops) : ""));

// ── Food for the road (optional rule) ───────────────────────────────────────
const countsFood = useIsRuleEnabled("rations");
const food = computed(() => {
  const j = journey.value;
  if (!j || !countsFood.value) return null;
  const days = j.summary.time.calendarDays;
  if (days < 1) return null;
  const travellers = travelerIds.value.length;
  const each = `${days} ${days === 1 ? "ration" : "rations"} each`;
  // Who sets out is who stands where the journey starts; with nobody placed there, only the share is known.
  return travellers > 1 ? `Food for the road: ${rationsNeeded(days, travellers)} rations for ${travellers} travellers (${each}).` : `Food for the road: ${each}.`;
});

// ── What the road may bring ──────────────────────────────────────────────────
const { data: rollTables } = useRollTables();
// The tables placed on places (Atlas placements): those of the places the journey touches hold for it, a place
// with none taking those of the place it lies inside (`tablesForPlaces`, the AI table's rule too). Read for the
// campaign's tables in one query, and only once there is a journey to offer them for.
const tableIds = computed(() => (journey.value ? (rollTables.value ?? []).map((t) => t.id) : []));
const { data: tablePlacements } = useEntityPlacementsFor("roll_table", tableIds);
const wayTables = computed<RollTable[]>(() => {
  const j = journey.value;
  const all = rollTables.value;
  if (!j || !all || !roads.data.value) return [];
  const byId = new Map(all.map((t) => [t.id, t]));
  // A road's own table first: the road is where the party is between two places.
  const onRoads = roadTableIds(j, roads.data.value);
  const placed = (tablePlacements.value ?? []).flatMap((p) => (p.roll_table_id ? [{ id: p.roll_table_id, placeId: p.location_id }] : []));
  const onPlaces = tablesForPlaces(j.placeIds, parentOf, placed).map(({ table }) => table.id);
  return [...new Set([...onRoads, ...onPlaces])].flatMap((id) => {
    const table = byId.get(id);
    return table ? [table] : [];
  });
});
const rolled = ref<RollTableRollResult | null>(null);
function rollOn(table: RollTable): void {
  rolled.value = rollOnTable(table);
}

// ── Add to calendar ───────────────────────────────────────────────────────────
const eventOpen = ref(false);
/** The party members standing where the journey starts: they are the ones setting out. */
const travelerIds = computed(() => {
  const j = journey.value;
  const origin = j?.summary.from?.id;
  const members = party.value;
  if (!j || !origin || !members) return [];
  // A journey across a map starts at a pin, with no roads to stop the walk up from where someone stands.
  return travellersOf({ origin, members, partyAt: partyAt.value, parentOf, roads: byRoad.value === null ? [] : (roads.data.value ?? []) });
});
/** The travel event's words, the same whether the journey is planned on the calendar or made at once. */
const eventWords = computed(() => {
  const j = journey.value;
  if (!j) return "";
  const how = straightOn.value !== null ? (flies.value ? ` Flying straight there over the map of ${straightOn.value}.` : offRoadOn.value ? ` Off the road, measured on the map of ${straightOn.value}.` : ` Measured in a straight line on the map of ${straightOn.value}.`) : passing.value === "" ? "" : ` By road, ${passing.value}.`;
  const by = wayName.value === null ? "" : ` By ${wayName.value}.`;
  return `${routeDescription(j.summary)}${how}${by}`;
});
const eventPrefill = computed(() => {
  const j = journey.value;
  if (!j) return undefined;
  const start = { year: campaign.todayYear, month: campaign.todayMonth, day: campaign.todayDay };
  return { ...routeEventPrefill(j.summary, start, calendar.adapter, travelerIds.value), description: toTiptapJson(eventWords.value) };
});

// ── Set out ─────────────────────────────────────────────────────────────────
const setOutOpen = ref(false);
// Setting out moves the party, which ends this journey and unmounts the dialog before it can say it closed; left
// open, it would come back by itself when Undo brings the journey back.
watch(journey, (j) => {
  if (!j) setOutOpen.value = false;
});
const nameOf = (id: string): string => byId.value.get(id)?.name ?? "a place that is gone";
/** The party's own place goes with them when it stands where the journey starts, or inside that place. */
const movesParty = computed(() => {
  const origin = journey.value?.summary.from?.id;
  if (!origin || !partyAt.value) return false;
  const seen = new Set<string>();
  for (let at: string | null = partyAt.value; at !== null && !seen.has(at); at = parentOf(at)) {
    if (at === origin) return true;
    seen.add(at);
  }
  return false;
});
</script>
