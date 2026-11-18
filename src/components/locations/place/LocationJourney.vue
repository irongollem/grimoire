<template>
  <!-- How far this place is from where the party stands, by road, and how long that takes. Shown only when there
       is a way: a place with no road to the party says nothing here (its roads are listed below it). -->
  <div v-if="journey" class="flex flex-col gap-2 border border-border bg-card px-3 py-2.5" data-testid="location-journey">
    <p class="text-body text-foreground">
      <span class="font-semibold">{{ formatDistance(journey.summary.distance, journey.summary.unit) }}</span>
      from {{ journey.summary.from?.name }}, where the party is<template v-if="passing">, {{ passing }}</template>:
      <span class="font-semibold">{{ formatTravelTime(journey.summary.time) }}</span>
      at a {{ paceLabel }} pace.
    </p>
    <div class="flex flex-wrap items-center gap-2">
      <SegmentedControl v-model="paceId" :options="PACE_OPTIONS" size="sm" aria-label="Travel pace" />
      <AppButton class="ml-auto" variant="outline" size="sm" :icon="IconAddEvent" label="Add to calendar" data-testid="location-journey-plan" @click="eventOpen = true" />
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
import { useAllLocations } from "@/composables/locations/useLocations";
import { useLocationRoads } from "@/composables/locations/useLocationRoads";
import { useParty } from "@/composables/party/useParty";
import { IconAddEvent } from "@/lib/icons";
import { routeDescription, routeEventPrefill } from "@/lib/locations/mapRoute";
import { formatDistance } from "@/lib/locations/mapScale";
import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import { journeyByRoad, passingText } from "@/lib/travel/journey";
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

const journey = computed(() => {
  const partyAt = campaign.activeCampaign ? campaign.activeCampaign.current_location_id : null;
  const all = roads.data.value;
  if (!partyAt || !all || byId.value.size === 0) return null;
  return journeyByRoad({
    fromId: partyAt,
    toId: locationId,
    roads: all,
    parentOf: (id) => byId.value.get(id)?.parent_id ?? null,
    nameOf: (id) => byId.value.get(id)?.name ?? "a place that is gone",
    paceId: paceId.value,
  });
});
const passing = computed(() => (journey.value ? passingText(journey.value.passing) : ""));

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
  const words = passing.value === "" ? routeDescription(j.summary) : `${routeDescription(j.summary)} By road, ${passing.value}.`;
  return { ...routeEventPrefill(j.summary, start, calendar.adapter, travelerIds.value), description: toTiptapJson(words) };
});
</script>
