<template>
  <div class="flex flex-col gap-3">
    <!-- Tracing banner — browse mode only; run mode has nothing to trace. -->
    <div
      v-if="showRegions && !runMode && activeRegion"
      class="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5"
    >
      <span class="text-caption text-foreground">
        Tracing <strong>{{ activeRegionLabel }}</strong> — drag over cells below to add or remove them.
      </span>
      <AppButton variant="ghost" size="inline-xs" label="Done" @click="activeRegionId = null" />
    </div>

    <MapFrame
      ref="frameRef"
      :map-url="mapUrl"
      :compact="compact"
      :placing="!!placingChildId"
      @tap="onTap"
      @container-click="pinsLayerRef?.clearPinned()"
    >
      <!-- Regions render beneath pins: room shapes are a floor to stand on,
           pins are markers placed on top of it. -->
      <MapRegionsLayer
        v-if="showRegions && hasRegionContent"
        v-model:active-region-id="activeRegionId"
        :regions="regions"
        :calibration="calibration"
        :image-natural-width="frameRef?.imageNaturalWidth ?? 0"
        :image-natural-height="frameRef?.imageNaturalHeight ?? 0"
        :mode="runMode ? 'run' : 'browse'"
        :party-room-id="partyRoomId"
        :reachable-room-ids="reachableRoomIds"
        :to-image-fraction="toImageFraction"
        @move-party="emit('move-party', $event)"
      />
      <MapPinsLayer
        ref="pinsLayerRef"
        v-model:pins="pins"
        v-model:placing-child-id="placingChildId"
        :map-url="mapUrl"
        :children="children"
        :mode="mode"
        :show-hidden-pins="showHiddenPins"
        :offer-peek="offerPeek"
        :shared-child-ids="sharedChildIds"
        :scale="frameRef?.scale ?? 1"
        :to-image-fraction="toImageFraction"
        @pin-click="emit('pin-click', $event)"
        @pin-go="emit('pin-go', $event)"
        @pin-watch="emit('pin-watch', $event)"
      />
    </MapFrame>

    <!-- Edit mode: placing indicator or unplaced children -->
    <template v-if="mode === 'edit'">
      <div
        v-if="placingChildId"
        class="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/30"
      >
        <IconLocation class="h-3.5 w-3.5 text-primary shrink-0" />
        <span class="font-cinzel text-xs text-primary flex-1">
          Click the map to place
          <strong>{{ placingChildName }}</strong>
        </span>
        <AppButton
          variant="ghost"
          size="inline-xs"
          label="Cancel"
          @click="placingChildId = null"
        />
      </div>

      <div v-else-if="unplacedChildren.length" class="flex flex-wrap items-center gap-1.5">
        <span class="text-label-lg text-muted-foreground shrink-0">Unplaced:</span>
        <AppButton
          v-for="child in unplacedChildren"
          :key="child.id"
          variant="subtle"
          size="xs"
          class="gap-1.5 border-dashed"
          :title="child.parent_chain?.length ? `In ${child.parent_chain.join(' › ')}` : undefined"
          @click="placingChildId = child.id"
        >
          <span
            class="h-2 w-2 rounded-full shrink-0"
            :style="{ backgroundColor: LOCATION_TYPE_COLORS[child.location_type] }"
          />
          <span class="font-cinzel text-xs text-foreground">{{ child.name }}</span>
          <span
            v-if="child.parent_chain?.length"
            class="text-caption-sm text-muted-foreground italic"
          >
            · {{ child.parent_chain.join(" › ") }}
          </span>
        </AppButton>
      </div>
    </template>

    <!-- Site regions: calibration gate + the room-shapes list. Gated on
         presence (rooms or regions actually exist), not on tier — see
         `hasRegionContent`. -->
    <template v-if="showRegions && hasRegionContent">
      <div
        v-if="!calibration"
        class="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
      >
        <span class="text-caption text-muted-foreground">
          A grid has to be matched to this map before rooms can be traced on it.
        </span>
        <AppButton variant="primary" size="sm" label="Calibrate grid" @click="calibrationOpen = true" />
      </div>

      <!-- Editing-only, same as `LocationEditor`'s inline panels — run mode
           renders its own click-to-move room list instead (`SiteRunSurface`). -->
      <SiteMapRegionList
        v-if="!runMode"
        :location-id="locationId!"
        :rooms="rooms"
        :regions="regions"
        :active-region-id="activeRegionId"
        :can-trace="!!calibration"
        @update:active-region-id="activeRegionId = $event"
      />
    </template>

    <!-- Mounted unconditionally, same idiom as `LocationEditor.vue` — gated
         purely by `:open`, not by a v-if that would tear it down mid-flow. -->
    <GridCalibrationDialog
      v-if="showRegions"
      :open="calibrationOpen"
      :map-url="mapUrl"
      :existing="calibration"
      @cancel="calibrationOpen = false"
      @save="onCalibrationSave"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IconLocation } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import GridCalibrationDialog from "@/components/locations/GridCalibrationDialog.vue";
import MapFrame from "@/components/locations/MapFrame.vue";
import MapPinsLayer from "@/components/locations/MapPinsLayer.vue";
import MapRegionsLayer from "@/components/locations/MapRegionsLayer.vue";
import SiteMapRegionList from "@/components/locations/SiteMapRegionList.vue";
import { useUpdateLocationGridCalibration } from "@/composables/locations/useLocations";
import { useToast } from "@/composables/useToast";
import { LOCATION_TYPE_COLORS } from "@/types/location.types";
import type { GridCalibration, Location, LocationType, MapPin as MapPinType } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

const pins = defineModel<MapPinType[]>("pins", { required: true });
/** Which region is selected for tracing (browse mode) — lifted so the
 *  canvas (`MapRegionsLayer`) and the room-shapes list (`SiteMapRegionList`)
 *  below it, and the tracing banner above it, all agree on one answer. */
const activeRegionId = defineModel<string | null>("activeRegionId", { default: null });

const {
  mapUrl,
  children,
  mode,
  showHiddenPins = false,
  offerPeek = true,
  compact,
  sharedChildIds,
  locationId = null,
  showRegions = false,
  regions = [],
  rooms = [],
  calibration = null,
  runMode = false,
  partyRoomId = null,
  reachableRoomIds = null,
} = defineProps<{
  mapUrl: string;
  /** Candidate pin targets (edit mode: unplaced list + pin data population).
   *  Usually direct children, but callers can also pass descendants that were
   *  surfaced through vague container types (regions / continents / …) — in
   *  that case `parent_chain` names the intermediate containers for the
   *  unplaced-list breadcrumb. Rooms are never pin candidates (#807) —
   *  `getPinnableDescendants` already excludes them. */
  children: Array<{
    id: string;
    name: string;
    location_type: LocationType;
    image_url?: string | null;
    parent_chain?: string[];
  }>;
  mode: "edit" | "view";
  /** DM sees all pins; players only see visible_to_players ones (caller filters before passing). */
  showHiddenPins?: boolean;
  /** Cap map height at ~800px with scroll (useful for very tall portrait maps). */
  compact?: boolean;
  /** Player view only: IDs of child locations that are shared (gates the Go-there button). */
  sharedChildIds?: Set<string>;
  /** Offer the peek (Watch) action on a pin. Default true; off where
   *  travelling is already cheap (the Atlas explorer's own zoom). */
  offerPeek?: boolean;
  /** The location this map belongs to. Required whenever `showRegions` is
   *  true — it feeds the calibration mutation and `SiteMapRegionList`'s
   *  region-create calls. */
  locationId?: string | null;
  /** Whether this place has a floor plan (site tier — building, dungeon,
   *  store, tavern, inn, #810) and should render the regions layer, the
   *  calibration gate, and the room-shapes list alongside pins. */
  showRegions?: boolean;
  regions?: LocationMapRegion[];
  /** This site's `room`-typed direct children — for the region list and the
   *  tracing banner's room-name lookup. Only meaningful when `showRegions`. */
  rooms?: Location[];
  calibration?: GridCalibration | null;
  /** Regions interaction: browse (trace/select/navigate, default) or run
   *  (click-to-move-party, `SiteRunSurface`). Ignored when `!showRegions`. */
  runMode?: boolean;
  /** The room the party currently occupies. Only meaningful when `runMode`. */
  partyRoomId?: string | null;
  /** Rooms reachable from `partyRoomId`. Only meaningful when `runMode`. */
  reachableRoomIds?: ReadonlySet<string> | null;
}>();

const emit = defineEmits<{
  "pin-click": [childId: string];
  "pin-go": [childId: string];
  "pin-watch": [childId: string];
  "move-party": [roomId: string];
}>();

const frameRef = ref<InstanceType<typeof MapFrame> | null>(null);
const pinsLayerRef = ref<InstanceType<typeof MapPinsLayer> | null>(null);

// Lifted here (rather than kept inside the pins layer) because it also drives
// the frame's `placing` prop (skip pointer capture, crosshair cursor) — see
// `MapFrame.vue` — and the "click the map to place…"/unplaced-children chrome
// below, which sits below the frame rather than inside its transformed slot.
const placingChildId = ref<string | null>(null);

/**
 * The frame recognises a clean tap and hands back the pointerdown's original
 * target — see `MapFrame.vue`'s `tap` event. Only the pins layer knows what
 * `data-pin-id` means, so the lookup lives there; this wires the two
 * together and, when the layer consumed the tap, tells the frame to swallow
 * the synthetic click pointer capture still redirects here afterwards.
 *
 * `MapRegionsLayer` doesn't go through this — its own pointer tracking
 * survives the frame's capture via `window` listeners instead (see its own
 * docstring), so it needs nothing from `tap`.
 */
function onTap(target: EventTarget | null) {
  const handled = pinsLayerRef.value?.handleTap(target);
  if (handled) frameRef.value?.swallowClick();
}

/** Passed down to the pins layer and the regions layer so both share the
 *  frame's one implementation of client-coords → image-fraction. */
function toImageFraction(clientX: number, clientY: number): { x: number; y: number } | null {
  return frameRef.value?.toImageFraction(clientX, clientY) ?? null;
}

// ── Unplaced children (edit mode) ─────────────────────────────────────────────
const placedIds = computed(() => new Set(pins.value.map((p) => p.child_location_id)));
const unplacedChildren = computed(() =>
  children.filter((c) => !placedIds.value.has(c.id)),
);
const placingChildName = computed(
  () => children.find((c) => c.id === placingChildId.value)?.name ?? "",
);

// ── Site regions (#807) ──────────────────────────────────────────────────────
// Gated on presence, not on tier: #810 made every store/tavern/inn a
// `showRegions` candidate too, and most of them will never hold a single
// traced room. A room is added first, through the always-present Rooms
// panel (`SiteRoomsPanel`, unconditional on site tier) — so this apparatus
// stays out of the way until the DM has actually created one, and reveals
// itself the moment they do.
const hasRegionContent = computed(() => rooms.length > 0 || regions.length > 0);

const activeRegion = computed(() => regions.find((r) => r.id === activeRegionId.value) ?? null);
const activeRegionLabel = computed(() => {
  const region = activeRegion.value;
  if (!region) return "";
  if (region.room_location_id) return rooms.find((r) => r.id === region.room_location_id)?.name ?? "this room";
  return region.label || "this shape";
});

const calibrationOpen = ref(false);
const updateCalibration = useUpdateLocationGridCalibration();
const { error: toastError, fromError } = useToast();

async function onCalibrationSave(next: GridCalibration): Promise<void> {
  if (!locationId) return;
  try {
    await updateCalibration.mutateAsync({ id: locationId, calibration: next });
    calibrationOpen.value = false;
  } catch (e) {
    toastError(fromError(e));
  }
}
</script>
