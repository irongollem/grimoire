<template>
  <div class="flex flex-col lg:flex-row gap-3 mt-2">
    <!-- Toolbox -->
    <div v-if="!viewMode" class="flex flex-col gap-2">
      <!-- Layer selector (#884 S7b) — only with a site: standalone
           /cartographer/:id has no Plan to switch to, so it never renders
           there, and `activeLayer` stays "drawing" forever. -->
      <SegmentedControl
        v-if="site"
        :model-value="activeLayer"
        :options="LAYER_OPTIONS"
        size="xs"
        block
        @update:model-value="activeLayer = $event"
      />
      <CartographerToolPalette
        v-if="activeLayer === 'drawing'"
        :tools="TOOLS"
        :active-tool="activeTool"
        @update:active-tool="activeTool = $event as Tool"
      />
      <CartographerPlanPalette
        v-else
        :plan-tool="plan.planTool.value"
        :trace-tool="plan.traceTool.value"
        :template-shape="plan.templateShape.value"
        :zone-kind="plan.zoneKind.value"
        :zone-label="plan.zoneLabel.value"
        @update:plan-tool="plan.planTool.value = $event"
        @update:trace-tool="plan.traceTool.value = $event"
        @update:template-shape="plan.templateShape.value = $event"
        @update:zone-kind="plan.zoneKind.value = $event"
        @update:zone-label="plan.zoneLabel.value = $event"
        @start-new="plan.planTool.value === 'zone' ? plan.startNewZone() : plan.startNewSpace()"
      />
    </div>

    <!-- Canvas -->
    <div class="flex-1 min-w-0 relative bg-card border border-border rounded-lg overflow-hidden" style="min-height: 60vh">
      <canvas
        ref="canvasEl"
        class="block w-full h-full touch-none"
        :class="viewMode ? 'cursor-default' : 'cursor-crosshair'"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointerleave="onPointerUp"
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
        <span>
          Brush: <strong class="text-foreground">{{ activeToolLabel }}</strong>
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
        <AppButton
          variant="ghost"
          fill="muted"
          size="icon-xs"
          :disabled="!canUndo"
          tooltip="Undo (Ctrl+Z)"
          aria-label="Undo"
          :icon="IconUndo"
          @click="undoEdit"
        />
        <AppButton
          variant="ghost"
          fill="muted"
          size="icon-xs"
          :disabled="!canRedo"
          tooltip="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
          :icon="IconRedo"
          @click="redoEdit"
        />
        <span>
          Pack: <strong class="text-foreground">{{ packRuntime?.manifest.name ?? currentPackId }}</strong>
          <span v-if="packLoadError" class="text-red-500"> ({{ packLoadError }})</span>
        </span>
        <span v-if="cellsPainted > 0">
          Floor cells: <strong class="text-foreground">{{ cellsPainted }}</strong>
        </span>
        <span v-if="changedRegionsCaution" class="ml-auto text-amber-500">{{ changedRegionsCaution }}</span>
      </div>

      <!-- Space tool hint -->
      <div
        v-if="!viewMode && activeTool === 'space'"
        class="absolute top-2 left-2 px-2 py-1 rounded-md bg-card/95 border border-border text-caption-sm text-muted-foreground"
      >
        Space tool — click a floor region to claim it
      </div>

      <!-- Reference-layer toggle (#884 S6) — only when embedded with a site whose
           Picture we can show underneath. Standalone /cartographer/:id passes no
           site, so this never renders there. -->
      <div
        v-if="referencePicture"
        class="absolute top-2 right-2 px-2 py-1 rounded-md bg-card/95 border border-border"
      >
        <AppCheckbox v-model="showPictureReference" label="Reference" size="sm" />
      </div>

      <!-- Overlay hint while the default pack loads -->
      <div
        v-if="!loadedRuntimes.has(DEFAULT_PACK_ID)"
        class="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm"
      >
        <LoadingSpinner />
      </div>
    </div>

    <!-- Inspector + Structure (Drawing), or the Plan's own Spaces/Zones
         panels (#884 S11) — the Plan palette on the left decides which
         GESTURE a click means; binding a traced shape to a room, naming it,
         and deleting it stay panel actions, which is what these two give it
         once a site is embedded. Standalone /cartographer/:id has no site
         and so always takes the Drawing branch. -->
    <div v-if="!viewMode" class="flex flex-col gap-3">
      <template v-if="site && activeLayer === 'plan'">
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
      </template>
      <template v-else>
        <CartographerInspectorPanel
          ref="inspectorPanelRef"
          :name="name"
          :campaign-id="campaignId"
          :current-pack-id="currentPackId"
          :bundled-packs="selectablePacks"
          :loaded-pack-ids="loadedPackIds"
          :pack-validation-missing="packRuntime?.validation.missing.length ?? 0"
          :active-tool="activeTool"
          :active-object-category="activeObjectCategory"
          :object-categories="OBJECT_CATEGORIES"
          :stamp-rotation="stampRotation"
          :selected-cell="selectedCell"
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
          :cave-radius="caveRadius"
          @update:name="name = $event"
          @update:campaign-id="campaignId = $event"
          @update:current-pack-id="currentPackId = $event"
          @update:active-object-category="activeObjectCategory = $event as ObjectCategory"
          @update:stamp-rotation="stampRotation = $event"
          @update:annotation-text="annotationText = $event"
          @update:linked-note-id="linkedNoteId = $event"
          @update:linked-encounter-id="linkedEncounterId = $event"
          @update:linked-trap-id="linkedTrapId = $event"
          @update:linked-feature-id="linkedFeatureId = $event"
          @update:active-template-shape="activeTemplateShape = $event as TemplateShape"
          @update:cave-radius="caveRadius = $event"
        />
        <CartographerStructurePanel
          :space-rows="structure.spaceRows.value"
          :selected-space-inspector="structure.selectedSpaceInspector.value"
          :published-sites="publishedSites ?? []"
          :map-rev="map?.rev ?? 0"
          @select-space="(key) => (structure.selectedSpaceKey.value = key)"
          @rename-space="structureTools.onRenameSpace"
          @redetect="structure.redetect"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
// The Cartographer's editing surface, extracted out of CartographerEditorView
// (epic #884 S6) so it can be embedded both at `/cartographer/:id` and,
// later, inside the Atlas's map area. This component owns the toolbox, the
// canvas (via `useMapCanvasEditor`), the contextual inspector, the structure
// rail, and tile-pack loading. It does NOT read `useRoute`/`useRouter` or any
// route query — the host decides routing, this only edits a map.
//
// ── Props ────────────────────────────────────────────────────────────────
// `map`      — the persisted `dungeon_maps` row to edit, or null for an
//               unsaved new map / while the host's query is still loading.
//               Changing it re-initializes every editable field (same rule
//               the pre-extraction view's `watch(loadedMap, ...)` followed).
// `viewMode` — read-only display: pan/zoom only, no toolbox, no inspector,
//               no painting. The host derives this from its own route query.
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
//   getName / getCampaignId / getLayers / getMetadata / getCurrentPackId
//   getRuntimes       — loaded tile-pack runtimes, keyed by pack id
//   getCellGlyphs     — resolved hazard/feature/note/encounter glyphs (#804)
//   getStructure      — derived spaces/ways/zones/links, Publish's input
//   getCellsPainted / getPackName — the status line's two workbench-owned segments
//   isDirty           — imperative read of the same flag `update:dirty` emits
//   getEditRevision   — imperative read of the same counter `update:editRevision` emits
//   resetEdits()      — discard in-progress edits, restore from `map` prop (Cancel)
//   markSaved()       — clear the dirty flag after the host's mutation resolves
import { computed, onMounted, ref, watch, type Component } from "vue";

import {
  IconBrush,
  IconEraser,
  IconHand,
  IconCenter,
  IconUndo,
  IconRedo,
  IconWall,
  IconDoor,
  IconCube,
  IconRect,
  IconPenLine,
  IconFill,
  IconWrapWalls,
  IconObjectStamp,
  IconAnnotate,
  IconEntityLink,
  IconRoomTemplate,
  IconCave,
  IconSplitCell,
} from "@/lib/icons";

import type { AppInputHandle } from "@/components/common/fieldVariants";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import CartographerToolPalette, { type ToolGroup } from "@/components/cartographer/CartographerToolPalette.vue";
import CartographerPlanPalette from "@/components/cartographer/CartographerPlanPalette.vue";
import CartographerInspectorPanel from "@/components/cartographer/CartographerInspectorPanel.vue";
import CartographerStructurePanel from "@/components/cartographer/CartographerStructurePanel.vue";
import SiteMapRegionList from "@/components/locations/SiteMapRegionList.vue";
import SiteMapZoneList from "@/components/locations/SiteMapZoneList.vue";
import { useCartographerStructure } from "@/composables/cartographer/useCartographerStructure";
import { useMapCanvasEditor } from "@/composables/cartographer/useMapCanvasEditor";
import { usePlanPalette } from "@/composables/cartographer/usePlanPalette";
import { usePublishedSites } from "@/composables/cartographer/usePublishedSites";

import { useNotes } from "@/composables/notes/useNotes";
import { useEncounters } from "@/composables/encounters/useEncounters";
import { useTraps } from "@/composables/dungeon-features/useTraps";
import { useDungeonFeatures } from "@/composables/dungeon-features/useDungeonFeatures";
import { loadUserPack, useTilePacks } from "@/composables/cartographer/useTilePacks";
import { useCampaignStore } from "@/stores/campaign";
import type { Tool } from "@/cartographer/tools";
import {
  emptyLayers,
  cellKey,
  type CellKey,
  type DungeonMap,
  type DungeonMapLayers,
  type CellMetadata,
} from "@/types/dungeonMap.types";
import { OBJECT_CATEGORIES, type ObjectCategory } from "@/cartographer/packSchema";
import { loadPack, type TilePackRuntime } from "@/cartographer/packLoader";
import type { MapRenderReferenceImage } from "@/cartographer/renderMap";
import { resolveCellGlyphs } from "@/cartographer/glyphs";
import { buildMapStack, hasAnyMapLayer, type MapStackSource } from "@/lib/locations/mapStack";
import type { BindableSpace, RegionRole } from "@/types/locationMapRegion.types";

const { map, viewMode, site, spaces } = defineProps<{
  map: DungeonMap | null;
  viewMode: boolean;
  site?: MapStackSource & { id: string };
  /** The site's own bindable children (rooms, nested sites) — only
   *  meaningful with `site`, and only read by the Plan's Spaces panel
   *  (#884 S11) to offer a "Bind to space…" picker. The host already has
   *  this (it built `site` from the same location), so it travels as its
   *  own prop rather than a second query in here. */
  spaces?: BindableSpace[];
}>();

const emit = defineEmits<{ "update:dirty": [boolean]; "update:editRevision": [number] }>();

const BUNDLED_PACKS = [
  { pack_id: "stone-dungeon", pack_version: 1, name: "Stone Dungeon",  manifestUrl: "/cartographer/stone-dungeon/v1/manifest.json" },
  { pack_id: "icy-cave",      pack_version: 1, name: "Icy Cave",       manifestUrl: "/cartographer/icy-cave/v1/manifest.json" },
  { pack_id: "wood-interior", pack_version: 1, name: "Wood Interior",  manifestUrl: "/cartographer/wood-interior/v1/manifest.json" },
  { pack_id: "sandy-ruins",   pack_version: 1, name: "Sandy Ruins",    manifestUrl: "/cartographer/sandy-ruins/v1/manifest.json" },
  { pack_id: "forest",        pack_version: 1, name: "Forest",         manifestUrl: "/cartographer/forest/v1/manifest.json" },
  { pack_id: "black-rock",    pack_version: 1, name: "Black Rock",     manifestUrl: "/cartographer/black-rock/v1/manifest.json" },
  { pack_id: "lava-cavern",   pack_version: 1, name: "Lava Cavern",    manifestUrl: "/cartographer/lava-cavern/v1/manifest.json" },
  { pack_id: "underdark",     pack_version: 1, name: "Underdark",      manifestUrl: "/cartographer/underdark/v1/manifest.json" },
  { pack_id: "water",         pack_version: 1, name: "Water",          manifestUrl: "/cartographer/water/v1/manifest.json" },
  { pack_id: "sewer-swamp",   pack_version: 1, name: "Sewer / Swamp",  manifestUrl: "/cartographer/sewer-swamp/v1/manifest.json" },
  { pack_id: "marble-palace", pack_version: 1, name: "Marble Palace",  manifestUrl: "/cartographer/marble-palace/v1/manifest.json" },
] as const;
const DEFAULT_PACK_ID = "stone-dungeon";
const mapStyleCampaign = useCampaignStore();
const activeCampaignId = computed(() => mapStyleCampaign.activeCampaignId);
const { campaignPacks } = useTilePacks(activeCampaignId, false);
const selectablePacks = computed(() => [
  ...BUNDLED_PACKS,
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
const currentPackId = ref(DEFAULT_PACK_ID);
const packLoadError = ref<string | null>(null);
const loadedRuntimes = ref(new Map<string, TilePackRuntime>());
const packRuntime = computed(() => loadedRuntimes.value.get(currentPackId.value) ?? null);
const loadedPackIds = computed(() => new Set(loadedRuntimes.value.keys()));
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

const canvasEl = ref<HTMLCanvasElement | null>(null);

// Tools
interface ToolDef {
  id: Tool;
  label: string;
  icon: Component;
  /** Single keyboard key that activates this tool (lowercase, plain key — no modifiers). */
  shortcut?: string;
  /** Override for the visible kbd badge — used for non-keyboard hints like "RMB" on Pan. */
  displayBadge?: string;
  disabled?: boolean;
  /** Defaults to "draw" in the palette. #868 adds "structure" (Space, Zone,
   *  Link entity — moved out of Draw) and tags Pan as "view". */
  group?: ToolGroup;
}
const activeTool = ref<Tool>("floor");
const TOOLS: ToolDef[] = [
  { id: "floor",    label: "Floor brush",   icon: IconBrush,        shortcut: "b" },
  { id: "eraser",   label: "Eraser",        icon: IconEraser,       shortcut: "e" },
  { id: "wall",     label: "Wall",          icon: IconWall,         shortcut: "w" },
  { id: "door",     label: "Door",          icon: IconDoor,         shortcut: "d" },
  { id: "solid",    label: "Solid block",   icon: IconCube,         shortcut: "s" },
  { id: "stamp",    label: "Object stamp",  icon: IconObjectStamp,  shortcut: "o" },
  { id: "rect",     label: "Rectangle",     icon: IconRect,         shortcut: "r" },
  { id: "line",     label: "Line",          icon: IconPenLine,      shortcut: "l" },
  { id: "fill",     label: "Fill",          icon: IconFill,         shortcut: "f" },
  { id: "wrap",     label: "Wrap walls",    icon: IconWrapWalls,    shortcut: "x" },
  { id: "annotate",  label: "Annotate",       icon: IconAnnotate,     shortcut: "t" },
  // Structure group (#868) — "s" is already Solid block's shortcut, so Space
  // takes "p" instead of the frame's literal key; see the story report.
  { id: "space",     label: "Space",          icon: IconSplitCell,    shortcut: "p", group: "structure" },
  { id: "link",      label: "Link entity",    icon: IconEntityLink,   shortcut: "k", group: "structure" },
  { id: "template",  label: "Room template",  icon: IconRoomTemplate, shortcut: "m" },
  { id: "cave",      label: "Cave brush",     icon: IconCave,         shortcut: "v" },
  { id: "pan",       label: "Pan",            icon: IconHand,         displayBadge: "RMB", group: "view" },
];

// M4 — Object stamp tool state
const activeObjectCategory = ref<ObjectCategory>("objectChest");
const stampRotation = ref(0); // degrees; M6 free rotation (any integer 0–359)

// M6 — Room template tool state
type TemplateShape = "circle" | "octagon" | "hex";
const activeTemplateShape = ref<TemplateShape>("circle");
const TEMPLATE_SHAPES: { id: TemplateShape; label: string; icon: string }[] = [
  { id: "circle",  label: "Circle",   icon: "○" },
  { id: "octagon", label: "Octagon",  icon: "⬡" },
  { id: "hex",     label: "Hex",      icon: "⬢" },
];

// M6 — Cave brush state
const caveRadius = ref(5);

// M4 — Cell selection (annotate + link tools)
const selectedCell = ref<[number, number] | null>(null);
/**
 * The annotation field lives inside CartographerInspectorPanel, which exposes it.
 *
 * This used to be a local `ref<HTMLInputElement>` that was never bound to anything,
 * so `.focus()` below silently did nothing every time a cell was selected with the
 * annotate tool — the panel's own `ref="inspectorPanelRef"` was already on the
 * component but had no backing ref either. Reaching through the panel is what makes
 * the focus actually land.
 */
const inspectorPanelRef = ref<{ annotationInputEl: AppInputHandle | null } | null>(null);

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
const { data: allTrapsData } = useTraps(() => ({ includeAllScopes: true }));
const { data: allFeaturesData } = useDungeonFeatures(() => ({ includeAllScopes: true }));
const trapsById = computed(() => new Map((allTrapsData.value ?? []).map((t) => [t.id, t])));
const featuresById = computed(() => new Map((allFeaturesData.value ?? []).map((f) => [f.id, f])));
// The pickers offer the same rows the glyph resolver reads. `includeAllScopes`
// is right for both here: a trap is homebrew content that may legitimately be
// personal rather than campaign-scoped, and offering a narrower list than the
// resolver can render would let a DM see a glyph they cannot re-select.
const trapOptions = computed(() => (allTrapsData.value ?? []).map((t) => ({ id: t.id, name: t.name })));
const featureOptions = computed(() => (allFeaturesData.value ?? []).map((f) => ({ id: f.id, name: f.name })));
const cellGlyphs = computed(() => resolveCellGlyphs(metadata.value, trapsById.value, featuresById.value));

// Writable computeds for the inspector's link pickers
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

const cellsPainted = computed(() => Object.keys(layers.value.floor).length);
const activeToolLabel = computed(() => TOOLS.find((t) => t.id === activeTool.value)?.label ?? activeTool.value);

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
const LAYER_OPTIONS: { value: "drawing" | "plan"; label: string }[] = [
  { value: "drawing", label: "Drawing" },
  { value: "plan", label: "Plan" },
];

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
  zoom, hoverCell, canUndo, canRedo, undoEdit, redoEdit, centerMap,
  onPointerDown, onPointerMove, onPointerUp, onDoubleClick, onWheel, structureTools,
} = useMapCanvasEditor({
  canvasEl, layers, metadata, dirty, editRevision, currentPackId, packRuntime, selectablePacks, loadedRuntimes,
  cellGlyphs, activeTool, tools: TOOLS, viewMode: () => viewMode,
  activeObjectCategory, stampRotation, activeTemplateShape, caveRadius,
  selectedCell, inspectorPanelRef, structure, mapKey: computed(() => map?.id || "new"),
  getReferenceImage: buildReferenceImage,
  extraRenderDeps: [showPictureReference, referenceImageEl],
  plan, activeLayer,
});

// ── Pack load ───────────────────────────────────────────────────────────────

async function ensurePackLoaded(): Promise<void> {
  const toLoad = BUNDLED_PACKS.filter((p) => !loadedRuntimes.value.has(p.pack_id));
  await Promise.all(
    toLoad.map(async (p) => {
      try {
        const runtime = await loadPack(p.manifestUrl);
        loadedRuntimes.value.set(p.pack_id, runtime);
      } catch (e) {
        if (p.pack_id === DEFAULT_PACK_ID) {
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

watch(campaignPacks, () => { void ensurePackLoaded(); });
onMounted(() => { void ensurePackLoaded(); });

// ── Map load ───────────────────────────────────────────────────────────────

function cloneLayers(src: DungeonMapLayers | null | undefined): DungeonMapLayers {
  if (!src) return emptyLayers();
  // JSON round-trip — layers are pure data, and this strips Vue's readonly proxy
  // wrapping that comes off TanStack Query's cached result so the editor owns a
  // writable copy.
  return JSON.parse(JSON.stringify(src)) as DungeonMapLayers;
}

/** (Re)initializes every editable field from `m` — the `map` prop's watcher,
 *  and `resetEdits()`'s implementation for Cancel. */
function applyMapToState(m: DungeonMap | null): void {
  if (m) {
    name.value = m.name;
    campaignId.value = m.campaign_id;
    layers.value = cloneLayers(m.layers);
    metadata.value = JSON.parse(JSON.stringify(m.metadata ?? {})) as Record<CellKey, CellMetadata>;
    currentPackId.value = m.default_pack_id ?? DEFAULT_PACK_ID;
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
  getRuntimes: () => loadedRuntimes.value,
  getCellGlyphs: () => cellGlyphs.value,
  getStructure: () => structure.structure.value,
  getCellsPainted: () => cellsPainted.value,
  getPackName: () => packRuntime.value?.manifest.name ?? currentPackId.value,
  isDirty: () => dirty.value,
  /** The autosave's own "has anything changed since I started saving?"
   *  check (#884 review finding 1) — see `useMapCanvasEditor.ts`'s
   *  `editRevision` docblock. */
  getEditRevision: () => editRevision.value,
  resetEdits,
  markSaved,
});
</script>
