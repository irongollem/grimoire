<template>
  <!-- Below the map rather than over it (#932): the map is the thing being
       read, and on a phone a panel laid across it would hide the route. -->
  <section class="flex flex-col gap-2.5 rounded-md border border-border bg-card px-3 py-2.5" aria-label="Measure a route">
    <div class="flex items-center gap-2">
      <IconRuler class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <h3 class="flex-1 text-label-lg font-semibold text-muted-foreground">MEASURE A ROUTE</h3>
      <AppButton variant="ghost" size="icon-xs" :icon="IconClose" tooltip="Stop measuring (Esc)" @click="emit('close')" />
    </div>

    <!-- Nothing can be measured without a scale; say where it is set. -->
    <div v-if="!scale" class="flex flex-wrap items-center gap-2">
      <p class="min-w-0 flex-1 text-body text-muted-foreground">
        This map has no scale yet, so it cannot tell a distance. Open Build and choose Set scale.
      </p>
      <AppButton variant="outline" size="xs" label="Open Build" @click="openBuild" />
    </div>

    <template v-else>
      <p v-if="!summary" class="text-body text-muted-foreground">
        <template v-if="points.length === 0">Tap the map to start a route. Tap a pin to start from a place.</template>
        <template v-else>Tap again to add the next stop.</template>
      </p>

      <template v-else>
        <div class="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div>
            <div class="text-label-lg text-muted-foreground">DISTANCE</div>
            <div class="text-heading-sm font-semibold text-foreground">{{ formatDistance(summary.distance, summary.unit) }}</div>
          </div>
          <div>
            <div class="text-label-lg text-muted-foreground">TRAVEL TIME</div>
            <div class="text-heading-sm font-semibold text-foreground">{{ formatTravelTime(summary.time) }}</div>
          </div>
        </div>
        <p v-if="routeNames" class="text-caption text-muted-foreground">{{ routeNames }}</p>
      </template>

      <div class="flex flex-col gap-1">
        <SegmentedControl v-model="paceId" :options="PACE_OPTIONS" size="sm" />
        <p class="text-caption text-muted-foreground">
          {{ paceNote }}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <AppButton variant="subtle" size="sm" :icon="IconUndo" label="Undo" :disabled="!points.length" @click="emit('undo')" />
        <AppButton variant="subtle" size="sm" :icon="IconEraser" label="Clear" :disabled="!points.length" @click="emit('clear')" />
        <AppButton
          class="ml-auto"
          variant="primary"
          size="sm"
          :icon="IconAddEvent"
          label="Add to calendar"
          :disabled="!summary"
          @click="eventOpen = true"
        />
      </div>
    </template>

    <!-- The travel event is the record of a trip; the route itself is not
         kept. Opens prefilled, and the DM can still edit everything. -->
    <EventModal v-model="eventOpen" :prefill="eventPrefill" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import EventModal from "@/components/calendar/EventModal.vue";
import { useParty } from "@/composables/party/useParty";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { IconAddEvent, IconClose, IconEraser, IconRuler, IconUndo } from "@/lib/icons";
import { routeDescription, routeEventPrefill, type RoutePoint, type RouteSummary } from "@/lib/locations/mapRoute";
import { formatDistance } from "@/lib/locations/mapScale";
import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import {
  formatTravelTime,
  fromMiles,
  getTravelPace,
  TRAVEL_HOURS_PER_DAY,
  TRAVEL_PACES,
  type TravelPaceId,
} from "@/rules/travelPace";
import { useCalendarStore } from "@/stores/calendar";
import { useCampaignStore } from "@/stores/campaign";
import type { MapScale } from "@/types/location.types";

const paceId = defineModel<TravelPaceId>("pace", { required: true });

const { scale, points, summary } = defineProps<{
  scale: MapScale | null;
  points: readonly RoutePoint[];
  summary: RouteSummary | null;
}>();

const emit = defineEmits<{ undo: []; clear: []; close: [] }>();

const PACE_OPTIONS = TRAVEL_PACES.map((p) => ({ value: p.id, label: p.label }));

const route = useRoute();
const router = useRouter();

/** Build is where the scale is set (`PlaceMapPinsEditor`). */
function openBuild() {
  void router.push({ query: { ...route.query, build: "true" } });
}

/** "Waterdeep to Daggerford", when the route's ends are places. */
const routeNames = computed(() => {
  if (!summary) return null;
  const { from, to } = summary;
  if (from && to) return `${from.name} to ${to.name}`;
  return from ? `From ${from.name}` : to ? `To ${to.name}` : null;
});

const { ruleset: tableRuleset } = useTableRuleset();

/** What the pace costs, in the map's unit, and the travel day it assumes. */
const paceNote = computed(() => {
  const pace = getTravelPace(paceId.value);
  const unit = scale?.unit ?? "mi";
  const perDay = formatDistance(fromMiles(pace.milesPerDay, unit), unit);
  // The effect is the one difference between the editions' pace rules.
  const words = pace.effect[tableRuleset.value];
  const effect = words ? ` ${words}` : "";
  return `${perDay} a day, ${TRAVEL_HOURS_PER_DAY} travel hours a day.${effect}`;
});

// ── Add to calendar ───────────────────────────────────────────────────────────
const eventOpen = ref(false);
const calendar = useCalendarStore();
const campaign = useCampaignStore();
const { data: party } = useParty();

/** The party members standing at the route's first place: they are the ones
 *  setting out. None when the route starts on open ground. */
const travelerIds = computed(() => {
  const originId = summary?.from?.id;
  const members = party.value;
  if (!originId || !members) return [];
  return members.filter((m) => m.current_location_id === originId).map((m) => m.id);
});

const eventPrefill = computed(() => {
  if (!summary) return undefined;
  const start = { year: campaign.todayYear, month: campaign.todayMonth, day: campaign.todayDay };
  return {
    ...routeEventPrefill(summary, start, calendar.adapter, travelerIds.value),
    description: toTiptapJson(routeDescription(summary)),
  };
});
</script>
