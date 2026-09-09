<template>
  <div class="flex flex-col gap-3">
    <!-- Stale variant only (#868, frame 03) — a fresh publish has nothing
         urgent enough to repeat here; it already reads calmly in the
         Rooms section below, in Contents mode. -->
    <SiteMapSourceStrip
      v-if="isSite && siteStaleness"
      :site="location"
      :map="siteSourceMap"
      :staleness="siteStaleness"
    />

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
      <SiteLevelsRail
        v-if="showLevelsRail"
        :levels="levelSummaries"
        :active-id="location.id"
        @select="onLevelSelect"
      />

      <div class="relative min-w-0 flex-1">
        <LocationMap
          ref="mapRef"
          :map-url="location.map_url!"
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
          :calibration="location.grid_calibration"
          :show-layer-bar="false"
          v-model:active-region-id="activeRegionId"
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

            <template v-if="showLevelsRail">
              <SiteWaysOutPanel :site-id="location.id" :spaces="siteSpaces" vertical-only />
              <div class="rounded-md border border-border bg-card px-3 py-2 text-caption text-muted-foreground">
                <p class="mb-1 font-cinzel text-2xs font-semibold uppercase tracking-wide text-foreground">
                  Rules we keep
                </p>
                <ul class="list-disc space-y-2 pl-4">
                  <li>
                    Direct children only
                    <p class="text-caption-sm text-muted-foreground/70">
                      A region binds to a child of the site it is drawn on — the DB guard already refuses a
                      grandchild, so the picker never offers one.
                    </p>
                  </li>
                  <li>
                    One map per place
                    <p class="text-caption-sm text-muted-foreground/70">
                      A level has its own map_url. Multi-floor in one drawing stays a drawing; the Atlas needs a
                      place per floor to hold rooms and state.
                    </p>
                  </li>
                  <li>
                    Depth is not new nesting
                    <p class="text-caption-sm text-muted-foreground/70">
                      Sites already nest arbitrarily. "Level" is a reading of the existing tree, not a new parent
                      kind.
                    </p>
                  </li>
                </ul>
              </div>
            </template>
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

    <SiteLevelReusePanel
      v-if="showLevelsRail"
      :container-id="levelsContainer!.id"
      :container-campaign-id="levelsContainer!.campaign_id"
      :level-type="levelsContainer!.location_type"
      :current-level="location"
      :next-level-number="levelSummaries.length + 1"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * The Atlas pane's map mode (#868, S6) — split out of `AtlasPlacePane.vue`
 * once that file's template pushed past the 300-line soft max. Everything
 * here is specific to *looking at a place's drawing*: the levels rail, the
 * reuse panel, the staleness strip, the map itself with its up-one-level
 * overlay and Ways-out aside, and the zoom transition between two maps.
 * `AtlasPlacePane` keeps identity, the Contents/Map toggle row, and Contents
 * mode — the parts that render whether or not this place has a map at all.
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
import AppButton from "@/components/common/AppButton.vue";
import AtlasMapZoom from "@/components/locations/AtlasMapZoom.vue";
import LocationMap from "@/components/locations/LocationMap.vue";
import SiteLevelReusePanel from "@/components/locations/SiteLevelReusePanel.vue";
import SiteLevelsRail from "@/components/locations/SiteLevelsRail.vue";
import type { SiteLevelSummary } from "@/components/locations/SiteLevelsRail.vue";
import SiteMapSourceStrip from "@/components/locations/SiteMapSourceStrip.vue";
import SiteWaysOutPanel from "@/components/locations/SiteWaysOutPanel.vue";
import { useLocationMapRegions } from "@/composables/locations/useLocationMapRegions";
import { useLocationStateForRooms } from "@/composables/locations/useLocationState";
import { useSiteStructure } from "@/composables/locations/useSiteStructure";
import { IconChevronRight, IconChevronUp, IconStairs } from "@/lib/icons";
import { verticalWays } from "@/lib/locations/doors";
import { planAscent, planDescent, regionOrigin } from "@/lib/locations/mapZoom";
import type { ZoomPlan } from "@/lib/locations/mapZoom";
import { bindableSpaces, isSiteType } from "@/lib/locations/tiers";
import { childrenOf } from "@/lib/locations/tree";
import type { AtlasIndex } from "@/lib/locations/tree";
import type { Location } from "@/types/location.types";

const { location, index, children } = defineProps<{
  /** Only ever mounted once the caller has confirmed `hasMap` — never null. */
  location: Location;
  index: AtlasIndex;
  children: Location[];
}>();

const emit = defineEmits<{ select: [id: string]; descend: [id: string] }>();

const activeRegionId = defineModel<string | null>("activeRegionId", { required: true });

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

// ── Staleness / door graph (#868, S6) — one composable so the source strip
//    and the vertical-ways count agree with the readiness meter the parent
//    renders above this component. ───────────────────────────────────────────
const siteStructureLocation = computed(() => (isSite.value ? location : null));
const { staleness: siteStaleness, sourceMap: siteSourceMapQuery, doors: siteStructureDoors } =
  useSiteStructure(siteStructureLocation);
const siteSourceMap = computed(() => siteSourceMapQuery.data.value);

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
  const calibration = location.grid_calibration ?? null;
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
//    children that are themselves sites, ordered by `sort_order`." A level is
//    a sibling site: when THIS place has no levels of its own but its parent
//    is a site, the rail lists the parent's children instead and marks this
//    one active. Built entirely off the already-loaded `index` — no query of
//    its own beyond the room-state batch below. ─────────────────────────────
const childSites = computed(() => children.filter((c) => isSiteType(c.location_type)));

/** Whose children the rail is listing — this site's own, or its parent's. */
const levelsContainer = computed<Location | null>(() => {
  if (childSites.value.length > 0) return location;
  if (!location.parent_id) return null;
  const parent = index.byId.get(location.parent_id);
  return parent && isSiteType(parent.location_type) ? parent : null;
});

/**
 * "1 · Undercroft" marks active alongside its own child sites (frame 06) —
 * the site being viewed is always level 1 of itself, so it's prepended
 * rather than left out of a list it is, in fact, the head of. The sibling
 * branch already listed this place among the rail's own entries.
 */
const levelSites = computed<Location[]>(() => {
  if (childSites.value.length > 0) return [location, ...childSites.value];
  const container = levelsContainer.value;
  return container ? childrenOf(index, container.id).filter((c) => isSiteType(c.location_type)) : [];
});

const showLevelsRail = computed(() => levelSites.value.length > 0);

const currentLevelOrdinal = computed(() => {
  const idx = levelSites.value.findIndex((l) => l.id === location.id);
  return idx === -1 ? null : idx + 1;
});

const levelRoomIdsByLevel = computed(() => {
  const byLevel = new Map<string, string[]>();
  for (const level of levelSites.value) {
    byLevel.set(
      level.id,
      childrenOf(index, level.id)
        .filter((c) => c.location_type === "room")
        .map((c) => c.id),
    );
  }
  return byLevel;
});
const allLevelRoomIds = computed(() => [...levelRoomIdsByLevel.value.values()].flat());
const { stateOf: levelRoomStateOf } = useLocationStateForRooms(allLevelRoomIds);

const levelSummaries = computed<SiteLevelSummary[]>(() =>
  levelSites.value.map((level) => {
    const roomIds = levelRoomIdsByLevel.value.get(level.id) ?? [];
    return {
      id: level.id,
      name: level.name,
      mapUrl: level.map_url,
      roomCount: roomIds.length,
      clearedCount: roomIds.filter((id) => levelRoomStateOf(id, "cleared")?.value).length,
      exploredCount: roomIds.filter((id) => levelRoomStateOf(id, "explored")?.value).length,
    };
  }),
);

/** "2 stairs down" trail chip — every vertical way out this site itself has,
 *  from the same door graph the Ways out panel already reads. */
const verticalWaysCount = computed(() => verticalWays(siteStructureDoors.value).length);

function onLevelSelect(id: string) {
  if (id === location.id) return; // already here — the rail's own active row
  // Our own children — the same zoom a pin gives, per the frame's own words.
  if (childSites.value.length > 0) descendTo(id);
  // A sibling level: a plain selection, not a descent between two maps that
  // don't stand in a parent/child relationship to each other.
  else emit("select", id);
}
</script>
