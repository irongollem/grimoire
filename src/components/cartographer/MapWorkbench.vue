<template>
  <div :class="viewMode ? 'flex flex-col lg:flex-row gap-3 mt-2' : 'flex h-full min-h-0 flex-col gap-2'">
    <!-- Edit: a column of the 3rem bar and, under it, the rail and the canvas, filling whatever
         height the host gives it. View: the canvas alone, as the page always showed it. -->
    <CartographerBar
      v-if="!viewMode"
      :packs="selectablePacks"
      :current-pack-id="currentPackId"
      :loaded-pack-ids="loadedPackIds"
      :pack-runtime="packRuntime"
      :pack-name="packLabel"
      :validation-missing="packRuntime?.validation.missing.length ?? 0"
      :darkness="darkness"
      :campaign-id="campaignId"
      :space-count="activeLayer === 'plan' ? plan.regions.value.length : structure.spaceRows.value.length"
      :spaces-open="drawer === spacesDrawerId"
      :can-undo="canUndo"
      :can-redo="canRedo"
      :save-state="saveState"
      :reference-available="!!referencePicture"
      :show-reference="showPictureReference"
      @update:current-pack-id="currentPackId = $event"
      @update:darkness="setDarkness"
      @update:campaign-id="campaignId = $event"
      @update:show-reference="showPictureReference = $event"
      @toggle-spaces="toggleSpaces"
      @undo="undoEdit"
      @redo="redoEdit"
    >
      <template #start><slot name="bar-start" :map-name="name" :set-name="setName" /></template>
      <!-- Drawing / Plan — only with a site: standalone /cartographer/:id has no Plan to
           switch to, so it never renders there and `activeLayer` stays "drawing" forever.
           It lives here, not in the host, because the layer is workbench state. -->
      <template v-if="site" #layer>
        <SegmentedControl
          :model-value="activeLayer"
          :options="LAYER_OPTIONS"
          size="xs"
          class="shrink-0"
          @update:model-value="activeLayer = $event"
        />
      </template>
      <template #end><slot name="bar-end" /></template>
    </CartographerBar>

    <div :class="viewMode ? 'contents' : 'flex min-h-0 flex-1 flex-col-reverse gap-2 lg:flex-row'">
      <CartographerToolRail
        v-if="!viewMode"
        :groups="activeLayer === 'drawing' ? RAIL_GROUPS : PLAN_RAIL_GROUPS"
        :active-tool="activeLayer === 'drawing' ? activeTool : plan.planTool.value"
        @update:active-tool="onRailTool"
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
      >
        <canvas
          ref="canvasEl"
          class="absolute inset-0 block h-full w-full touch-none"
          :class="viewMode ? 'cursor-default' : 'cursor-crosshair'"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointerleave="onPointerLeave"
          @dblclick="onDoubleClick"
          @wheel.prevent="onWheel"
          @contextmenu.prevent
        ></canvas>

        <!-- Status bar -->
        <div
          class="absolute bottom-0 left-0 right-0 flex items-center gap-3 px-3 py-1 bg-card/95 border-t border-border text-caption-sm text-muted-foreground"
        >
          <span>
            Cursor: <strong class="text-foreground">{{ hoverCell?.[0] ?? "—" }}, {{ hoverCell?.[1] ?? "—" }}</strong>
          </span>
          <span>
            Zoom: <strong class="text-foreground">{{ Math.round(zoom * 100) }}%</strong>
          </span>
          <span v-if="viewMode">
            Pack: <strong class="text-foreground">{{ packLabel }}</strong>
            <span v-if="packLoadError" class="text-destructive"> ({{ packLoadError }})</span>
          </span>
          <span v-else-if="packLoadError" class="text-destructive">{{ packLoadError }}</span>
          <span v-if="cellsPainted > 0">
            Floor cells: <strong class="text-foreground">{{ cellsPainted }}</strong>
          </span>
          <AppButton
            variant="ghost"
            fill="muted"
            size="icon-xs"
            tooltip="Center map (C)"
            aria-label="Center map"
            :icon="IconCenter"
            @click="centerMap"
          />
          <span v-if="changedRegionsCaution" class="ml-auto text-ink-caution">{{ changedRegionsCaution }}</span>
        </div>

        <!-- The active tool and its options, top left where the eye lands first. On a phone
             it spans the top and the rail lies along the bottom. -->
        <template v-if="!viewMode">
          <CartographerToolOptions
            v-if="activeLayer === 'drawing'"
            ref="toolOptionsRef"
            :title="canvasToolLabel"
            :active-tool="activeTool"
            :active-object-category="activeObjectCategory"
            :object-categories="STAMP_CATEGORIES"
            :stamp-rotation="stampRotation"
            :manifest="packRuntime?.manifest ?? null"
            :active-wall-kind="activeWallKind"
            :active-wall-decal="activeWallDecal"
            :wall-decal-count="packRuntime?.variantCount('wallDecal') ?? 0"
            :dressing-brush-id="dressingBrushId"
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
            @update:active-object-category="activeObjectCategory = $event"
            @update:stamp-rotation="stampRotation = $event"
            @update:active-wall-kind="activeWallKind = $event"
            @update:active-wall-decal="activeWallDecal = $event"
            @update:annotation-text="annotationText = $event"
            @update:linked-note-id="linkedNoteId = $event"
            @update:linked-encounter-id="linkedEncounterId = $event"
            @update:linked-trap-id="linkedTrapId = $event"
            @update:linked-feature-id="linkedFeatureId = $event"
            @update:active-template-shape="activeTemplateShape = $event as TemplateShape"
            @update:brush-radius="brushRadius = $event"
          />
          <CartographerPlanOptions
            v-else
            v-model:trace-tool="plan.traceTool.value"
            v-model:template-shape="plan.templateShape.value"
            v-model:zone-kind="plan.zoneKind.value"
            v-model:zone-label="plan.zoneLabel.value"
            :title="canvasToolLabel"
            :plan-tool="plan.planTool.value"
            @start-new="plan.planTool.value === 'zone' ? plan.startNewZone() : plan.startNewSpace()"
          />
        </template>

        <!-- View options (Reference) keep the top right in view mode; while editing they
             are in the bar's settings. The host's own controls moved into the bar. -->
        <div v-if="viewMode && referencePicture" class="absolute top-2 right-2 px-2 py-1 rounded-md bg-card/95 border border-border">
          <AppCheckbox v-model="showPictureReference" label="Reference" size="sm" />
        </div>

        <!-- One drawer at a time, over the canvas's right edge: the Spaces on this map, the
             Dressing props, or the Plan's own Spaces and Zones panels (#884 S11). The Plan
             rail decides which GESTURE a click means; binding a traced shape to a room,
             naming it, and deleting it stay panel actions, which is what these give it. -->
        <CartographerDrawer v-if="!viewMode" :open="drawer !== null" :title="drawerTitle" @close="drawer = null">
          <div v-if="drawer === 'plan' && site" class="flex flex-col gap-3">
            <SiteMapRegionList
              :location-id="site.id"
              :spaces="spaces ?? []"
              :regions="plan.regions.value"
              :active-region-id="plan.activeRegionId.value"
              :can-trace="true"
              :building="true"
              :door-tool-armed="plan.planTool.value === 'door'"
              @update:active-region-id="(id) => setPlanActiveRegion(id, 'space')"
              @update:door-tool-armed="(armed) => (plan.planTool.value = armed ? 'door' : 'space')"
            />
            <SiteMapZoneList
              :location-id="site.id"
              :regions="plan.regions.value"
              :active-region-id="plan.activeRegionId.value"
              :can-trace="true"
              :building="true"
              @update:active-region-id="(id) => setPlanActiveRegion(id, 'zone')"
            />
          </div>
          <CartographerDressingPanel
            v-else-if="drawer === 'dressing'"
            :brush-id="dressingBrushId"
            :brush-rotation="dressingRotation"
            :selected="selectedDressingInfo"
            @update:brush-id="dressingBrushId = $event"
            @update:brush-rotation="dressingRotation = $event"
            @rotate-selected="rotateSelectedDressing"
            @delete-selected="deleteSelectedDressing"
          />
          <CartographerStructurePanel
            v-else-if="drawer === 'spaces'"
            :space-rows="structure.spaceRows.value"
            :selected-space-inspector="structure.selectedSpaceInspector.value"
            :published-sites="publishedSites ?? []"
            :map-rev="map?.rev ?? 0"
            @select-space="(key) => (structure.selectedSpaceKey.value = key)"
            @rename-space="structureTools.onRenameSpace"
            @redetect="structure.redetect"
          />
        </CartographerDrawer>

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
//               a layer selector appears (#884 S7b) switching between the
//               Drawing (every tool above) and the Plan — a DM tracing
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
// second, Atlas Build its level picker in the first. The workbench itself puts the Drawing/Plan
// switch after `bar-start`, because the layer is its own state.
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
import { computed, onMounted, ref, watch, type Component } from "vue";

import {
  IconSelect,
  IconBrush,
  IconWater,
  IconEraser,
  IconHand,
  IconCenter,
  IconWall,
  IconDoor,
  IconCube,
  IconRect,
  IconDrawLine,
  IconFill,
  IconWrapWalls,
  IconObjectStamp,
  IconDressing,
  IconAnnotate,
  IconEntityLink,
  IconRoomTemplate,
  IconCave,
  IconSplitCell,
  IconHighlight,
  type AppIcon,
} from "@/lib/icons";

import type { AppInputHandle } from "@/components/common/controls/fieldVariants";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import CartographerBar from "@/components/cartographer/CartographerBar.vue";
import CartographerDrawer from "@/components/cartographer/CartographerDrawer.vue";
import CartographerDressingPanel from "@/components/cartographer/CartographerDressingPanel.vue";
import CartographerToolRail, { type RailGroup } from "@/components/cartographer/CartographerToolRail.vue";
import CartographerPlanOptions from "@/components/cartographer/CartographerPlanOptions.vue";
import CartographerToolOptions from "@/components/cartographer/CartographerToolOptions.vue";
import CartographerStructurePanel from "@/components/cartographer/CartographerStructurePanel.vue";
import SiteMapRegionList from "@/components/locations/site/SiteMapRegionList.vue";
import SiteMapZoneList from "@/components/locations/site/SiteMapZoneList.vue";
import { useCartographerStructure } from "@/composables/cartographer/useCartographerStructure";
import { useMapCanvasEditor } from "@/composables/cartographer/useMapCanvasEditor";
import { usePlanPalette, PLAN_TOOLS, TRACE_TOOL_OPTIONS, type PlanTool } from "@/composables/cartographer/usePlanPalette";
import { usePublishedSites } from "@/composables/cartographer/usePublishedSites";

import { useNotes } from "@/composables/notes/useNotes";
import { useEncounters } from "@/composables/encounters/useEncounters";
import { useTrapIndex } from "@/composables/dungeon-features/useTraps";
import { useDungeonFeatureIndex } from "@/composables/dungeon-features/useDungeonFeatures";
import { useDressingCatalog } from "@/composables/cartographer/useLibraryDressing";
import { loadUserPack, useTilePacks } from "@/composables/cartographer/useTilePacks";
import { loadLibraryPack, useLibraryTilePacks } from "@/composables/cartographer/useLibraryTilePacks";
import { useCampaignStore } from "@/stores/campaign";
import type { Tool } from "@/cartographer/tools";
import {
  emptyLayers,
  withLayerDefaults,
  cellKey,
  type CellKey,
  type DarknessLevel,
  type DungeonMap,
  type DungeonMapLayers,
  type CellMetadata,
  type EdgeSegType,
} from "@/types/dungeonMap.types";
import { STAMP_CATEGORIES, type StampCategory } from "@/cartographer/stampCategories";
import type { WallKind } from "@/cartographer/wallKinds";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { MapRenderReferenceImage } from "@/cartographer/renderMap";
import { resolveCellGlyphs } from "@/cartographer/glyphs";
import { buildMapStack, hasAnyMapLayer, type MapStackSource } from "@/lib/locations/mapStack";
import type { BindableSpace, RegionRole } from "@/types/locationMapRegion.types";

const { map, viewMode, site, spaces, saveState } = defineProps<{
  map: DungeonMap | null;
  viewMode: boolean;
  /** The host's save state, shown in the bar: "Saving…", "Unsaved changes". Absent says nothing. */
  saveState?: string;
  site?: MapStackSource & { id: string };
  /** The site's own bindable children (rooms, nested sites) — only
   *  meaningful with `site`, and only read by the Plan's Spaces panel
   *  (#884 S11) to offer a "Bind to space…" picker. The host already has
   *  this (it built `site` from the same location), so it travels as its
   *  own prop rather than a second query in here. */
  spaces?: BindableSpace[];
}>();

const emit = defineEmits<{ "update:dirty": [boolean]; "update:editRevision": [number] }>();

// Shared, admin-authored tile packs (#889) — replaces the old hardcoded
// BUNDLED_PACKS array entirely. `publishedPacks` is already `sort_order`-
// then-`name` ordered (see useLibraryTilePacks.ts), which is also the
// ordering an admin controls for the picker AND the source of the default.
const { packs: libraryPacksQuery, publishedPacks } = useLibraryTilePacks();
const mapStyleCampaign = useCampaignStore();
const activeCampaignId = computed(() => mapStyleCampaign.activeCampaignId);
const { campaignPacks } = useTilePacks(activeCampaignId, false);
const selectablePacks = computed(() => [
  ...publishedPacks.value.map((pack) => ({
    pack_id: pack.pack_id,
    pack_version: pack.pack_version,
    name: pack.name,
  })),
  ...campaignPacks.value.filter((pack) => pack.status === "ready").map((pack) => ({
    pack_id: pack.pack_id,
    pack_version: pack.pack_version,
    name: pack.name,
  })),
]);

const name = ref("Untitled Map");
// NULL = available in every campaign; new maps default to the active
// campaign, existing ones keep whatever scope they already have (#789) — the
// watch below overwrites this from the loaded map's own campaign_id.
const campaignId = ref<string | null>(activeCampaignId.value);
const layers = ref<DungeonMapLayers>(emptyLayers());
// `useMapCanvasEditor` and the bar both type this as a plain
// Empty until the library query answers. That emptiness is internal
// bookkeeping only — "has a pack been chosen yet" — and nothing downstream
// reads it as a pack id: `packRuntime` misses the map, and every branch that
// means "there is no pack" asks `hasPublishedPacks` or the query below rather
// than comparing this to "". Kept a plain `Ref<string>` because that is what
// `useMapCanvasEditor` takes and what its consumers (`renderMap`,
// `paintOps`) require — and they only ever run once a pack exists, since the
// canvas is replaced by the empty state otherwise.
const currentPackId = ref("");
/** The picker's default: the first published pack, or null when the library
 *  has none. Null rather than "" — absence here is a real answer, and the
 *  one place that turns it into a chosen id does so explicitly. */
const firstPublishedPackId = computed<string | null>(() => publishedPacks.value[0]?.pack_id ?? null);
const hasPublishedPacks = computed(() => publishedPacks.value.length > 0);
// Resolves `currentPackId` once the library query answers, but only while
// nothing else has claimed it yet (a stored `map.default_pack_id` applied by
// `applyMapToState`, or the DM's own pick in the bar) — so a later
// query refetch (e.g. an admin republishing) never clobbers a live choice.
watch(firstPublishedPackId, (id) => {
  if (!currentPackId.value && id) currentPackId.value = id;
}, { immediate: true });
const packLoadError = ref<string | null>(null);
const loadedRuntimes = ref(new Map<string, TilePackRuntime>());
const packRuntime = computed(() => loadedRuntimes.value.get(currentPackId.value) ?? null);
const loadedPackIds = computed(() => new Set(loadedRuntimes.value.keys()));
// True while the canvas has nothing to paint with yet: either the library
// query is still in flight, or a pack id is known but its runtime hasn't
// loaded. Once the query has answered and there simply is no pack (the
// genuinely-empty library case), this settles to false so the overlay below
// can show a real empty state instead of spinning forever.
const awaitingDefaultPack = computed(() => {
  if (libraryPacksQuery.isLoading.value) return true;
  if (!hasPublishedPacks.value) return false;
  return !loadedRuntimes.value.has(currentPackId.value);
});

/** What the status bar calls the active pack. Never the raw `currentPackId`
 *  while it is still unresolved — that would surface the empty string as if
 *  it were a pack's name. */
const packLabel = computed(() => {
  if (packRuntime.value) return packRuntime.value.manifest.name;
  if (libraryPacksQuery.isLoading.value) return "Loading packs…";
  if (!hasPublishedPacks.value) return "No packs published";
  return currentPackId.value;
});
const darkness = ref<DarknessLevel>("daylight");
const dirty = ref(false);
watch(dirty, (v) => emit("update:dirty", v), { immediate: true });

// Bumped on every edit, not just the false→true `dirty` transition — see
// `useMapCanvasEditor.ts`'s `editRevision` docblock for why the host's
// autosave (`useSiteDrawingEditor`) needs this to notice a stroke made while
// `dirty` was already `true` (#884 review finding 1).
const editRevision = ref(0);
watch(editRevision, (rev) => emit("update:editRevision", rev));
/** The setters below (link/annotation) aren't routed through
 *  `useMapCanvasEditor`'s own `markDirty()`, so they bump this directly. */
function markDirty(): void {
  dirty.value = true;
  editRevision.value++;
}

/** The map's name, edited in the host's bar. A rename is an unsaved change like a stroke. */
function setName(next: string): void {
  if (name.value === next) return;
  name.value = next;
  markDirty();
}

/** The Light control: a map-wide setting that, like a stroke, is an unsaved change (and re-arms the site's autosave). */
function setDarkness(level: DarknessLevel): void {
  if (darkness.value === level) return;
  darkness.value = level;
  markDirty();
}

const canvasEl = ref<HTMLCanvasElement | null>(null);

// Tools
/** The rail's clusters, top to bottom: Look, Floor, Walls, Things, Notes, Eraser. */
type RailGroupId = "look" | "floor" | "walls" | "things" | "notes" | "eraser";
interface ToolDef {
  id: Tool;
  label: string;
  icon: Component;
  /** Single keyboard key that activates this tool (lowercase, plain key — no modifiers). */
  shortcut?: string;
  /** Override for the tooltip's key, used for non-keyboard hints like "RMB" on Pan. */
  displayBadge?: string;
  disabled?: boolean;
  group: RailGroupId;
}
// The default tool on open: a DM's first tap must never paint. Select sits first in the
// Look group with Pan: both are "look, don't paint" tools that share the same
// drag-to-pan behaviour. Ids are the stored, keyed names; only the labels were reworded
// (the maintainer's pass of 17 Oct 2026: "Floor brush" and "Brush" were two brushes).
const activeTool = ref<Tool>("select");
const TOOLS: ToolDef[] = [
  { id: "select",   label: "Select",        icon: IconSelect,       displayBadge: "Esc", group: "look" },
  { id: "pan",      label: "Pan",           icon: IconHand,         displayBadge: "RMB", group: "look" },
  { id: "brush",    label: "Brush",         icon: IconCave,         shortcut: "v", group: "floor" },
  { id: "floor",    label: "Tiles",         icon: IconBrush,        shortcut: "b", group: "floor" },
  { id: "rect",     label: "Rectangle",     icon: IconRect,         shortcut: "r", group: "floor" },
  { id: "line",     label: "Line",          icon: IconDrawLine,     shortcut: "l", group: "floor" },
  { id: "template", label: "Room",          icon: IconRoomTemplate, shortcut: "m", group: "floor" },
  { id: "fill",     label: "Fill",          icon: IconFill,         shortcut: "f", group: "floor" },
  { id: "terrain",  label: "Water",         icon: IconWater,        shortcut: "h", group: "floor" },
  { id: "solid",    label: "Rock",          icon: IconCube,         shortcut: "s", group: "floor" },
  { id: "wall",     label: "Wall",          icon: IconWall,         shortcut: "w", group: "walls" },
  { id: "door",     label: "Door",          icon: IconDoor,         shortcut: "d", group: "walls" },
  { id: "wrap",     label: "Wrap",          icon: IconWrapWalls,    shortcut: "x", group: "walls" },
  { id: "stamp",    label: "Object stamp",  icon: IconObjectStamp,  shortcut: "o", group: "things" },
  { id: "dressing", label: "Dressing",      icon: IconDressing,     shortcut: "g", group: "things" },
  { id: "annotate", label: "Label",         icon: IconAnnotate,     shortcut: "t", group: "notes" },
  { id: "link",     label: "Link",          icon: IconEntityLink,   shortcut: "k", group: "notes" },
  // "s" is already Rock's key, so Space takes "p" instead of the frame's literal key (#868).
  { id: "space",    label: "Space",         icon: IconSplitCell,    shortcut: "p", group: "notes" },
  { id: "eraser",   label: "Eraser",        icon: IconEraser,       shortcut: "e", group: "eraser" },
];
const RAIL_GROUP_LABEL: Record<RailGroupId, string> = {
  look: "Look", floor: "Floor", walls: "Walls", things: "Things", notes: "Notes", eraser: "Eraser",
};
// Grouped by the order of RAIL_GROUP_LABEL, so a tool never lands in a cluster the rail does not draw.
const RAIL_GROUPS: RailGroup[] = (Object.keys(RAIL_GROUP_LABEL) as RailGroupId[]).map((id) => ({
  id,
  label: RAIL_GROUP_LABEL[id],
  tools: TOOLS.filter((t) => t.group === id),
}));

// The Plan layer's tools get the same rail.
const PLAN_TOOL_ICONS: Record<PlanTool, AppIcon> = {
  space: IconSplitCell,
  zone: IconHighlight,
  door: IconDoor,
  claim: IconFill,
  erase: IconEraser,
};
const PLAN_RAIL_GROUPS: RailGroup[] = [
  { id: "plan", label: "Plan", tools: PLAN_TOOLS.map((t) => ({ id: t.id, label: t.label, icon: PLAN_TOOL_ICONS[t.id] })) },
];
function onRailTool(id: string): void {
  if (activeLayer.value === "drawing") activeTool.value = id as Tool;
  else plan.planTool.value = id as PlanTool;
}

// M4 — Object stamp tool state
const activeObjectCategory = ref<StampCategory>("objectChest");
const stampRotation = ref(0); // degrees; M6 free rotation (any integer 0–359)

// Wall tool state (tile packs v4): which kind of edge it paints, and which
// `wallDecal` variant the Decal kind sets on an existing wall.
const activeWallKind = ref<WallKind>("wall");
const activeWallDecal = ref(0);

// Dressing tool state (epic #1062): the prop armed in the panel, the rotation a
// new one gets, and the placed prop that is selected.
const dressingBrushId = ref<string | null>(null);
const dressingRotation = ref(0);
const selectedDressingId = ref<string | null>(null);
// Art is loaded for what is on the map and the armed prop, nothing else.
const { catalog: dressingCatalog, load: loadDressingCatalog } = useDressingCatalog(() => {
  const ids = Object.values(layers.value.dressing).map((placement) => placement.prop_id);
  return dressingBrushId.value ? [...ids, dressingBrushId.value] : ids;
});

// M6 — Room template tool state
type TemplateShape = "circle" | "octagon" | "hex";
const activeTemplateShape = ref<TemplateShape>("circle");
const TEMPLATE_SHAPES: { id: TemplateShape; label: string; icon: string }[] = [
  { id: "circle",  label: "Circle",   icon: "○" },
  { id: "octagon", label: "Octagon",  icon: "⬡" },
  { id: "hex",     label: "Hex",      icon: "⬢" },
];

// Round brush radius in cells (fractional)
const brushRadius = ref(1.5);

// M4 — Cell selection (annotate + link tools)
const selectedCell = ref<[number, number] | null>(null);
/**
 * The label field lives inside CartographerToolOptions, which exposes it.
 *
 * This used to be a local `ref<HTMLInputElement>` that was never bound to anything,
 * so `.focus()` silently did nothing every time a cell was selected with the label
 * tool. Reaching through the options component is what makes the focus actually land.
 */
const toolOptionsRef = ref<{ annotationInputEl: AppInputHandle | null } | null>(null);

// M4 — Map metadata (entity links), lives alongside layers
const metadata = ref<Record<CellKey, CellMetadata>>({});

// #868 — derived structure (spaces/ways/zones/links). See
// useCartographerStructure.ts for what each field means. The Structure
// tools' own pointer dispatch (`structureTools`) is built inside
// useMapCanvasEditor below — it needs the same undo snapshot/pushCommand
// pair every other one-shot tool there uses.
const mapPropRef = computed(() => map);
const structure = useCartographerStructure(layers, metadata, mapPropRef);
const { data: publishedSites } = usePublishedSites(computed(() => map?.id ?? ""));

// M4 — Entity options for the link picker
const { data: notesData } = useNotes();
const { data: encountersData } = useEncounters();
const noteOptions = computed(() =>
  (notesData.value ?? []).map((n) => ({ id: n.id, name: (n as { id: string; title: string }).title })),
);
const encounterOptions = computed(() =>
  (encountersData.value ?? []).map((e) => ({ id: e.id, name: e.name })),
);

// #804 — hazard/feature glyph resolution. `includeAllScopes` because a cell's
// trap_id/feature_id must keep resolving even after its target is scoped out
// of the active campaign, same rule useLocationPlacements documents.
// Pickers offer the scoped pick list (library shadowed by own rows); what a cell
// already holds resolves through byId with every scope, so it keeps rendering
// after its target is scoped out of the active campaign or shadowed by a copy.
const { data: pickTrapsData } = useTrapIndex();
const { data: pickFeaturesData } = useDungeonFeatureIndex();
const { byId: trapsById } = useTrapIndex(() => ({ includeAllScopes: true }));
const { byId: featuresById } = useDungeonFeatureIndex(() => ({ includeAllScopes: true }));
// The picker offers the scoped list plus whatever the selected cell already
// holds, so an out-of-scope or shadowed value still displays and stays selectable.
function withCurrent(
  picked: ReadonlyArray<{ id: string; name: string }>,
  current: { id: string; name: string } | undefined,
): { id: string; name: string }[] {
  const options = picked.map((r) => ({ id: r.id, name: r.name }));
  if (current && !options.some((o) => o.id === current.id)) options.push({ id: current.id, name: current.name });
  return options;
}
const trapOptions = computed(() =>
  withCurrent(pickTrapsData.value ?? [], trapsById.value.get(linkedTrapId.value)),
);
const featureOptions = computed(() =>
  withCurrent(pickFeaturesData.value ?? [], featuresById.value.get(linkedFeatureId.value)),
);
const cellGlyphs = computed(() => resolveCellGlyphs(metadata.value, trapsById.value, featuresById.value));

// Writable computeds for the Link tool's pickers
const linkedNoteId = computed({
  get: () => (selectedCell.value ? (metadata.value[cellKey(...selectedCell.value)]?.note_id ?? "") : ""),
  set: (id: string) => {
    if (!selectedCell.value) return;
    const k = cellKey(...selectedCell.value);
    metadata.value[k] = { ...metadata.value[k], note_id: id || undefined };
    markDirty();
  },
});
const linkedEncounterId = computed({
  get: () => (selectedCell.value ? (metadata.value[cellKey(...selectedCell.value)]?.encounter_id ?? "") : ""),
  set: (id: string) => {
    if (!selectedCell.value) return;
    const k = cellKey(...selectedCell.value);
    metadata.value[k] = { ...metadata.value[k], encounter_id: id || undefined };
    markDirty();
  },
});
const linkedTrapId = computed({
  get: () => (selectedCell.value ? (metadata.value[cellKey(...selectedCell.value)]?.trap_id ?? "") : ""),
  set: (id: string) => {
    if (!selectedCell.value) return;
    const k = cellKey(...selectedCell.value);
    metadata.value[k] = { ...metadata.value[k], trap_id: id || undefined };
    markDirty();
  },
});
const linkedFeatureId = computed({
  get: () => (selectedCell.value ? (metadata.value[cellKey(...selectedCell.value)]?.feature_id ?? "") : ""),
  set: (id: string) => {
    if (!selectedCell.value) return;
    const k = cellKey(...selectedCell.value);
    metadata.value[k] = { ...metadata.value[k], feature_id: id || undefined };
    markDirty();
  },
});

// Annotation text for the selected cell — updates layers live, undo pushed on blur
const annotationText = computed({
  get: () => (selectedCell.value ? (layers.value.annotation[cellKey(...selectedCell.value)]?.text ?? "") : ""),
  set: (v: string) => {
    if (!selectedCell.value) return;
    const k = cellKey(...selectedCell.value);
    if (!v.trim()) {
      const next = { ...layers.value.annotation };
      delete next[k];
      layers.value.annotation = next;
    } else {
      layers.value.annotation[k] = { text: v.trim() };
    }
    markDirty();
  },
});

// ── Select tool ─────────────────────────────────────────────────
// A read-only summary of the selected cell for the Select tool's options.
// Computed here, not in the options: they are presentation-only
// everywhere else in this file (annotationText/linkedNoteId etc. are the
// same "MapWorkbench computes, the panel just renders" shape), and only
// MapWorkbench holds `layers` plus the id->name option lists a link name
// needs to resolve. E/S edges read from the NEIGHBOURING cell's W/N per the
// "NW ownership" rule (context/features/cartographer.md, "Edge ownership
// rule") — a cell only ever stores its own N/W.
function edgeSegAt(x: number, y: number, side: "N" | "E" | "S" | "W") {
  if (side === "N") return layers.value.floor[cellKey(x, y)]?.wallN;
  if (side === "W") return layers.value.floor[cellKey(x, y)]?.wallW;
  if (side === "S") return layers.value.floor[cellKey(x, y + 1)]?.wallN;
  return layers.value.floor[cellKey(x + 1, y)]?.wallW;
}

const selectedCellFloor = computed(() => {
  if (!selectedCell.value) return false;
  const [x, y] = selectedCell.value;
  return !!layers.value.floor[cellKey(x, y)]?.floor;
});

const selectedCellSolid = computed(() => {
  if (!selectedCell.value) return false;
  const [x, y] = selectedCell.value;
  return !!layers.value.solidBlock[cellKey(x, y)];
});

const selectedCellEdges = computed(() => {
  if (!selectedCell.value) return [];
  const [x, y] = selectedCell.value;
  return (["N", "E", "S", "W"] as const)
    .map((side) => {
      const seg = edgeSegAt(x, y, side);
      return { side, kind: seg?.type, decal: seg?.decal };
    })
    .filter((e): e is { side: "N" | "E" | "S" | "W"; kind: EdgeSegType; decal: number | undefined } => !!e.kind);
});

const selectedCellObjectCategory = computed(() => {
  if (!selectedCell.value) return null;
  const [x, y] = selectedCell.value;
  return layers.value.object[cellKey(x, y)]?.category ?? null;
});

const selectedCellLinkedNames = computed(() => {
  if (!selectedCell.value) return [];
  const names: string[] = [];
  const noteName = noteOptions.value.find((o) => o.id === linkedNoteId.value)?.name;
  if (noteName) names.push(`Note: ${noteName}`);
  const encounterName = encounterOptions.value.find((o) => o.id === linkedEncounterId.value)?.name;
  if (encounterName) names.push(`Encounter: ${encounterName}`);
  const trapName = trapsById.value.get(linkedTrapId.value)?.name;
  if (trapName) names.push(`Trap: ${trapName}`);
  const featureName = featuresById.value.get(linkedFeatureId.value)?.name;
  if (featureName) names.push(`Feature: ${featureName}`);
  return names;
});

// The selected placed prop as the Dressing panel shows it. A prop whose book was
// switched off still resolves (the catalog holds every library prop), so
// "Unknown prop" means the row is gone from the library altogether.
const selectedDressingInfo = computed(() => {
  const id = selectedDressingId.value;
  const placement = id ? layers.value.dressing[id] : undefined;
  if (!placement) return null;
  return { name: dressingCatalog.value.get(placement.prop_id)?.name ?? "Unknown prop", rotation: placement.rotation };
});

// A brushed cell under half covered has an area entry but no floor, so count both.
const cellsPainted = computed(() => new Set([...Object.keys(layers.value.floor), ...Object.keys(layers.value.area)]).size);
const activeToolLabel = computed(() => TOOLS.find((t) => t.id === activeTool.value)?.label ?? activeTool.value);

// Tools Alt inverts into an erase mirror — see useMapCanvasEditor.ts's
// toolPointerDown/Move/Up. Select/Pan/Fill/Wrap/Annotate/Link/Eraser/Space
// have nothing to invert, so they're deliberately absent here.
const INVERTIBLE_TOOLS = new Set<Tool>([
  "floor", "terrain", "brush", "solid", "wall", "stamp", "dressing", "door", "rect", "line", "template",
]);

/** The options slip's title: the Drawing tool (with " · erase" appended while
 *  Alt is held over a tool that has an inverse), or on the Plan the tool
 *  and, for a Space or Zone, how it is being traced ("Space · Pen"). */
const canvasToolLabel = computed(() => {
  if (activeLayer.value === "drawing") {
    const label = activeToolLabel.value;
    return altHeld.value && INVERTIBLE_TOOLS.has(activeTool.value) ? `${label} · erase` : label;
  }
  const tool = plan.planTool.value;
  const toolLabel = PLAN_TOOLS.find((t) => t.id === tool)?.label ?? tool;
  if (tool !== "space" && tool !== "zone") return toolLabel;
  const trace = TRACE_TOOL_OPTIONS.find((o) => o.value === plan.traceTool.value)?.label;
  return trace ? `${toolLabel} · ${trace}` : toolLabel;
});

// "N regions changed since last publish" — only meaningful once the map has
// been published at least once (a brand-new drawing has nothing to compare
// against, and `changedSinceLastPublish` is null until then anyway).
const changedRegionsCaution = computed(() => {
  const delta = structure.changedSinceLastPublish.value;
  if (!delta || delta.total === 0 || (publishedSites.value?.length ?? 0) === 0) return null;
  return `${delta.total} region${delta.total === 1 ? "" : "s"} changed since last publish`;
});

// ── Reference layer (#884 S6) — the embedded case's site Picture ──────────
const stack = computed(() => buildMapStack(site ?? null));
const referencePicture = computed(() => stack.value.picture);
const showPictureReference = ref(true);
const referenceImageEl = ref<HTMLImageElement | null>(null);
watch(
  () => referencePicture.value?.url ?? null,
  (url) => {
    referenceImageEl.value = null;
    if (!url) return;
    const img = new Image();
    img.onload = () => { referenceImageEl.value = img; };
    img.src = url;
  },
  { immediate: true },
);

/** Where the site's Picture draws on THIS frame's canvas, in device pixels —
 *  cell (origin_cell_x, origin_cell_y)'s corner lines up with this frame's
 *  own cell of the same coordinates, same cell space a Drawing publish
 *  already shares with its Picture (see `lib/locations/mapStack.ts`). */
function buildReferenceImage(tilePx: number, viewportOffset: { x: number; y: number }): MapRenderReferenceImage | null {
  if (!showPictureReference.value) return null;
  const picture = referencePicture.value;
  const img = referenceImageEl.value;
  if (!picture || !img || !picture.calibration) return null;
  const cal = picture.calibration;
  if (cal.cells_per_image_width <= 0 || img.naturalWidth <= 0) return null;
  const cellPx = img.naturalWidth / cal.cells_per_image_width;
  if (cellPx <= 0) return null;
  const scale = tilePx / cellPx;
  const originCellX = cal.origin_cell_x ?? 0;
  const originCellY = cal.origin_cell_y ?? 0;
  const originPxX = cal.origin_x_pct * img.naturalWidth;
  const originPxY = cal.origin_y_pct * img.naturalHeight;
  const cellOriginX = originCellX * tilePx - viewportOffset.x;
  const cellOriginY = originCellY * tilePx - viewportOffset.y;
  return {
    source: img,
    x: cellOriginX - originPxX * scale,
    y: cellOriginY - originPxY * scale,
    width: img.naturalWidth * scale,
    height: img.naturalHeight * scale,
    opacity: 0.45,
  };
}

// ── Plan layer (#884 S7b) — the site's own `location_map_regions`/
// `location_doors`, traced directly on this canvas once a `site` is given.
// Built unconditionally (like `usePublishedSites` above): every query inside
// `usePlanPalette` is `enabled`-guarded on a real site id, so this is inert
// — no request, no mutation possible — on the standalone route, which has
// no `site` at all and so never shows the layer selector that would let a
// DM reach `activeLayer.value = "plan"` in the first place.
const siteId = computed(() => site?.id ?? null);
const plan = usePlanPalette(siteId);
// Initial layer (#878 S2): a DM opening Build on a site that already has a
// Drawing or a Picture came here to trace it, so land on Plan directly — the
// old unconditional "drawing" default was the whole reason the Plan's own
// Pen/Shape tracing tools went unfound (issue #878, item 3). A site with
// nothing drawn yet has no image to trace *over*, so Drawing is still the
// honest first step there. `hasAnyMapLayer` (mapStack.ts) is deliberately the
// one reader of "does this place have a map" — this must not grow its own
// `!!map_url` test. Read ONCE at setup, not watched: once the DM picks a
// layer by hand, that choice stands for the rest of the session (see
// LAYER_OPTIONS's SegmentedControl above, which is the only other writer of
// this ref). The standalone `/cartographer/:id` route passes no `site` at
// all, so `site &&` short-circuits it to "drawing" unconditionally, same as
// before.
const activeLayer = ref<"drawing" | "plan">(site && hasAnyMapLayer(site) ? "plan" : "drawing");
// "Drawing" and "Plan" are the site workbench's own words (#884) and mean nothing to
// someone opening Build for the first time, so each says what it is for in its tooltip.
const LAYER_OPTIONS: SegmentedOption<"drawing" | "plan">[] = [
  { value: "drawing", label: "Drawing", tooltip: "The map itself: paint floors, walls, doors and objects on the grid." },
  { value: "plan", label: "Plan", tooltip: "The rooms: outline each space and link it to its place, so the map knows which room is which." },
];

// ── The right drawer: one panel at a time over the canvas's edge. Plan opens on its own
// lists (they are how a traced shape is bound to a room); Dressing opens with its tool,
// because the props are picked there; Spaces is the DM's to open.
type DrawerId = "spaces" | "dressing" | "plan";
const drawer = ref<DrawerId | null>(activeLayer.value === "plan" ? "plan" : null);
const spacesDrawerId = computed<DrawerId>(() => (activeLayer.value === "plan" ? "plan" : "spaces"));
const DRAWER_TITLE: Record<DrawerId, string> = { spaces: "Spaces on this map", dressing: "Dressing", plan: "Spaces and zones" };
const drawerTitle = computed(() => (drawer.value ? DRAWER_TITLE[drawer.value] : ""));
function toggleSpaces(): void {
  drawer.value = drawer.value === spacesDrawerId.value ? null : spacesDrawerId.value;
}
watch(activeLayer, (layer) => {
  drawer.value = layer === "plan" ? "plan" : null;
});
watch(activeTool, (tool) => {
  if (activeLayer.value !== "drawing") return;
  if (tool === "dressing") drawer.value = "dressing";
  else if (drawer.value === "dressing") drawer.value = null;
});

/** The Plan's own Spaces/Zones panels (#884 S11) set `activeRegionId` via
 *  their "Trace" buttons the same way the Atlas's region list always has —
 *  this also swaps the Plan's own tool to match, so the canvas is actually
 *  armed to paint into whichever role the DM just picked (a bare
 *  `activeRegionId` write does nothing while `planTool` still points at
 *  Door or Claim, per `usePlanCanvasTools.ts`'s `isTraceTool()`). */
function setPlanActiveRegion(id: string | null, role: RegionRole): void {
  plan.activeRegionId.value = id;
  if (id) plan.planTool.value = role;
}

// ── Canvas engine (#884 S6) — viewport, pointer/paint dispatch, undo/redo,
// variant picking, the render loop. See useMapCanvasEditor.ts.
const {
  zoom, hoverCell, altHeld, canUndo, canRedo, undoEdit, redoEdit, centerMap,
  onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onDoubleClick, onWheel, structureTools,
  rotateSelectedDressing, deleteSelectedDressing,
} = useMapCanvasEditor({
  canvasEl, layers, metadata, dirty, editRevision, currentPackId, darkness, packRuntime, selectablePacks, loadedRuntimes,
  dressing: dressingCatalog, dressingBrushId, dressingRotation, selectedDressingId, cellGlyphs, activeTool, tools: TOOLS, viewMode: () => viewMode,
  activeObjectCategory, stampRotation, activeWallKind, activeWallDecal, activeTemplateShape, brushRadius,
  selectedCell, toolOptionsRef, structure, mapKey: computed(() => map?.id || "new"),
  getReferenceImage: buildReferenceImage,
  extraRenderDeps: [showPictureReference, referenceImageEl],
  plan, activeLayer,
});

// ── Pack load ───────────────────────────────────────────────────────────────

async function ensurePackLoaded(): Promise<void> {
  // Every published library pack is eagerly preloaded, same as the old
  // BUNDLED_PACKS behaviour — a per-pack try/catch so one pack's missing
  // manifest or dead CDN object can't take the whole picker down. A pack
  // whose art hasn't been generated yet (or 404s) still resolves: `loadPack`
  // only rejects on a bad manifest fetch, never on an individual tile image
  // failing to load — those fall back to procedural placeholders inside
  // `packLoader.ts`, and that fallback is load-bearing, not a bug to guard
  // against here.
  const toLoad = publishedPacks.value.filter((p) => !loadedRuntimes.value.has(p.pack_id));
  await Promise.all(
    toLoad.map(async (pack) => {
      try {
        loadedRuntimes.value.set(pack.pack_id, await loadLibraryPack(pack));
      } catch (e) {
        if (pack.pack_id === currentPackId.value) {
          packLoadError.value = e instanceof Error ? e.message : String(e);
        }
      }
    }),
  );
  const customToLoad = campaignPacks.value.filter((pack) =>
    pack.status === "ready" && !loadedRuntimes.value.has(pack.pack_id)
  );
  await Promise.all(customToLoad.map(async (pack) => {
    try {
      loadedRuntimes.value.set(pack.pack_id, await loadUserPack(pack));
    } catch (error) {
      if (pack.pack_id === currentPackId.value) {
        packLoadError.value = error instanceof Error ? error.message : String(error);
      }
    }
  }));
}

watch(publishedPacks, () => { void ensurePackLoaded(); });
watch(campaignPacks, () => { void ensurePackLoaded(); });
onMounted(() => { void ensurePackLoaded(); });

// ── Map load ───────────────────────────────────────────────────────────────

function cloneLayers(src: DungeonMapLayers | null | undefined): DungeonMapLayers {
  if (!src) return emptyLayers();
  // JSON round-trip — layers are pure data, and this strips Vue's readonly proxy
  // wrapping that comes off TanStack Query's cached result so the editor owns a
  // writable copy.
  return withLayerDefaults(JSON.parse(JSON.stringify(src)) as Partial<DungeonMapLayers>);
}

/** (Re)initializes every editable field from `m` — the `map` prop's watcher,
 *  and `resetEdits()`'s implementation for Cancel. */
function applyMapToState(m: DungeonMap | null): void {
  if (m) {
    name.value = m.name;
    campaignId.value = m.campaign_id;
    darkness.value = m.darkness;
    layers.value = cloneLayers(m.layers);
    metadata.value = JSON.parse(JSON.stringify(m.metadata ?? {})) as Record<CellKey, CellMetadata>;
    // Neither present means the library has not answered yet; keep whatever
    // is there and let the `firstPublishedPackId` watch above resolve it.
    currentPackId.value = m.default_pack_id ?? firstPublishedPackId.value ?? currentPackId.value;
  }
  dirty.value = false;
}

watch(() => map, (m) => applyMapToState(m ?? null), { immediate: true });

/** Cancel — discard in-progress edits, restore the last-loaded `map` prop. */
function resetEdits(): void {
  applyMapToState(map ?? null);
}

/** Called by the host once its Save mutation resolves. */
function markSaved(): void {
  dirty.value = false;
}

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
});
</script>
