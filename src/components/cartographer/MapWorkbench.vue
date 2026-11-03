<template>
  <div ref="rootEl" :class="viewMode ? 'flex flex-col lg:flex-row gap-3 mt-2' : 'flex h-full min-h-0 flex-col gap-2'">
    <!-- Edit: a column of the 3rem bar and, under it, the rail and the canvas, filling whatever
         height the host gives it. View: the canvas alone, as the page always showed it. -->
    <CartographerBar
      v-if="!viewMode"
      :darkness="darkness"
      :campaign-id="campaignId"
      :can-undo="canUndo"
      :can-redo="canRedo"
      :save-state="saveState"
      :menu-actions="menuActions"
      :review-count="reviewCount"
      :show-ready="showReady"
      @update:darkness="setDarkness"
      @update:campaign-id="campaignId = $event"
      @menu-action="emit('menu-action', $event)"
      @ready="emit('ready')"
      @undo="undoEdit"
      @redo="redoEdit"
    >
      <template #start><slot name="bar-start" :map-name="name" :set-name="setName" /></template>
      <!-- Base image / Drawing / Zoning — only with a site: standalone /cartographer/:id has nothing to
           switch to, so it never renders there and `activeLayer` stays "drawing" forever.
           It lives here, not in the host, because the layer is workbench state. -->
      <template v-if="site" #layer>
        <CartographerLayerTabs v-model="activeLayer" />
      </template>
      <template #grid>
        <CartographerGridControl
          v-model:shown="gridShown"
          v-model:strength="gridStrength"
          :square-text="gridSquareText"
          :can-line-up="!!referencePicture"
          @line-up="lineUpBaseImage"
        />
      </template>
      <template #end><slot name="bar-end" /></template>
    </CartographerBar>

    <div :class="viewMode ? 'contents' : 'flex min-h-0 flex-1 flex-col-reverse gap-2 lg:flex-row'">
      <CartographerToolRail
        v-if="!viewMode && activeLayer !== 'picture'"
        :families="activeLayer === 'drawing' ? RAIL_FAMILIES : PLAN_RAIL_FAMILIES"
        :active-tool="activeLayer === 'drawing' ? activeTool : plan.planTool.value"
        :tile-set="activeLayer === 'drawing' ? tileSetForRail : undefined"
        @update:active-tool="onRailTool"
        @update:current-pack-id="currentPackId = $event"
        @update:second-pack-id="setSecondPack"
        @swap-tile-sets="swapTileSets"
      />

      <!-- Canvas. Pinned to the frame's edges rather than `h-full`: the frame's height
           comes from the flex row (or, in view mode, `min-height` alone), and a
           percentage height does not resolve against a min-height, so the canvas fell
           back to its own attribute height and drew a strip across the top of an
           otherwise white frame. -->
      <div
        class="flex-1 min-w-0 relative bg-card border border-border rounded-lg overflow-hidden"
        :class="viewMode ? '' : 'min-h-64'"
        :style="viewMode ? 'min-height: 60vh' : undefined"
        @pointerenter="pointerOverMap = true"
        @pointerleave="pointerOverMap = false"
      >
        <!-- While motion plays the map is ground, live water, what stands, live firelight and sway, in that order,
             as on the battle map. Paused, it is the one canvas it always was. -->
        <canvas
          v-if="motionOn"
          ref="groundCanvasEl"
          class="pointer-events-none absolute inset-0 block h-full w-full"
          aria-hidden="true"
        ></canvas>
        <CartographerMotionLayer
          :layers="layers"
          :revision="editRevision"
          :darkness="darkness"
          :runtimes="loadedRuntimes"
          :dressing="dressingCatalog"
          :tile-px="BASE_TILE_SIZE * zoom * canvasBox.dpr"
          :viewport-offset="viewportOffset"
          :dpr="canvasBox.dpr"
          :width="canvasBox.w"
          :height="canvasBox.h"
          :playing="motionOn"
          :busy="gestureBusy"
        >
          <canvas
            ref="canvasEl"
            class="absolute inset-0 block h-full w-full touch-none"
            :class="canvasCursor"
            @pointerdown="onPointerDown"
            @mousedown="onMouseDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointerleave="onPointerLeave"
            @dblclick="onDoubleClick"
            @wheel.prevent="onWheel"
            @contextmenu.prevent
          ></canvas>
        </CartographerMotionLayer>
        <!-- The editing aids sit above the animated darkness veil, so the veil never dims them. -->
        <canvas
          v-if="motionOn"
          ref="aidsCanvasEl"
          class="pointer-events-none absolute inset-0 block h-full w-full"
          aria-hidden="true"
        ></canvas>
        <CartographerMotionButton
          v-if="hasMotion"
          class="absolute bottom-9 right-2 z-10"
          :available="hasMotion"
          :playing="motionRunning"
          :reduced="osReducedMotion"
          @toggle="motionPlaying = !motionPlaying"
        />

        <WorkbenchPictureStage
          v-if="pictureStage && referencePicture"
          v-model:draft="draftCalibration"
          v-model:box-mode="boxMode"
          :url="referencePicture.url"
          :natural="pictureNatural"
          :hint="lineUpHint"
        />

        <!-- The base image is shown on a guessed grid until the DM lines one up: say so, and go there. -->
        <AppButton
          v-if="!viewMode && gridNotLinedUp"
          data-slip
          variant="tinted"
          tone="caution"
          size="sm"
          class="absolute right-2 top-2"
          label="Grid not lined up"
          tooltip="The base image is drawn on a guessed grid. Line it up so rooms and walls sit on its squares."
          @click="lineUpBaseImage"
        />

        <CartographerStatusBar
          :hover-cell="hoverCell"
          :zoom="zoom"
          :view-mode="viewMode"
          :pack-label="packLabel"
          :pack-load-error="packLoadError"
          :cells-painted="cellsPainted"
          :caution="changedRegionsCaution"
          @center="centerMap"
        />

        <!-- The active tool and its options, top left where the eye lands first. On a phone
             it spans the top and the rail lies along the bottom. -->
        <template v-if="!viewMode">
          <CartographerToolOptions
            v-if="activeLayer === 'drawing'"
            ref="toolOptionsRef"
            :title="slipTitle"
            :caption="slipCaption"
            :family-tools="activeFamily?.tools"
            :active-tool="activeTool"
            :place-item="placeItem"
            :place-label="placeItemInfo.label"
            :place-image-url="placeItemInfo.imageUrl"
            :place-footprint="placeItemInfo.footprint"
            :place-rotation="placeRotation"
            :selected-placed="selectedDressingInfo"
            :catalogue-open="drawer === 'place'"
            :runtime="packRuntime"
            :manifest="packRuntime?.manifest ?? null"
            :active-wall-kind="activeWallKind"
            :wall-visible="wallVisible"
            :selected-wall-visible="selectedWallVisible"
            :active-wall-decal="activeWallDecal"
            :wall-decal-count="packRuntime?.variantCount('wallDecal') ?? 0"
            :selected-cell="selectedCell"
            :selected-cell-floor="selectedCellFloor"
            :selected-cell-solid="selectedCellSolid"
            :selected-cell-edges="selectedCellEdges"
            :selected-cell-object-category="selectedCellObjectCategory"
            :selected-cell-linked-names="selectedCellLinkedNames"
            :annotation-text="annotationText"
            :linked-note-id="linkedNoteId"
            :linked-encounter-id="linkedEncounterId"
            :linked-trap-id="linkedTrapId"
            :linked-feature-id="linkedFeatureId"
            :note-options="noteOptions"
            :encounter-options="encounterOptions"
            :trap-options="trapOptions"
            :feature-options="featureOptions"
            :active-template-shape="activeTemplateShape"
            :template-shapes="TEMPLATE_SHAPES"
            :brush-radius="brushRadius"
            :brush-region-mode="brushRegionMode"
            :brush-category="brushCategory"
            :brush-wall-mode="brushWallMode"
            :selected-ground-region="selectedGroundRegion"
            :rect-walls="rectWalls"
            :light="shownLight"
            :light-selected="selectedLightId !== null"
            :wall-run="selectedWallRun"
            :wall-refusal="wallRefusal"
            @delete-wall-run="deleteSelectedWall"
            @update:light="onLightEdit"
            @delete-light="deleteSelectedLight"
            @update:active-tool="activeTool = $event"
            @update:place-rotation="placeRotation = $event"
            @rotate-selected="rotateSelectedDressing"
            @delete-selected="deleteSelectedDressing"
            @open-catalogue="drawer = 'place'"
            @update:active-wall-kind="activeWallKind = $event"
            @update:wall-visible="wallVisible = $event"
            @update:selected-wall-visible="setSelectedWallVisible"
            @update:active-wall-decal="activeWallDecal = $event"
            @update:annotation-text="annotationText = $event"
            @update:linked-note-id="linkedNoteId = $event"
            @update:linked-encounter-id="linkedEncounterId = $event"
            @update:linked-trap-id="linkedTrapId = $event"
            @update:linked-feature-id="linkedFeatureId = $event"
            @update:active-template-shape="activeTemplateShape = $event as TemplateShape"
            @update:brush-radius="brushRadius = $event"
            @update:brush-region-mode="brushRegionMode = $event"
            @update:brush-category="brushCategory = $event"
            @update:brush-wall-mode="brushWallMode = $event"
            @update:ground-wall-mode="setGroundWallMode"
            @update:ground-name="renameGroundRegion"
            @delete-ground-region="deleteGroundRegion"
            @update:rect-walls="rectWalls = $event"
          />
          <CartographerPictureOptions
            v-else-if="activeLayer === 'picture'"
            v-model:draft="draftCalibration"
            v-model:box-mode="boxMode"
            :has-picture="!!referencePicture" :calibrated="!!referencePicture?.calibration"
            :moving="stack.motion !== null" :battle-map="site?.is_battle_map ?? false"
            :busy="pictureBusy" :lining-up="liningUp" :natural="pictureNatural"
            @upload="emit('picture-upload', $event)"
            @remove="emit('picture-remove')"
            @line-up="startLineUp"
            @done="finishLineUp"
            @cancel="cancelLineUp"
            @update:battle-map="emit('update:isBattleMap', $event)"
          />
          <CartographerPlanOptions
            v-else
            v-model:trace-tool="plan.traceTool.value"
            v-model:template-shape="plan.templateShape.value"
            v-model:zone-kind="plan.zoneKind.value"
            v-model:zone-label="plan.zoneLabel.value"
            :title="planToolLabel"
            :plan-tool="plan.planTool.value"
            :list-open="drawer === 'zoning'"
            @start-new="plan.startNew()"
            @toggle-list="drawer = drawer === 'zoning' ? null : 'zoning'"
          />
        </template>

        <!-- View options (Reference) keep the top right in view mode; while editing they
             are in the bar's settings. The host's own controls moved into the bar. -->
        <div v-if="viewMode && referencePicture" data-slip class="absolute top-2 right-2 px-2 py-1 rounded-md bg-card/95 border border-border">
          <AppCheckbox v-model="showPictureReference" label="Reference" size="sm" />
        </div>

        <!-- One drawer at a time, over the canvas's right edge: the Dressing props, or Zoning's one list
             (Map Table frame 19). The Zoning rail decides which GESTURE a click means; naming a room,
             binding it to a place, reshaping and deleting stay list actions, which is what this gives it. -->
        <CartographerDrawerPanels
          v-if="!viewMode"
          :drawer="drawer"
          :title="drawerTitle"
          :site="site"
          :spaces="spaces"
          :plan="plan"
          :cells-painted="cellsPainted"
          :place-item="placeItem"
          :runtime="packRuntime"
          :pack-label="packLabel"
          :recent="recentPlaced"
          @close="drawer = null"
          @reshape="reshapeEntry"
          @pick="pickPlaceItem"
        />

        <!-- Overlay hint while the default pack loads -->
        <div
          v-if="awaitingDefaultPack"
          class="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm"
        >
          <LoadingSpinner />
        </div>
        <!-- Genuinely empty library — the query has answered and there is
             nothing published. Not a fallback to a hardcoded pack (rule 1):
             a real, readable state instead. -->
        <div
          v-else-if="!hasPublishedPacks"
          class="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm px-4 text-center"
        >
          <p class="text-caption text-muted-foreground">No tile packs are published yet.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { groundCellBounds } from "@/cartographer/groundRegions";
// The Cartographer's editing surface, extracted out of CartographerEditorView
// (epic #884 S6) so it can be embedded both at `/cartographer/:id` and,
// later, inside the Atlas's map area. This component owns the toolbox, the
// canvas (via `useMapCanvasEditor`), the 3rem bar, the tool rail, the active tool's
// options slip, the right drawer, and tile-pack loading. It does NOT read `useRoute`/`useRouter` or any
// route query — the host decides routing, this only edits a map.
//
// ── Props ────────────────────────────────────────────────────────────────
// `map`      — the persisted `dungeon_maps` row to edit, or null for an
//               unsaved new map / while the host's query is still loading.
//               Changing it re-initializes every editable field (same rule
//               the pre-extraction view's `watch(loadedMap, ...)` followed).
// `viewMode` — read-only display: pan/zoom only, no bar, no rail, no options,
//               no painting. The host derives this from its own route query.
// `saveState` — the host's save state text for the bar ("Saving…", "Unsaved changes").
// `site`     — optional, `MapStackSource`-shaped (see
//               `lib/locations/mapStack.ts`) plus the site's own `id`. When
//               given, the site's Picture layer renders as a toggleable
//               ghost reference beneath the canvas (positioned via its own
//               `grid_calibration` against this component's viewport), AND
//               the Base image / Drawing / Zoning tabs appear (#884 S7b, Map Table frame 18) switching between the
//               Drawing (every tool above) and Zoning (the Plan) — a DM tracing
//               `location_map_regions`/`location_doors` for this site
//               directly on this same canvas, in the same tile-cell space
//               the Drawing already paints (see `buildReferenceImage`'s own
//               comment below for why that sharing is safe). Absent →
//               identical to the pre-extraction standalone editor: no
//               reference layer, no layer selector, no Plan palette.
//
// ── Slots ────────────────────────────────────────────────────────────────
// `bar-start` (scoped: `mapName`, `setName`) and `bar-end` fill the two ends of the bar: the
// standalone host puts a way back and the map's name in the first and Delete/Cancel/Save in the
// second, Atlas Build its level picker in the first. The workbench itself puts the tabs and the Grid
// control after `bar-start`, because the layer is its own state.
//
// ── Emits ────────────────────────────────────────────────────────────────
// `update:dirty` — fires whenever the unsaved-edit flag changes. The host
//               mirrors it into its own ref for `useUnsavedGuard` and the
//               status line — both are host-owned because both need route
//               state (`isNew`) this component doesn't have.
// `update:editRevision` — fires on every edit, not just the false→true
//               `dirty` transition (#884 review finding 1: `dirty` staying
//               `true` across a second edit fires no `update:dirty` at all).
//               `useSiteDrawingEditor` re-arms its autosave debounce off
//               this so a stroke made while a save is already in flight
//               isn't silently dropped.
//
// ── Exposed (defineExpose) ──────────────────────────────────────────────
// Painting mutates `layers`/`metadata` on nearly every pointer move, so a
// continuous two-way prop/emit surface for them would mean deep-cloning and
// emitting on every mouse-move frame. Instead the host pulls a snapshot only
// at the few moments it actually needs one (Save, Cancel, opening the
// Publish/AI-Style modals, the PNG bake) via these plain getter functions —
// the same "closures the composable calls on demand" convention
// `useMapExport`/`useMapPublish` already use for their own inputs. Getters
// read live refs internally, so reactivity still flows through them
// correctly when called from inside a parent `computed`.
//
//   getName / getCampaignId / getLayers / getMetadata / getCurrentPackId / getDarkness
//   getRuntimes       — loaded tile-pack runtimes, keyed by pack id
//   getDressingCatalog — Dressing props by id, with the art loaded so far (#1062)
//   loadDressingCatalog — the same once every placed prop's art is in: what a bake reads
//   getCellGlyphs     — resolved hazard/feature/note/encounter glyphs (#804)
//   getStructure      — derived spaces/ways/zones/links, Publish's input
//   getCellsPainted / getPackName — the status line's two workbench-owned segments
//   isDirty           — imperative read of the same flag `update:dirty` emits
//   getEditRevision   — imperative read of the same counter `update:editRevision` emits
//   resetEdits()      — discard in-progress edits, restore from `map` prop (Cancel)
//   markSaved()       — clear the dirty flag after the host's mutation resolves
import { computed, onMounted, ref, watch } from "vue";

import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import { storeToRefs } from "pinia";
import { usePreferredReducedMotion } from "@vueuse/core";
import { useCartographerUiStore } from "@/stores/ui/cartographer";
import CartographerBar from "@/components/cartographer/CartographerBar.vue";
import CartographerGridControl from "@/components/cartographer/CartographerGridControl.vue";
import CartographerLayerTabs from "@/components/cartographer/CartographerLayerTabs.vue";
import CartographerDrawerPanels from "@/components/cartographer/CartographerDrawerPanels.vue";
import CartographerStatusBar from "@/components/cartographer/CartographerStatusBar.vue";
import CartographerToolRail from "@/components/cartographer/CartographerToolRail.vue";
import CartographerPlanOptions from "@/components/cartographer/CartographerPlanOptions.vue";
import CartographerPictureOptions from "@/components/cartographer/CartographerPictureOptions.vue";
import WorkbenchPictureStage from "@/components/cartographer/WorkbenchPictureStage.vue";
import CartographerMotionLayer from "@/components/cartographer/CartographerMotionLayer.vue";
import CartographerMotionButton from "@/components/cartographer/CartographerMotionButton.vue";
import CartographerToolOptions from "@/components/cartographer/CartographerToolOptions.vue";
import { useCartographerStructure } from "@/composables/cartographer/useCartographerStructure";
import { useMapCanvasEditor } from "@/composables/cartographer/useMapCanvasEditor";
import type { TemplateShape } from "@/composables/cartographer/mapCanvasEditor.types";
import { usePlanPalette, type PlanTool } from "@/composables/cartographer/usePlanPalette";
import { usePublishedSites } from "@/composables/cartographer/usePublishedSites";
import { useWorkbenchPacks } from "@/composables/cartographer/useWorkbenchPacks";
import { useWorkbenchDocument } from "@/composables/cartographer/useWorkbenchDocument";
import { useWorkbenchSlip } from "@/composables/cartographer/useWorkbenchSlip";
import { useWorkbenchToolState } from "@/composables/cartographer/useWorkbenchToolState";
import { useWorkbenchTileSets } from "@/composables/cartographer/useWorkbenchTileSets";
import { useWorkbenchCellSelection } from "@/composables/cartographer/useWorkbenchCellSelection";
import {
  PLAN_RAIL_FAMILIES, RAIL_FAMILIES, TEMPLATE_SHAPES, TOOLS,
} from "@/composables/cartographer/workbenchTools";
import { useDressingCatalog } from "@/composables/cartographer/useLibraryDressing";
import type { MapMenuAction, PlaceItem, Tool } from "@/cartographer/tools";
import type { EditorLayer } from "@/cartographer/keymap";
import { mapHasMotion } from "@/cartographer/motion";
import { BASE_TILE_SIZE } from "@/cartographer/packSchema";
import {
  type DarknessLevel,
  type DungeonMap,
  type GroundWallMode,
} from "@/types/dungeonMap.types";
import type { TileLight } from "@/cartographer/packSchema";
import { buildMapStack, hasAnyMapLayer, type MapStackSource } from "@/lib/locations/mapStack";
import type { BindableSpace } from "@/types/locationMapRegion.types";
import type { ZoningEntry } from "@/lib/locations/foundRooms";
import { entryId } from "@/lib/locations/zoningRows";
import type { GridCalibration, LocationType } from "@/types/location.types";
import { squareReadout, useCanvasFraming, useFitMapOnFirstEntry, useReferencePicture, useWorkbenchPicture } from "@/composables/cartographer/useWorkbenchPicture";

const {
  map, viewMode, site, spaces, saveState, menuActions = [], reviewCount, showReady = false, startLayer,
  defaultName = "Untitled Map", pictureBusy = false, frame,
} = defineProps<{
  map: DungeonMap | null;
  viewMode: boolean;
  /** The layer to open on, when the host was sent for one ("Place it" asks for the Plan). Absent: the Plan
   *  when the site already has a map to trace over, else the Drawing. */
  startLayer?: EditorLayer;
  /** What an unnamed map is called: a site's drawing takes the site's name. */
  defaultName?: string;
  /** The squares an empty map opens zoomed to show (Start a map's size); the grid itself is endless. */
  frame?: { cols: number; rows: number };
  /** The host is writing the Picture (an upload, a removal): the palette says so. */
  pictureBusy?: boolean;
  /** The host's save state, shown in the bar: "Saving…", "Unsaved changes". Absent says nothing. */
  saveState?: string;
  site?: MapStackSource & { id: string; is_battle_map?: boolean };
  /** The site's own bindable children (rooms, nested sites) — only
   *  meaningful with `site`, and only read by the Plan's Spaces panel
   *  (#884 S11) to offer a "Bind to space…" picker. The host already has
   *  this (it built `site` from the same location), so it travels as its
   *  own prop rather than a second query in here. */
  spaces?: (BindableSpace & { location_type: LocationType })[];
  /** The host's own entries in the bar's Map menu (style, review, download, export, delete);
   *  only these are drawn. A later story wires each host. */
  menuActions?: readonly MapMenuAction[];
  /** Site changes waiting for review: the chip on that menu row. */
  reviewCount?: number;
  /** Whether the bar shows its primary "Ready" button. */
  showReady?: boolean;
}>();

const emit = defineEmits<{
  "update:dirty": [boolean];
  "update:editRevision": [number];
  "menu-action": [id: MapMenuAction];
  ready: [];
  /** The Picture layer's writes: the workbench draws them, the host owns the place and does them. */
  "update:pictureCalibration": [GridCalibration];
  "picture-upload": [File];
  "picture-remove": [];
  "update:isBattleMap": [boolean];
}>();

// Shared, admin-authored tile packs (#889) and the campaign's own, loaded in useWorkbenchPacks.
const {
  activeCampaignId, selectablePacks, currentPackId, hasPublishedPacks, firstPublishedPackId, packLoadError,
  loadedRuntimes, packRuntime, awaitingDefaultPack, packLabel,
} = useWorkbenchPacks();

const {
  name, campaignId, layers, metadata, darkness, dirty, editRevision, markDirty, setName, setDarkness,
  applyMapToState, resetEdits, markSaved,
} = useWorkbenchDocument({
  defaultName, activeCampaignId, currentPackId, firstPublishedPackId, getMap: () => map,
  emits: { dirty: (v) => emit("update:dirty", v), editRevision: (rev) => emit("update:editRevision", rev) },
});

const canvasEl = ref<HTMLCanvasElement | null>(null);
const rootEl = ref<HTMLElement | null>(null);

// Space and the zoom keys are the map's only while the pointer is over it or focus is
// inside the workbench. The editor listens on the window, and this component also sits
// inside whole pages (the Atlas) whose other controls need those keys.
const pointerOverMap = ref(false);
function keysActive(): boolean {
  return pointerOverMap.value || (rootEl.value?.contains(document.activeElement) ?? false);
}

// The browser's middle-press autoscroll would take the pan drag over.
function onMouseDown(ev: MouseEvent): void {
  if (ev.button === 1) ev.preventDefault();
}

const { gridShown, gridStrength, gridAlpha, motionPlaying, motionRunning } = storeToRefs(useCartographerUiStore());
// The Motion button (#1125 frames 16-17): the map's own water, sway and firelight, played while it is edited.
const groundCanvasEl = ref<HTMLCanvasElement | null>(null);
const aidsCanvasEl = ref<HTMLCanvasElement | null>(null);
const reducedMotionPreference = usePreferredReducedMotion();
const osReducedMotion = computed(() => reducedMotionPreference.value === "reduce");
const hasMotion = computed(() => {
  void editRevision.value; // the layers change in place; the counter says when
  return mapHasMotion(layers.value, loadedRuntimes.value, dressingCatalog.value);
});
// Only the Drawing and Zoning show the map (the Base image tab is a picture to line up).
const motionOn = computed(() => motionRunning.value && hasMotion.value && activeLayer.value !== "picture");

function onRailTool(id: string): void {
  if (activeLayer.value === "drawing") activeTool.value = id as Tool;
  else plan.planTool.value = id as PlanTool;
}

const {
  activeTool, selectedDressingId, placeItem, placeRotation, recentPlaced, pickPlaceItem, activeWallKind, activeWallDecal,
  lightDraft, activeTemplateShape, brushRadius, brushRegionMode, brushCategory, brushWallMode, wallVisible, rectWalls,
  selectedCell, toolOptionsRef,
} = useWorkbenchToolState();

// Art is loaded for what is on the map and the armed prop, nothing else.
const { catalog: dressingCatalog, load: loadDressingCatalog } = useDressingCatalog(() => {
  const ids = Object.values(layers.value.dressing).map((placement) => placement.prop_id);
  return placeItem.value?.kind === "prop" ? [...ids, placeItem.value.propId] : ids;
});


// #868 — derived structure (spaces/ways/zones/links). See
// useCartographerStructure.ts for what each field means. The Structure
// tools' own pointer dispatch (`structureTools`) is built inside
// useMapCanvasEditor below — it needs the same undo snapshot/pushCommand
// pair every other one-shot tool there uses.
const mapPropRef = computed(() => map);
const structure = useCartographerStructure(layers, metadata, mapPropRef);
const { data: publishedSites } = usePublishedSites(computed(() => map?.id ?? ""));

const {
  noteOptions, encounterOptions, trapOptions, featureOptions, cellGlyphs,
  linkedNoteId, linkedEncounterId, linkedTrapId, linkedFeatureId, annotationText,
  selectedCellFloor, selectedCellSolid, selectedCellEdges, selectedCellObjectCategory, selectedCellLinkedNames,
} = useWorkbenchCellSelection({ layers, metadata, selectedCell, markDirty });

const cellsPainted = computed(() => Object.keys(layers.value.floor).length);

const stack = computed(() => buildMapStack(site ?? null));
const referencePicture = computed(() => stack.value.picture);

// ── Plan layer (#884 S7b) — the site's own `location_map_regions`/`location_doors`, traced on this canvas ──
// Built unconditionally: every query in `usePlanPalette` is `enabled`-guarded on a real site id, so on the
// standalone route (no `site`, no layer selector) it is inert: no request, no mutation possible.
const siteId = computed(() => site?.id ?? null);
const plan = usePlanPalette(siteId, () => structure.structure.value.spaces);
const {
  activeFamily, placeItemInfo, selectedDressingInfo, slipTitle, slipCaption, planToolLabel, changedRegionsCaution,
} = useWorkbenchSlip({
  layers, activeTool, placeItem, selectedDressingId, dressingCatalog, packRuntime, plan, altHeld: () => altHeld.value,
  changedSinceLastPublish: structure.changedSinceLastPublish, publishedSiteCount: () => publishedSites.value?.length ?? 0,
});
// Initial layer, read once at setup (a hand-picked layer stands for the session). A site with a Drawing or Picture
// opens on Plan to trace it (#878 S2); one whose only map is a picture without a grid opens on the Picture, where the
// grid gets lined up. The standalone route passes no `site` and lands on the Drawing.
const needsGrid = !!site && !!stack.value.picture && !stack.value.picture.calibration && !stack.value.drawing;
const activeLayer = ref<EditorLayer>(
  startLayer ?? (needsGrid ? "picture" : site && hasAnyMapLayer(site) ? "plan" : "drawing"),
);
const { setSecondPack, swapTileSets, tileSetForRail } = useWorkbenchTileSets({
  mapId: () => map?.id, selectablePacks, currentPackId, loadedRuntimes, packRuntime, activeLayer,
});
const { showPictureReference, referenceImageEl, buildReferenceImage, gridNotLinedUp } = useReferencePicture(referencePicture, activeLayer);
function toggleGrid(): void {
  gridShown.value = !gridShown.value;
}

// ── The right drawer: one panel at a time over the canvas's edge. Zoning opens on its one list
// (it is how a room is named and bound); Place opens its catalogue with its tool, because the props are
// picked there. A closed list comes back from the Zoning slip.
type DrawerId = "place" | "zoning";
const drawer = ref<DrawerId | null>(activeLayer.value === "plan" ? "zoning" : null);
const DRAWER_TITLE: Record<DrawerId, string> = { place: "Place", zoning: "Zones on this map" };
const drawerTitle = computed(() => (drawer.value ? DRAWER_TITLE[drawer.value] : ""));
watch(activeLayer, (layer) => {
  drawer.value = layer === "plan" ? "zoning" : null;
});
watch(activeTool, (tool) => {
  if (activeLayer.value !== "drawing") return;
  if (tool === "place") drawer.value = "place";
  else if (drawer.value === "place") drawer.value = null;
});

/** "Reshape" in the list: makes the room or zone the one being traced and arms the Zone tool, so the next drag
 *  on the map redraws it (a bare `activeRegionId` write does nothing while the tool is Door or Fill, per
 *  `usePlanCanvasTools.ts`'s `isTraceTool()`). A found room is written first; tapping again lets go of it. */
async function reshapeEntry(entry: ZoningEntry): Promise<void> {
  const id = entryId(entry);
  plan.planTool.value = "zone";
  await plan.selectRegion(plan.activeRegionId.value === id ? null : id);
}

// ── Canvas engine (#884 S6) — viewport, pointer/paint dispatch, undo/redo,
// variant picking, the render loop. See useMapCanvasEditor.ts.
const {
  zoom, viewportOffset, hoverCell, altHeld, spaceHeld, isPanning, canUndo, canRedo, undoEdit, redoEdit, centerMap,
  onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onDoubleClick, onWheel,
  rotateSelectedDressing, deleteSelectedDressing, selectedLightId, updateSelectedLight, deleteSelectedLight,
  selectedWallRun, wallRefusal, deleteSelectedWall, canvasBox, gestureBusy,
  selectedGroundRegion, setGroundWallMode, deleteGroundRegion,
  selectedWallVisible, setSelectedWallVisible, renameGroundRegion,
} = useMapCanvasEditor({
  canvasEl, layers, metadata, dirty, editRevision, currentPackId, darkness, packRuntime, selectablePacks, loadedRuntimes,
  dressing: dressingCatalog, placeItem, selectedDressingId, cellGlyphs, activeTool, tools: TOOLS, viewMode: () => viewMode,
  placeRotation, activeWallKind, activeWallDecal, lightDraft, activeTemplateShape, brushRadius, rectWalls,
  brushRegionMode, brushCategory, brushWallMode,
  wallVisible,
  selectedCell, toolOptionsRef, mapKey: computed(() => map?.id || "new"),
  getReferenceImage: buildReferenceImage,
  extraRenderDeps: [showPictureReference, referenceImageEl],
  plan, activeLayer, hasLayerTabs: !!site, gridAlpha, toggleGrid, keysActive, swapTileSets,
  groundCanvasEl, aidsCanvasEl, motionPlaying: () => motionOn.value,
});

// Picture layer (canvas frame 07): lining the grid up and fitting the view.
const fitCanvasTo = useCanvasFraming(canvasEl, zoom, viewportOffset);
const { liningUp, draftCalibration, boxMode, pictureNatural, pictureStage, lineUpHint, startLineUp, cancelLineUp, finishLineUp } =
  useWorkbenchPicture({
    picture: referencePicture, imageEl: referenceImageEl, activeLayer, fitCanvasTo,
    onLined: (calibration) => emit("update:pictureCalibration", calibration),
  });
// Drawing and Zoning open fitted to the whole map the first time each is entered (frame 18).
useFitMapOnFirstEntry({
  activeLayer, picture: referencePicture, pictureNatural, fitCanvasTo, mapId: () => map?.id,
  paintedBounds: () => groundCellBounds(layers.value),
});

/** The Grid options' size read-out, once the base image has a grid of its own to read it from. */
const gridSquareText = computed(() => {
  const cal = referencePicture.value?.calibration;
  const natural = pictureNatural.value;
  return cal && natural ? squareReadout(cal, natural) : null;
});
/** Straight to the line-up on the Base image tab (the Grid options' button, the chip, and the Ready check's fix). */
function lineUpBaseImage(): void {
  activeLayer.value = "picture";
  startLineUp();
}

/** What the Light slip shows: the selected light when one is picked, else what the next one will be. */
const shownLight = computed<TileLight>(() => {
  const id = selectedLightId.value;
  const placed = id ? layers.value.lights[id] : undefined;
  return placed ? placed.light : lightDraft.value;
});
function onLightEdit(patch: Partial<TileLight>): void {
  // A change to a picked light is that light's own undo step; the draft follows so the next one matches.
  updateSelectedLight(patch);
  lightDraft.value = { ...lightDraft.value, ...patch };
}

// The hand shows while Space is held or the Pan tool is armed on the Drawing, and closes
// into a fist for the drag itself. View mode has no tools, so it keeps the plain arrow.
const canvasCursor = computed(() => {
  if (isPanning.value) return "cursor-grabbing";
  if (viewMode) return "cursor-default";
  if (spaceHeld.value || (activeLayer.value === "drawing" && activeTool.value === "pan")) return "cursor-grab";
  return "cursor-crosshair";
});

onMounted(() => {
  // A new map opens showing the size it was started with, not an arbitrary 100% on the origin.
  if (frame && cellsPainted.value === 0) fitCanvasTo({ minX: 0, minY: 0, maxX: frame.cols - 1, maxY: frame.rows - 1 }, 1);
});

// ── Map load ───────────────────────────────────────────────────────────────

watch(() => map, (m) => applyMapToState(m ?? null), { immediate: true });

defineExpose({
  getName: () => name.value,
  getCampaignId: () => campaignId.value,
  getLayers: () => layers.value,
  getMetadata: () => metadata.value,
  getCurrentPackId: () => currentPackId.value,
  getDarkness: () => darkness.value,
  getRuntimes: () => loadedRuntimes.value,
  getDressingCatalog: () => dressingCatalog.value,
  loadDressingCatalog,
  getCellGlyphs: () => cellGlyphs.value,
  getStructure: () => structure.structure.value,
  getCellsPainted: () => cellsPainted.value,
  getPackName: () => packLabel.value,
  isDirty: () => dirty.value,
  /** The autosave's own "has anything changed since I started saving?"
   *  check (#884 review finding 1) — see `useMapCanvasEditor.ts`'s
   *  `editRevision` docblock. */
  getEditRevision: () => editRevision.value,
  resetEdits,
  markSaved,
  /** The ready check's fixes (#1125 frame 08): each lands the DM where the fix is made. */
  setDarkness,
  startLineUp: lineUpBaseImage,
  armDoorPlacement: (doorId: string) => { activeLayer.value = "plan"; plan.armDoorPlacement(doorId); },
  showSpaces: () => { activeLayer.value = "plan"; drawer.value = "zoning"; },
});
</script>
