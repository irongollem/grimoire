<template>
  <div class="flex flex-col gap-3">
    <!-- A place's map as it is read (#1125, frames 03 and 04). Changing the
         map is the gilt Edit map button, which leaves for the full-screen
         editor and comes back to this tab. -->
    <!-- "<site> › Level N · <name> [chip]" (#868, frame 06) — the stairs
         chip travels with the level it counts, in the same trail row, rather
         than as a standalone line the map otherwise has to make room for. -->
    <div v-if="showLevelsRail" class="flex items-center gap-1.5 text-caption text-muted-foreground">
      <span class="truncate">{{ levelsContainer?.name }}</span>
      <IconChevronRight class="h-3 w-3 shrink-0 text-muted-foreground/50" />
      <span class="truncate font-semibold text-foreground">Level {{ currentLevelOrdinal }} · {{ location.name }}</span>
      <span class="ml-1 flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-label text-muted-foreground">
        <IconStairs class="h-3 w-3 shrink-0" aria-hidden="true" />
        {{ verticalWaysCount }} stair{{ verticalWaysCount === 1 ? "" : "s" }} down
      </span>
    </div>

    <div class="flex items-start gap-3">
      <!-- "A level is a sibling site" (#868, frame 06) — assigned by the
           DM (`is_level`, migration `20260928195128`), read off this
           site's own children, or its parent's when this place IS one of
           them. -->
      <SiteLevelsColumn
        v-if="showLevelsRail"
        :location="location"
        :index="index"
        :children="children"
        @select="onLevelSelect"
      />

      <!-- The parent mounts this component once `hasMap` holds, so a layer
           exists here; the guard stays because `LocationMap` needs a real
           stack to draw. -->
      <div v-if="mapStack.hasAnyLayer" class="relative min-w-0 flex-1">
        <LocationMap
          ref="mapRef"
          :stack="mapStack"
          :pins="location.map_pins"
          :children="children"
          mode="view"
          show-hidden-pins
          compact
          :offer-peek="false"
          :show-regions="isSite"
          :regions="siteRegions"
          :spaces="siteSpaces"
          :show-layer-bar="false"
          :measuring="measure.measuring.value"
          :route-points="measure.points.value"
          @measure-point="measure.addPoint"
          @pin-click="descendTo"
          @pin-go="descendTo"
          @pin-watch="descendTo"
          @descend="onRegionClick"
        >
          <!--
            Up one level, in the map's own idiom. Rendered through this
            slot rather than as a sibling of `LocationMap` — a sibling
            positions against the whole component's box, which since
            #868's layer bar/tracing banner started rendering above the
            frame is no longer the same box as the map itself.
          -->
          <template #frame-overlay>
            <AppButton
              v-if="ascendTarget && !zoomPlan"
              variant="subtle"
              size="xs"
              class="absolute top-2 left-2 z-30 max-w-56 bg-background/85 backdrop-blur-sm"
              :icon="IconChevronUp"
              :label="`Up to ${ascendTarget.name}`"
              @click="ascend"
            />
            <div v-if="!zoomPlan" class="absolute top-2 right-2 z-30 flex items-center gap-1.5">
              <!-- Measure (#932): places with pins only. A site is measured in
                   feet on its own grid, not miles on a scaled map. -->
              <AppButton
                v-if="!isSite"
                variant="subtle"
                size="xs"
                class="bg-background/85 backdrop-blur-sm"
                :icon="IconRuler"
                :active="measure.measuring.value"
                label="Measure"
                @click="measure.toggle()"
              />
              <!-- The one way into changing the map (#1125, frames 03 and 04). -->
              <AppButton variant="primary" size="xs" :icon="IconEdit" label="Edit map" @click="editMap" />
            </div>
          </template>

          <template #aside>
            <SiteWaysOutPanel :site-id="location.id" :spaces="siteSpaces" />
          </template>
        </LocationMap>

        <!-- Clicking a room opens its card; the dive into the room is the
             card's own button (#1125, frame 03). -->
        <SiteRoomCard
          v-if="openRoom"
          :key="openRoom.id"
          class="mt-3"
          :room="openRoom"
          @open="onOpenRoom"
          @close="openRoomId = null"
        />

        <MapMeasurePanel
          v-if="measure.measuring.value && !isSite"
          v-model:pace="measure.paceId.value"
          :location-id="location.id"
          class="mt-3"
          :scale="measureScale"
          :points="measure.points.value"
          :summary="measure.summary.value"
          @undo="measure.undo()"
          @clear="measure.clear()"
          @close="measure.stop()"
        />

        <AtlasMapZoom
          v-if="zoomPlan"
          :plan="zoomPlan"
          :settling="zoomSettling"
          compact
          @done="finishDescent"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The Atlas pane's map mode (#868, S6) — split out of `AtlasPlacePane.vue`
 * once that file's template pushed past the 300-line soft max. Everything
 * here is specific to *looking at a place's drawing*: the trail line naming
 * the level being viewed, the map itself with its
 * up-one-level overlay and Ways-out aside, and the zoom transition between
 * two maps. The levels sidebar itself (rail, vertical ways-out, reuse panel)
 * moved to `SiteLevelsColumn` (#868, S5b) so a second caller could mount the
 * same sidebar beside its own map — originally the old full-page sheet,
 * removed 25 Sep 2026, and the split stays worth keeping regardless: this
 * file keeps its own copy of the level/container computeds only because the
 * trail line above needs them too, and they're cheap synchronous
 * derivations off the `index` this component already has. `AtlasPlacePane`
 * keeps identity, the Contents/Map toggle row, and Contents mode — the
 * parts that render whether or not this place has a map at all. Editing the
 * map is not here: its Edit map button leaves for `PlaceMapEditorView` (#1125).
 *
 * Two distinct outward events rather than one: `select` is an ordinary
 * jump (a sibling level in the rail, or landing after an ascend/pin
 * animation with nothing to zoom); `descend` is specifically the arrival
 * from a region click on the map (`LocationMap`'s own `@descend`) — the one
 * path that started from a shape the DM clicked rather than a list item.
 * `AtlasPlacePane` currently treats both the same way, but the distinction
 * is real at the point each event is emitted, and cheap to keep honest.
 */
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import AtlasMapZoom from "@/components/locations/atlas/AtlasMapZoom.vue";
import LocationMap from "@/components/locations/map/LocationMap.vue";
import SiteLevelsColumn from "@/components/locations/site/SiteLevelsColumn.vue";
import MapMeasurePanel from "@/components/locations/map/MapMeasurePanel.vue";
import SiteRoomCard from "@/components/locations/site/SiteRoomCard.vue";
import SiteWaysOutPanel from "@/components/locations/site/SiteWaysOutPanel.vue";
import { useLocation } from "@/composables/locations/useLocations";
import { useMapMeasure } from "@/composables/locations/useMapMeasure";
import { useLocationMapRegions } from "@/composables/locations/useLocationMapRegions";
import { useSiteStructure } from "@/composables/locations/useSiteStructure";
import { IconChevronRight, IconChevronUp, IconEdit, IconRuler, IconStairs } from "@/lib/icons";
import { verticalWays } from "@/lib/locations/doors";
import { levelOrdinal, levelsOf } from "@/lib/locations/levels";
import { parseMapScale } from "@/lib/locations/mapScale";
import { buildMapStack } from "@/lib/locations/mapStack";
import { mapEditorRoute, type MapEditorLayer } from "@/lib/locations/placeRoute";
import { planAscent, planDescent, regionOrigin } from "@/lib/locations/mapZoom";
import type { ZoomPlan } from "@/lib/locations/mapZoom";
import { bindableSpaces, isSiteType } from "@/lib/locations/tiers";
import type { AtlasIndex } from "@/lib/locations/tree";
import type { Location, LocationSummary } from "@/types/location.types";

const { location, index, children } = defineProps<{
  /** Only ever mounted once the caller has confirmed `hasMap` — never null. */
  location: Location;
  index: AtlasIndex;
  children: LocationSummary[];
}>();

const emit = defineEmits<{ select: [id: string]; descend: [id: string] }>();

// The map component itself (#868, S6) — only for reading the loaded image's
// natural size when a region-click descent needs to anchor on the region's
// own centroid rather than a pin.
const mapRef = useTemplateRef<InstanceType<typeof LocationMap>>("mapRef");

const isSite = computed(() => isSiteType(location.location_type));

// ── Measure (#932) — a route drawn between pins on a scaled map. Scratch state:
//    leaving the tool, the place or Browse drops it; the travel event the DM
//    writes from it is the record. ─────────────────────────────────────────────
const measureScale = computed(() => parseMapScale(location.map_scale));
const measure = useMapMeasure({
  scale: measureScale,
  size: () => {
    const size = mapRef.value?.getImageNaturalSize();
    return size && size.width > 0 && size.height > 0 ? size : null;
  },
});
watch(() => location.id, measure.stop);

// ── Edit map (#1125) — the full-screen editor, which opens on the layer this
//    place's map is mostly made of. ───────────────────────────────────────────
const router = useRouter();
const editorLayer = computed<MapEditorLayer>(() => {
  if (!isSite.value) return "picture";
  if (mapStack.value.drawing) return "drawing";
  return mapStack.value.picture ? "picture" : "plan";
});
function editMap(): void {
  void router.push(mapEditorRoute(location.id, editorLayer.value));
}

// ── Site regions (#807) — gated to site-tier places the same way the parent
//    gates `useSiteStructure` below, so a plain map (a region/world drawing)
//    never queries a table it has no rows in. ────────────────────────────────
const siteRegionsQuery = useLocationMapRegions(computed(() => (isSite.value ? location.id : "")));
const siteRegions = computed(() => siteRegionsQuery.data.value ?? []);
// See AtlasPlacePane's own copy: a room, or a nested site that occupies part of this map.
const siteSpaces = computed(() => bindableSpaces(children));

// ── The map stack (#884) — Picture, Drawing, and/or a blank grid. ──────────
const mapStack = computed(() => buildMapStack(location));

// ── Door graph (#868, S6) — the vertical-ways count in the trail line. ─────────
const siteStructureLocation = computed(() => (isSite.value ? location : null));
const siteStructure = useSiteStructure(siteStructureLocation);
const { doors: siteStructureDoors } = siteStructure;

// ── The room card (#1125, frame 03): a region click opens the card of the room
//    or nested site it is bound to; "Open the room" there is the descent. ──────
const openRoomId = ref<string | null>(null);
const openRoom = computed(() => siteSpaces.value.find((s) => s.id === openRoomId.value) ?? null);
watch(() => location.id, () => { openRoomId.value = null; });

function onRegionClick(spaceId: string): void {
  openRoomId.value = spaceId;
}

function onOpenRoom(spaceId: string): void {
  openRoomId.value = null;
  onDescendRegion(spaceId);
}

// ── Moving between maps ───────────────────────────────────────────────────────
const zoomPlan = ref<ZoomPlan | null>(null);
const zoomSettling = ref(false);
let settleTimer: ReturnType<typeof setTimeout> | undefined;

/** The parent's full row: the ascent anchors on the parent's pin for this
 *  place, and `map_pins` is not on the slim list (#972). Read by id, once. */
const { data: parentRow } = useLocation(() => location.parent_id);

/** The parent, when rising to it can be animated. Drives the ascend control. */
const ascendTarget = computed(() => {
  const parent = parentRow.value;
  return parent && planAscent(location, parent) ? parent : null;
});

// Which outward event a landing zoom (or its no-animation fallback) fires —
// set right before the zoom starts, since `start`/`finishDescent` are shared
// by every trigger (pins, rail, ascend, region clicks) and only the caller
// knows which one this is. A small `switch` rather than `emit(kind, id)`
// directly: `defineEmits`'s overloads each pin one literal event name, so a
// union-typed variable can't satisfy either of them at once.
type LandingEvent = "select" | "descend";
let landingEvent: LandingEvent = "select";

function fireLanding(kind: LandingEvent, id: string) {
  if (kind === "select") emit("select", id);
  else emit("descend", id);
}

/**
 * The pin's "watch" action, and the rail's "descend into my own child level"
 * branch. When both this place and the child have a map, the move is
 * animated as a continued zoom — the thing an atlas actually does — and the
 * selection is deferred until the motion lands. Otherwise it is an ordinary
 * selection, which is also what happens under reduced motion.
 */
function descendTo(childId: string) {
  start(planDescent(location, index.byId.get(childId)), childId, "select");
}

/**
 * "Click 7. The Drowned Stair to descend — the same zoom a pin gives, drawn
 * as a polygon" (#868, frame 06). `LocationMap` emits `descend` when a bound
 * region is clicked; this anchors the zoom on the REGION's own centroid
 * rather than the pin-anchor rule `descendTo` uses, so the transition zooms
 * toward the shape the DM actually clicked. Falls back to the ordinary
 * pin-anchored descent when the click can't be tied to a traced, calibrated
 * region — a bound room with no cells yet, or a site with no calibration.
 */
function onDescendRegion(spaceId: string) {
  const region = siteRegions.value.find((r) => r.space_location_id === spaceId && r.cells.length > 0);
  const calibration = mapStack.value.frameCalibration;
  if (region && calibration) {
    const size = mapRef.value?.getImageNaturalSize() ?? { width: 0, height: 0 };
    const origin = regionOrigin(region.cells, calibration, size.width, size.height);
    start(planDescent(location, index.byId.get(spaceId), origin), spaceId, "descend");
    return;
  }
  descendTo(spaceId);
}

function ascend() {
  const parent = ascendTarget.value;
  if (parent) start(planAscent(location, parent), parent.id, "select");
}

function start(plan: ZoomPlan | null, fallbackId: string, kind: LandingEvent) {
  landingEvent = kind;
  if (!plan) {
    fireLanding(kind, fallbackId);
    return;
  }
  zoomSettling.value = false;
  zoomPlan.value = plan;
}

/**
 * The motion has landed. Select — but leave the overlay up.
 *
 * Tearing it down here is what produced the jitter: the selection travels
 * through the router, so for a frame or two the *previous* map is still what is
 * mounted underneath, and it flashes through before the destination renders.
 */
function finishDescent() {
  if (zoomPlan.value) fireLanding(landingEvent, zoomPlan.value.targetId);
}

/**
 * Retire the overlay once the destination is genuinely mounted beneath it, and
 * fade rather than cut — two maps of different aspect ratios do not occupy the
 * same box, so the last frame of the animation and the first frame of the real
 * map are never pixel-identical. A short fade covers that; a cut shows it.
 */
watch(
  () => location.id,
  (id) => {
    const plan = zoomPlan.value;
    if (!plan) return;
    if (id !== plan.targetId) {
      // Navigated somewhere else mid-flight (tree, breadcrumb, Back) — drop it.
      clearZoom();
      return;
    }
    zoomSettling.value = true;
    settleTimer = setTimeout(clearZoom, 220);
  },
);

function clearZoom() {
  clearTimeout(settleTimer);
  zoomPlan.value = null;
  zoomSettling.value = false;
}

onBeforeUnmount(clearZoom);

// ── Levels (#868, frame 06; migration `20260928195128`) — "not a new
//    table: it lists this site's children the DM has flagged `is_level`,
//    ordered by `sort_order`." A level's number must be the same no matter
//    which level's page it is read from — S is 1, A is 2, B is 3, whether
//    the DM is looking at S, A, or B — so the list is always anchored on the
//    container (the site that HAS the levels), never on whichever end
//    `location` happens to be: viewing S, the container is S itself; viewing
//    A or B, `levelsOf` resolves the same container (S) via `parent_id` and
//    returns the identical list. Before this, the two branches disagreed —
//    the child branch listed the parent's children WITHOUT the parent, so
//    the DM saw "Level 2 · A" from S's page and "Level 1 · A" one click
//    later, on A's own. `levelsOf` is shared with `SiteLevelsColumn` and
//    `AtlasPlacePane` so all three surfaces agree. Built entirely off the
//    already-loaded `index` — no query of its own beyond the room-state
//    batch below. ──────────────────────────────────────────────────────────
const levelsInfo = computed(() => levelsOf(index, location));

/** Whose children the rail is listing — this site's own, or its parent's. */
const levelsContainer = computed<LocationSummary | null>(() => levelsInfo.value?.container ?? null);

const levelSites = computed<LocationSummary[]>(() => levelsInfo.value?.levels ?? []);

const showLevelsRail = computed(() => levelSites.value.length > 0);

const currentLevelOrdinal = computed(() =>
  levelsInfo.value ? levelOrdinal(levelsInfo.value.levels, location.id) : null,
);

/** "2 stairs down" trail chip — every vertical way out this site itself has,
 *  from the same door graph the Ways out panel already reads. */
const verticalWaysCount = computed(() => verticalWays(siteStructureDoors.value).length);

function onLevelSelect(id: string) {
  if (id === location.id) return; // already here — the rail's own active row
  // Our own children — the same zoom a pin gives, per the frame's own words.
  // (`levelsContainer` is `location` itself exactly when it has its own
  // `is_level` children — see `levelsOf`.)
  if (levelsContainer.value?.id === location.id) descendTo(id);
  // A sibling level: a plain selection, not a descent between two maps that
  // don't stand in a parent/child relationship to each other.
  else emit("select", id);
}
</script>
