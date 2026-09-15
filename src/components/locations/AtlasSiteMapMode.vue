<template>
  <div class="flex flex-col gap-3">
    <!-- The Layers panel (#884, S5) — what this site's map is made of.
         Build-only: every action here edits the stack, and Browse has
         nothing here to edit. Its Drawing row now says everything
         `SiteMapSourceStrip` used to (name, rev, staleness) — that strip is
         retired app-wide as of this story, so this is the only surface
         reporting it. -->
    <SiteMapLayersPanel
      v-if="isSite && building"
      :location="location"
      :map="siteSourceMap"
      :staleness="siteStaleness"
      :counts="siteLayerCounts"
      @open-drawing="onOpenDrawing"
      @review-changes="onReviewChanges"
    />

    <!-- Build mode (#884 S11): the workbench IS the Build map area — the
         Cartographer, embedded, with its Plan palette tracing this site's
         spaces/zones/doors directly, on the site's own Drawing or a blank
         grid alike (`map` is null until one exists; the Plan needs no
         image under it at all — see MapWorkbench's own docblock). Folds the
         levels rail/column so the workbench gets the pane's full width,
         same as Map mode already folds the Atlas tree. -->
    <div v-if="building" class="relative min-w-0 flex-1">
      <MapWorkbench
        ref="drawingWorkbenchRef"
        :map="siteSourceMap ?? null"
        :view-mode="false"
        :site="location"
        :spaces="siteSpaces"
        @update:dirty="drawingEditor.onDirtyChange"
        @update:edit-revision="drawingEditor.onEditRevision"
      />
    </div>

    <template v-else>
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
        <!-- "A level is a sibling site" (#868, frame 06) — not a new table,
             just this site's own child sites, or its parent's when this
             place IS one of them. -->
        <SiteLevelsColumn
          v-if="showLevelsRail"
          :location="location"
          :children="children"
          @select="onLevelSelect"
        />

        <!-- Nothing to render below a site with zero layers (#884, S5) — the
             Layers panel above is the whole story in that case (Build only);
             `LocationMap` needs a real stack to draw. Never gates a non-site
             place: the parent only ever mounts this component once `hasMap`
             already holds, so `mapStack.hasAnyLayer` is guaranteed true there. -->
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
            :location-id="location.id"
            :show-regions="isSite"
            :regions="siteRegions"
            :spaces="siteSpaces"
            :show-layer-bar="false"
            @pin-click="descendTo"
            @pin-go="descendTo"
            @pin-watch="descendTo"
            @descend="onDescendRegion"
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
            </template>

            <template #aside>
              <SiteWaysOutPanel :site-id="location.id" :spaces="siteSpaces" />
            </template>
          </LocationMap>

          <AtlasMapZoom
            v-if="zoomPlan"
            :plan="zoomPlan"
            :settling="zoomSettling"
            compact
            @done="finishDescent"
          />
        </div>
      </div>
    </template>

    <!-- The embedded workbench's own Publish (#884 S11) — "Review N changes"
         on the Layers panel above opens this in place, replacing the old
         `/cartographer/:id?publishTo=` round trip. Mounted unconditionally
         (like the Plan/drawing composables it reads), gated purely by
         `:model-value`, so it never tears down mid-flow. -->
    <CartographerPublishModal
      v-if="isSite"
      v-model="mapPublish.open.value"
      v-model:target-site-id="mapPublish.targetSiteId.value"
      :site-context="mapPublish.siteContext.value"
      :stair-targets="mapPublish.stairTargets.value"
      :review="mapPublish.review.value"
      @pick-stair-target="(cellKey, id) => (mapPublish.stairTargets.value = { ...mapPublish.stairTargets.value, [cellKey]: id })"
      @publish="mapPublish.publish()"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * The Atlas pane's map mode (#868, S6) — split out of `AtlasPlacePane.vue`
 * once that file's template pushed past the 300-line soft max. Everything
 * here is specific to *looking at a place's drawing*: the trail line naming
 * the level being viewed, the staleness strip, the map itself with its
 * up-one-level overlay and Ways-out aside, and the zoom transition between
 * two maps. The levels sidebar itself (rail, vertical ways-out, reuse panel)
 * moved to `SiteLevelsColumn` (#868, S5b) so `LocationSheet` can mount the
 * same sidebar beside its own map — this file keeps its own copy of the
 * level/container computeds only because the trail line above needs them
 * too, and they're cheap synchronous derivations off the `index` this
 * component already has. `AtlasPlacePane` keeps identity, the Contents/Map
 * toggle row, and Contents mode — the parts that render whether or not this
 * place has a map at all.
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
import { onBeforeRouteLeave } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import AtlasMapZoom from "@/components/locations/AtlasMapZoom.vue";
import LocationMap from "@/components/locations/LocationMap.vue";
import SiteLevelsColumn from "@/components/locations/SiteLevelsColumn.vue";
import SiteMapLayersPanel from "@/components/locations/SiteMapLayersPanel.vue";
import SiteWaysOutPanel from "@/components/locations/SiteWaysOutPanel.vue";
import CartographerPublishModal from "@/components/cartographer/CartographerPublishModal.vue";
import MapWorkbench from "@/components/cartographer/MapWorkbench.vue";
import { useMapPublish } from "@/composables/cartographer/useMapPublish";
import { useLocationMapRegions } from "@/composables/locations/useLocationMapRegions";
import { useOpenSiteDrawing } from "@/composables/locations/useOpenSiteDrawing";
import { useSiteDrawingEditor } from "@/composables/locations/useSiteDrawingEditor";
import { useSiteStructure } from "@/composables/locations/useSiteStructure";
import { IconChevronRight, IconChevronUp, IconStairs } from "@/lib/icons";
import { verticalWays } from "@/lib/locations/doors";
import { levelOrdinal, levelsOf } from "@/lib/locations/levels";
import { buildMapStack } from "@/lib/locations/mapStack";
import { planAscent, planDescent, regionOrigin } from "@/lib/locations/mapZoom";
import type { ZoomPlan } from "@/lib/locations/mapZoom";
import { bindableSpaces, isSiteType } from "@/lib/locations/tiers";
import type { AtlasIndex } from "@/lib/locations/tree";
import type { Location } from "@/types/location.types";

const { location, index, children, building = false } = defineProps<{
  /** Only ever mounted once the caller has confirmed `hasMap` — never null. */
  location: Location;
  index: AtlasIndex;
  children: Location[];
  /** Build mode (#884): the plan edits in place instead of only reading. */
  building?: boolean;
}>();

const emit = defineEmits<{ select: [id: string]; descend: [id: string] }>();

// The map component itself (#868, S6) — only for reading the loaded image's
// natural size when a region-click descent needs to anchor on the region's
// own centroid rather than a pin.
const mapRef = useTemplateRef<InstanceType<typeof LocationMap>>("mapRef");

const isSite = computed(() => isSiteType(location.location_type));

// ── Site regions (#807) — gated to site-tier places the same way the parent
//    gates `useSiteStructure` below, so a plain map (a region/world drawing)
//    never queries a table it has no rows in. ────────────────────────────────
const siteRegionsQuery = useLocationMapRegions(computed(() => (isSite.value ? location.id : "")));
const siteRegions = computed(() => siteRegionsQuery.data.value ?? []);
// See LocationSheet: a room, or a nested site that occupies part of this map.
const siteSpaces = computed(() => bindableSpaces(children));

// ── The map stack (#884) — Picture, Drawing, and/or a blank grid. ──────────
const mapStack = computed(() => buildMapStack(location));

// ── Staleness / door graph / layer counts (#868, S6; #884, S5) — one
//    composable so the Layers panel's Drawing/Plan rows, the vertical-ways
//    count and the readiness meter the parent renders above this component
//    all agree. ────────────────────────────────────────────────────────────
const siteStructureLocation = computed(() => (isSite.value ? location : null));
const {
  staleness: siteStaleness,
  sourceMap: siteSourceMapQuery,
  doors: siteStructureDoors,
  layerCounts: siteLayerCounts,
} = useSiteStructure(siteStructureLocation);
const siteSourceMap = computed(() => siteSourceMapQuery.data.value);

// The Layers panel's Drawing row (#884, S5) — open the existing drawing, or
// create one named after this site and open that. See `useOpenSiteDrawing`
// for why this no longer navigates at all (#884 S11).
const { openDrawing } = useOpenSiteDrawing();
function onOpenDrawing() {
  void openDrawing(location);
}

// ── Build mode (#884 S11): the workbench IS the map area ─────────────────
// `useSiteDrawingEditor` owns the Drawing's autosave/create-on-first-edit —
// see its own docblock for why it takes `siteSourceMap` rather than
// querying `location.source_map_id` a second time.
const locationForDrawing = computed(() => location);
const drawingEditor = useSiteDrawingEditor(locationForDrawing, siteSourceMap);
const drawingWorkbenchRef = drawingEditor.workbenchRef;

// #884 review finding 1: a debounced autosave that's still pending when the
// DM navigates away used to be dropped outright — nothing ever flushed it.
// `onBeforeUnmount` covers this component unmounting outright (this place is
// mounted `:key="location.id"` by `LocationDetailView`, so switching to a
// different location remounts rather than reusing the instance);
// `onBeforeRouteLeave` covers leaving the route entirely before that unmount
// runs, so the pending save is awaited — and, per `flush()`'s own docblock,
// toasted on failure — before the navigation completes.
onBeforeUnmount(() => { void drawingEditor.flush(); });
onBeforeRouteLeave(async () => { await drawingEditor.flush(); });
// "Done" (`building` → false) unmounts `MapWorkbench` via its own `v-if`
// without unmounting this component or leaving the route — neither hook
// above fires, so a pending save would otherwise be dropped the same way.
watch(
  () => building,
  (curr, prev) => { if (prev && !curr) void drawingEditor.flush(); },
);

/** The embedded workbench's own Publish (#884 S11) — reads the Drawing's
 *  live-edited layers/metadata straight off `drawingWorkbenchRef`. Unlike
 *  `CartographerEditorView.vue`'s own `requireWorkbench()`, this can't throw
 *  on a missing ref as a "should never happen" bug: `useMapPublish`'s own
 *  computeds (`mapId`, `bakedDims`, `plan`) read these getters continuously,
 *  not just while the modal is open, and the workbench is genuinely unmounted
 *  whenever the DM is Browsing rather than Building — so every getter here
 *  degrades to the same "nothing to publish" empty value instead. */
const mapPublish = useMapPublish({
  map: () => {
    const wb = drawingWorkbenchRef.value;
    return wb && siteSourceMap.value
      ? { ...siteSourceMap.value, layers: wb.getLayers(), metadata: wb.getMetadata() }
      : null;
  },
  runtimes: () => drawingWorkbenchRef.value?.getRuntimes() ?? new Map(),
  glyphs: () => drawingWorkbenchRef.value?.getCellGlyphs() ?? {},
  structure: () => drawingWorkbenchRef.value?.getStructure() ?? { spaces: [], ways: [], stairs: [], links: [] },
});
function onReviewChanges(): void {
  mapPublish.targetSiteId.value = location.id;
  mapPublish.open.value = true;
}

// ── Moving between maps ───────────────────────────────────────────────────────
const zoomPlan = ref<ZoomPlan | null>(null);
const zoomSettling = ref(false);
let settleTimer: ReturnType<typeof setTimeout> | undefined;

/** The parent, when rising to it can be animated. Drives the ascend control. */
const ascendTarget = computed(() => {
  if (!location.parent_id) return null;
  const parent = index.byId.get(location.parent_id);
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

// ── Levels (#868, frame 06) — "not a new table: it lists this site's
//    children that are themselves sites, ordered by `sort_order`." A level's
//    number must be the same no matter which level's page it is read from —
//    S is 1, A is 2, B is 3, whether the DM is looking at S, A, or B — so the
//    list is always anchored on the container (the site that HAS the levels),
//    never on whichever end `location` happens to be: viewing S, the
//    container is S itself; viewing A or B, `levelsOf` resolves the same
//    container (S) via `parent_id` and returns the identical list. Before
//    this, the two branches disagreed — the child branch listed the parent's
//    children WITHOUT the parent, so the DM saw "Level 2 · A" from S's page
//    and "Level 1 · A" one click later, on A's own. `levelsOf` is shared with
//    `SiteLevelsColumn` and `AtlasPlacePane` so all three surfaces agree.
//    Built entirely off the already-loaded `index` — no query of its own
//    beyond the room-state batch below. ──────────────────────────────────────
const levelsInfo = computed(() => levelsOf(index, location));

/** Whose children the rail is listing — this site's own, or its parent's. */
const levelsContainer = computed<Location | null>(() => levelsInfo.value?.container ?? null);

const levelSites = computed<Location[]>(() => levelsInfo.value?.levels ?? []);

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
  // site-typed children — see `levelsOf`.)
  if (levelsContainer.value?.id === location.id) descendTo(id);
  // A sibling level: a plain selection, not a descent between two maps that
  // don't stand in a parent/child relationship to each other.
  else emit("select", id);
}
</script>
