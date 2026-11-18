<template>
  <!-- How far this place is from where the party stands and how long that takes: by road, or where no road joins
       the two, in a straight line on the map both are pinned on. Shown only when one of them can say. -->
  <div v-if="journey" class="flex flex-col gap-2 border border-border bg-card px-3 py-2.5" data-testid="location-journey">
    <p class="text-body text-foreground">
      <span class="font-semibold">{{ formatDistance(journey.summary.distance, journey.summary.unit) }}</span>
      from {{ journey.summary.from?.name }}, where the party is<template v-if="passing">, {{ passing }}</template><template v-if="straightOn">, in a straight line on the map of {{ straightOn }}</template>:
      <span class="font-semibold">{{ formatTravelTime(journey.summary.time) }}</span>
      at a {{ paceLabel }} pace.
    </p>
    <!-- Only where the campaign counts food (the optional rule "Rations on the Road"). -->
    <p v-if="food" class="text-caption text-muted-foreground" data-testid="location-journey-food">{{ food }}</p>
    <div class="flex flex-wrap items-center gap-2">
      <SegmentedControl v-model="paceId" :options="PACE_OPTIONS" size="sm" aria-label="Travel pace" />
      <AppButton class="ml-auto" variant="outline" size="sm" :icon="IconAddEvent" label="Add to calendar" data-testid="location-journey-plan" @click="eventOpen = true" />
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
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import EventModal from "@/components/calendar/EventModal.vue";
import RollTableResult from "@/components/dungeon-features/RollTableResult.vue";
import { useRollTables } from "@/composables/dungeon-features/useRollTables";
import { rollOnTable, type RollTableRollResult } from "@/lib/dungeon-features/rollTableRoll";
import type { RollTable } from "@/types/rollTable.types";
import { useAllLocations, useLocation } from "@/composables/locations/useLocations";
import { useMapPictureSize } from "@/composables/locations/useMapPictureSize";
import { useLocationRoads } from "@/composables/locations/useLocationRoads";
import { useParty } from "@/composables/party/useParty";
import { useIsRuleEnabled } from "@/composables/rules/useOptionalRules";
import { rationsNeeded } from "@/rules/rations";
import { IconAddEvent, IconDice } from "@/lib/icons";
import { routeDescription, routeEventPrefill } from "@/lib/locations/mapRoute";
import { formatDistance } from "@/lib/locations/mapScale";
import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import { journeyByRoad, passingText, roadTableIds } from "@/lib/travel/journey";
import { journeyByMap, sharedMapOf } from "@/lib/travel/mapLine";
import { DEFAULT_TRAVEL_PACE, formatTravelTime, getTravelPace, TRAVEL_PACES, type TravelPaceId } from "@/rules/travelPace";
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
    paceId: paceId.value,
  });
});

// With no road between them: the straight line on the map both are pinned on. Its place is read (with its pins,
// scale and picture) only once the roads are known to have no way, so a campaign with roads pays nothing for it.
const shared = computed(() => {
  if (!partyAt.value || roads.data.value === undefined || byRoad.value !== null || byId.value.size === 0) return null;
  return sharedMapOf(partyAt.value, locationId, parentOf);
});
const { data: mapPlace } = useLocation(() => (shared.value ? shared.value.mapId : null));
const pictureSize = useMapPictureSize(() => (mapPlace.value ? (mapPlace.value.map_url ?? mapPlace.value.map_layer_url) : null));
const byMap = computed(() => {
  const place = mapPlace.value;
  if (!shared.value || !place || place.id !== shared.value.mapId) return null;
  return journeyByMap({ shared: shared.value, pins: place.map_pins, scale: place.map_scale, size: pictureSize.value, paceId: paceId.value });
});

const journey = computed(() => byRoad.value ?? byMap.value);
/** The place whose map the distance was measured on, when it was not found by road. */
const straightOn = computed(() => (byRoad.value === null && byMap.value !== null && mapPlace.value ? mapPlace.value.name : null));
const passing = computed(() => (journey.value ? passingText(journey.value.passing) : ""));

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
const wayTables = computed<RollTable[]>(() => {
  const j = journey.value;
  const all = rollTables.value;
  if (!j || !all || !roads.data.value) return [];
  return roadTableIds(j, roads.data.value).flatMap((id) => all.filter((t) => t.id === id));
});
const rolled = ref<RollTableRollResult | null>(null);
function rollOn(table: RollTable): void {
  rolled.value = rollOnTable(table);
}

// ── Add to calendar ───────────────────────────────────────────────────────────
const eventOpen = ref(false);
/** The party members standing where the journey starts: they are the ones setting out. */
const travelerIds = computed(() => {
  const origin = journey.value?.summary.from?.id;
  const members = party.value;
  if (!origin || !members) return [];
  return members.filter((m) => m.current_location_id === origin).map((m) => m.id);
});
const eventPrefill = computed(() => {
  const j = journey.value;
  if (!j) return undefined;
  const start = { year: campaign.todayYear, month: campaign.todayMonth, day: campaign.todayDay };
  const how = straightOn.value !== null ? ` Measured in a straight line on the map of ${straightOn.value}.` : passing.value === "" ? "" : ` By road, ${passing.value}.`;
  const words = `${routeDescription(j.summary)}${how}`;
  return { ...routeEventPrefill(j.summary, start, calendar.adapter, travelerIds.value), description: toTiptapJson(words) };
});
</script>
