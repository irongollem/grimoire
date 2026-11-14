<template>
  <!-- Below the map rather than over it (#932): the map is the thing being
       read, and on a phone a panel laid across it would hide the route. -->
  <section class="flex flex-col gap-2.5 rounded-md border border-border bg-card px-3 py-2.5" aria-label="Measure a route">
    <div class="flex items-center gap-2">
      <IconRuler class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <h3 class="flex-1 text-label-lg font-semibold text-muted-foreground">MEASURE A ROUTE</h3>
      <AppButton variant="ghost" size="icon-xs" :icon="IconClose" tooltip="Stop measuring (Esc)" @click="emit('close')" />
    </div>

    <!-- Nothing can be measured without a scale, so it is set right here: it is a fact about this picture, set by
         marking two points on it. -->
    <div v-if="!scale" class="flex flex-wrap items-center gap-2">
      <p class="min-w-0 flex-1 text-body text-muted-foreground">
        This map has no scale yet, so it cannot tell a distance.
      </p>
      <AppButton variant="outline" size="xs" label="Set scale" @click="scaleOpen = true" />
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

      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
        <span>
          Scale: <span class="font-semibold text-foreground">{{ formatDistance(scale.distance, scale.unit) }}</span>
          between the two marked points
        </span>
        <AppButton variant="ghost" size="inline-xs" label="Edit scale" @click="scaleOpen = true" />
      </div>

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

    <MapScaleDialog
      :open="scaleOpen"
      :map-url="mapUrl"
      :stand-url="standUrl"
      :existing="scale"
      :saving="isSavingScale"
      @cancel="scaleOpen = false"
      @save="saveScale"
      @clear="saveScale(null)"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import EventModal from "@/components/calendar/EventModal.vue";
import MapScaleDialog from "@/components/locations/map/MapScaleDialog.vue";
import { useUpdateLocationMapScale } from "@/composables/locations/useLocations";
import { useToast } from "@/composables/useToast";
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
import { gameSystemEdition } from "@/systems/registry";
import { useCalendarStore } from "@/stores/calendar";
import { useCampaignStore } from "@/stores/campaign";
import type { MapScale } from "@/types/location.types";

const paceId = defineModel<TravelPaceId>("pace", { required: true });

const { locationId, scale, points, summary, mapUrl, standUrl = null } = defineProps<{
  /** The place whose map is measured: whose scale is written. */
  locationId: string;
  /** The picture the scale is marked on, and a Drawing's standing half drawn over it. */
  mapUrl: string | null;
  standUrl?: string | null;
  scale: MapScale | null;
  points: readonly RoutePoint[];
  summary: RouteSummary | null;
}>();

const emit = defineEmits<{ undo: []; clear: []; close: [] }>();

const PACE_OPTIONS = TRAVEL_PACES.map((p) => ({ value: p.id, label: p.label }));

const campaign = useCampaignStore();
const toast = useToast();

// ── The scale (#932), written live like the pins: there is no Save. ──────────
const scaleOpen = ref(false);
const { mutateAsync: updateScale, isPending: isSavingScale } = useUpdateLocationMapScale();

async function saveScale(next: MapScale | null) {
  try {
    await updateScale({ id: locationId, scale: next });
    scaleOpen.value = false;
  } catch (e) {
    toast.error(toast.fromError(e));
  }
}

/** "Waterdeep to Daggerford", when the route's ends are places. */
const routeNames = computed(() => {
  if (!summary) return null;
  const { from, to } = summary;
  if (from && to) return `${from.name} to ${to.name}`;
  return from ? `From ${from.name}` : to ? `To ${to.name}` : null;
});

const { ruleset: tableRuleset } = useTableRuleset();
const hasEdition = computed(() => gameSystemEdition(campaign.activeGameSystem) !== undefined);

/** What the pace costs, in the map's unit, and the travel day it assumes. */
const paceNote = computed(() => {
  const pace = getTravelPace(paceId.value);
  const unit = scale?.unit ?? "mi";
  const perDay = formatDistance(fromMiles(pace.milesPerDay, unit), unit);
  // The effect is the one difference between the editions' pace rules.
  // A system with no 5e edition has no pace effect to quote (#934): `tableRuleset`
  // falls back to 2014 there, so it is not read.
  const words = hasEdition.value ? pace.effect[tableRuleset.value] : undefined;
  const effect = words ? ` ${words}` : "";
  return `${perDay} a day, ${TRAVEL_HOURS_PER_DAY} travel hours a day.${effect}`;
});

// ── Add to calendar ───────────────────────────────────────────────────────────
const eventOpen = ref(false);
const calendar = useCalendarStore();
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
