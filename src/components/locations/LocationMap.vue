<template>
  <div class="flex flex-col gap-3">
    <!-- Layer bar (#868, frame 03) — browse mode only; run mode keeps its
         own chrome (the click-to-move room list, not this toolbar).
         `showLayerBar` lets a caller that renders its own copy elsewhere
         (the Atlas pane's Contents/Map row, S6) suppress this one instead of
         showing it twice. -->
    <SiteMapLayerBar
      v-if="showRegions && hasRegionContent && !runMode && showLayerBar"
      :counts="layerCounts"
    />

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

    <!--
      Frame 03 "Map mode, for a site": the map (with its legend underneath)
      on the left, a 340px column of the space/zone lists — and whatever a
      caller adds via #aside (S6: SiteWaysOutPanel) — to its right, from `lg`
      up. Below `lg` there is no room for a side column, so everything stacks
      exactly as it always has.
    -->
    <div class="flex flex-col gap-3 lg:flex-row lg:items-start">
      <div class="flex min-w-0 flex-1 flex-col gap-3">
        <div class="relative">
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
              :show-spaces="siteMapLayers.spaces"
              :show-zones="siteMapLayers.zones"
              :show-grid="siteMapLayers.grid"
              :ways="siteDoors ?? []"
              :nested-site-ids="nestedSiteIds"
              @move-party="emit('move-party', $event)"
              @descend="emit('descend', $event)"
              @hover-region="emit('hover-region', $event)"
            />
            <!-- Prepared marks sit above regions/doors, below pins — a token
                 on the floor, not a pin above the whole map (#868, S8). -->
            <MapPreparedLayer
              v-if="showRegions && siteMapLayers.prepared"
              :marks="preparedMarks"
              :calibration="calibration"
              :image-natural-width="frameRef?.imageNaturalWidth ?? 0"
              :image-natural-height="frameRef?.imageNaturalHeight ?? 0"
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

          <!-- Calibration chip (#868, frame 03) — a HUD overlay, not part of
               MapFrame's own zoomed slot, so it stays put while the map pans. -->
          <div v-if="showRegions && hasRegionContent && calibration" class="pointer-events-none absolute right-2 top-2 z-20">
            <span
              class="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-card/90 px-2.5 py-1 text-caption-sm text-muted-foreground shadow-sm backdrop-blur-sm"
            >
              <IconRuler class="h-3 w-3 shrink-0" aria-hidden="true" />
              {{ calibration.cells_per_image_width }} cells · 5 ft · origin {{ originCell(calibration).x }},{{ originCell(calibration).y }}
            </span>
          </div>

          <!--
            A caller that needs to overlay something fixed to the map's OWN
            box — the Atlas pane's "Up to <parent>" control (S6) — renders it
            here rather than as a sibling of this whole component. Sibling
            positioning is what put that control over the layer bar/tracing
            banner once this component started rendering chrome above the
            frame: this slot sits exactly where the calibration chip does, so
            it tracks the map regardless of what renders above it.
          -->
          <slot name="frame-overlay" />
        </div>

        <SiteMapLegend
          v-if="showRegions && hasRegionContent && !runMode"
          :show-prepared="siteMapLayers.prepared"
          :prepared-counts="preparedCounts"
        />
      </div>

      <!-- Editing-only, same as `LocationEditor`'s inline panels — run mode
           renders its own click-to-move room list instead (`SiteRunSurface`),
           which needs no side column. -->
      <div
        v-if="showRegions && hasRegionContent && !runMode"
        class="flex w-full flex-col gap-3 lg:w-85 lg:shrink-0"
      >
        <SiteMapRegionList
          :location-id="locationId!"
          :spaces="spaces"
          :regions="regions"
          :active-region-id="activeRegionId"
          :can-trace="!!calibration"
          @update:active-region-id="activeRegionId = $event"
        />
        <SiteMapZoneList
          :location-id="locationId!"
          :regions="regions"
          :active-region-id="activeRegionId"
          :can-trace="!!calibration"
          @update:active-region-id="activeRegionId = $event"
        />
        <!-- S6: SiteWaysOutPanel mounts here via a caller's #aside content. -->
        <slot name="aside" />
      </div>
    </div>

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

    <!-- Site regions: calibration gate, ahead of anything that needs the
         grid to exist. The room-shapes/zone lists themselves moved into the
         `lg` side column above — this is the one thing that stayed put. -->
    <div
      v-if="showRegions && hasRegionContent && !calibration"
      class="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
    >
      <span class="text-caption text-muted-foreground">
        A grid has to be matched to this map before spaces can be traced on it.
      </span>
      <AppButton variant="primary" size="sm" label="Calibrate grid" @click="calibrationOpen = true" />
    </div>

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
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { IconLocation, IconRuler } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import GridCalibrationDialog from "@/components/locations/GridCalibrationDialog.vue";
import MapFrame from "@/components/locations/MapFrame.vue";
import MapPinsLayer from "@/components/locations/MapPinsLayer.vue";
import MapRegionsLayer from "@/components/locations/MapRegionsLayer.vue";
import SiteMapLayerBar from "@/components/locations/SiteMapLayerBar.vue";
import SiteMapLegend from "@/components/locations/SiteMapLegend.vue";
import SiteMapRegionList from "@/components/locations/SiteMapRegionList.vue";
import SiteMapZoneList from "@/components/locations/SiteMapZoneList.vue";
import MapPreparedLayer from "@/components/locations/MapPreparedLayer.vue";
import { useUpdateLocationGridCalibration } from "@/composables/locations/useLocations";
import { useSiteDoors } from "@/composables/locations/useSiteDoors";
import { useSitePrepared } from "@/composables/locations/useSitePrepared";
import { useToast } from "@/composables/useToast";
import { isSiteType } from "@/lib/locations/tiers";
import { useUiStore } from "@/stores/ui";
import { LOCATION_TYPE_COLORS } from "@/types/location.types";
import type { GridCalibration, LocationType, MapPin as MapPinType } from "@/types/location.types";
import type { BindableSpace, LocationMapRegion } from "@/types/locationMapRegion.types";

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
  spaces = [],
  calibration = null,
  runMode = false,
  partyRoomId = null,
  reachableRoomIds = null,
  showLayerBar = true,
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
  /** The direct children that can carry a shape on this map — a room, or a
   *  nested site (#818). Callers build it with `bindableSpaces()`. Used by the
   *  region list and the tracing banner's name lookup. Only meaningful when
   *  `showRegions`.
   *
   *  `location_type` is optional rather than added to `BindableSpace` itself
   *  (a shared type this story doesn't own): every existing caller already
   *  passes it through, since `bindableSpaces()` is generic over whatever
   *  shape `children` carries and every `children` array already has it —
   *  this only widens what the prop *accepts*, so nothing upstream changes. */
  spaces?: Array<BindableSpace & { location_type?: LocationType }>;
  calibration?: GridCalibration | null;
  /** Regions interaction: browse (trace/select/navigate, default) or run
   *  (click-to-move-party, `SiteRunSurface`). Ignored when `!showRegions`. */
  runMode?: boolean;
  /** The room the party currently occupies. Only meaningful when `runMode`. */
  partyRoomId?: string | null;
  /** Rooms reachable from `partyRoomId`. Only meaningful when `runMode`. */
  reachableRoomIds?: ReadonlySet<string> | null;
  /** Render this component's own `SiteMapLayerBar` above the frame. A caller
   *  that mounts its own copy elsewhere — the Atlas pane's Contents/Map row
   *  (S6), so its "Up to <parent>" overlay doesn't collide with a bar
   *  rendered inside this component — passes `false` and reads `layerCounts`
   *  off the `layer-counts` emit instead. Default true so every other caller
   *  (the sheet, the run surface) is unaffected. */
  showLayerBar?: boolean;
}>();

const emit = defineEmits<{
  "pin-click": [childId: string];
  "pin-go": [childId: string];
  "pin-watch": [childId: string];
  "move-party": [roomId: string];
  /** Relayed from `MapRegionsLayer` — a bound space clicked on the map is a
   *  nested site, not a room. Forwarded rather than handled here: whether
   *  "descend" means an Atlas re-centre or a route push is the caller's
   *  call, the same way it already decides what a pin click means. */
  descend: [spaceId: string];
  /** Relayed from `MapRegionsLayer` — see its own docstring. */
  "hover-region": [regionId: string | null];
  /** The pill counts this component would show its own layer bar, whether or
   *  not `showLayerBar` is actually rendering one — so a caller suppressing
   *  it (S6) can still read the numbers without re-deriving them. */
  "layer-counts": [counts: { spaces: number; ways: number; zones: number; prepared: number }];
}>();

const uiStore = useUiStore();
const { siteMapLayers } = storeToRefs(uiStore);

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
const hasRegionContent = computed(() => spaces.length > 0 || regions.length > 0);

const activeRegion = computed(() => regions.find((r) => r.id === activeRegionId.value) ?? null);
const activeRegionLabel = computed(() => {
  const region = activeRegion.value;
  if (!region) return "";
  if (region.space_location_id) return spaces.find((sp) => sp.id === region.space_location_id)?.name ?? "this space";
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

// ── Zones + layer bar (#868) ──────────────────────────────────────────────────

/** Bound spaces that are themselves a nested site (#818), so `MapRegionsLayer`
 *  can emit `descend` instead of pushing a route for them — the map-click
 *  twin of the pin layer's existing descend-vs-navigate split. */
const nestedSiteIds = computed(
  () => new Set(spaces.filter((s) => s.location_type && isSiteType(s.location_type)).map((s) => s.id)),
);

// ── Doors drawn on the map + Prepared layer (#868, S8) ────────────────────────
//
// Both read the same `spaceIds` `MapRegionsLayer`'s own bindable-space props
// already imply — fetched here rather than passed in from a caller, the same
// call this component already makes for its own calibration mutation, so
// `SiteWaysOutPanel`'s side list (fed from outside, via `#aside`) and this
// component's own bars/legend never need to agree on a shared prop shape.
const spaceIds = computed(() => spaces.map((s) => s.id));
const { data: siteDoors } = useSiteDoors(spaceIds);
const { marks: preparedMarks, counts: preparedCounts } = useSitePrepared(
  spaceIds,
  computed(() => regions),
);

/** Feeds `SiteMapLayerBar`'s pill counts. Both `ways` and `prepared` now read
 *  real data (#868 S8) — the placeholder comment this replaced predates
 *  `useSiteDoors`/`useSitePrepared` existing at all. */
const layerCounts = computed(() => ({
  spaces: spaces.length,
  ways: siteDoors.value?.length ?? 0,
  zones: regions.filter((r) => r.region_role === "zone").length,
  prepared: preparedMarks.value.length,
}));

// Re-emitted whenever it changes so a caller suppressing `showLayerBar` (S6)
// can still read the numbers without a second implementation of "how many
// spaces/zones does this site have".
watch(layerCounts, (counts) => emit("layer-counts", counts), { immediate: true });

/** `origin_cell_x/y` default to (0, 0) per `GridCalibration`'s documented
 *  default (`resolveOriginCell` in `gridCalibration.ts`, a file this story
 *  doesn't own and can't add an export to) — mirrored locally rather than
 *  reaching into it, purely for the calibration chip's read-out. */
function originCell(cal: GridCalibration): { x: number; y: number } {
  return { x: cal.origin_cell_x ?? 0, y: cal.origin_cell_y ?? 0 };
}

// A caller descending into a REGION rather than a pin (#868, S6) needs the
// loaded image's natural size to turn the region's cells into an anchor
// point (`regionOrigin` in `mapZoom.ts`) — the same numbers `MapFrame`
// already tracks for its own overlays, exposed here so that caller doesn't
// have to mount a second `<img>` just to measure one.
defineExpose({
  getImageNaturalSize: () => ({
    width: frameRef.value?.imageNaturalWidth ?? 0,
    height: frameRef.value?.imageNaturalHeight ?? 0,
  }),
});
</script>
