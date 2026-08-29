<template>
  <PageHeader :title="map?.name ?? 'New Map'" :description="statusLine">
    <template #actions>
      <!-- View mode: export + navigation -->
      <template v-if="viewMode">
        <AppButton
          variant="subtle"
          fill="muted"
          size="sm"
          :disabled="baking"
          tooltip="Download map as PNG"
          :label="baking ? 'Baking…' : '↓ PNG'"
          @click="onDownloadPng"
        />
        <AppButton
          variant="tinted"
          tone="primary"
          emphasis="outline"
          size="sm"
          :disabled="baking || styleGenerating"
          tooltip="Re-render this map in an artistic style using AI"
          :label="styleGenerating ? 'Styling…' : 'AI Style'"
          @click="showStylePicker = true"
        >
          <template #icon>
            <IconGenerate class="h-3.5 w-3.5" :class="{ 'animate-pulse': styleGenerating }" />
          </template>
        </AppButton>
        <AppButton
          variant="tinted"
          tone="primary"
          emphasis="outline"
          size="sm"
          :disabled="baking"
          :label="baking ? 'Baking…' : 'Save to Atlas'"
          @click="showAtlasModal = true"
        />
        <ListActionButton label="Edit" @click="onEdit" />
        <ListActionButton variant="primary" label="Done" @click="onDone" />
      </template>
      <!-- Edit mode -->
      <template v-else>
        <AppButton
          v-if="!isNew"
          variant="destructive"
          size="sm"
          :disabled="deleting"
          :label="deleting ? 'Deleting…' : 'Delete'"
          @click="onDelete"
        />
        <ListActionButton label="Cancel" @click="onCancel" />
        <ListActionButton
          variant="primary"
          :icon="IconSave"
          label="Save"
          :disabled="saving"
          @click="onSave"
        />
      </template>

      <CartographerSaveAtlasModal
        v-model="showAtlasModal"
        v-model:locationId="atlasLocationId"
        :location-options="locationOptions"
        :baking="baking"
        :error="atlasError"
        :target-has-map="atlasTargetHasMap"
        @save="onSaveToAtlas"
      />

      <CartographerAiStyleModal
        v-model:atlasLocationId="styleAtlasLocationId"
        :show-picker="showStylePicker"
        :show-result="showStyleResult"
        :presets="CARTOGRAPHER_STYLE_PRESETS"
        :selected-preset-id="selectedPresetId"
        :prompt-suffix="stylePromptSuffix"
        :generating="styleGenerating"
        :error="styleError"
        :result-url="styleResultUrl"
        :location-options="locationOptions"
        :atlas-target-has-map="styleAtlasTargetHasMap"
        :atlas-error="styleAtlasError"
        :atlas-saving="styleAtlasSaving"
        :credits="styleCost"
        :byok="styleByok"
        @close-picker="showStylePicker = false"
        @close-result="showStyleResult = false"
        @generate="onGenerateStyle"
        @retry="onRetryStyle"
        @back-to-picker="showStyleResult = false; showStylePicker = true"
        @download-styled="onDownloadStyled"
        @save-to-atlas="onSaveStyledToAtlas"
        @update:selected-preset-id="selectedPresetId = $event"
        @update:prompt-suffix="stylePromptSuffix = $event"
      />
    </template>

    <div class="flex flex-col lg:flex-row gap-3 mt-2">
      <!-- Toolbox -->
      <CartographerToolPalette
        v-if="!viewMode"
        :tools="TOOLS"
        :active-tool="activeTool"
        @update:active-tool="activeTool = $event as Tool"
      />

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
        </div>

        <!-- Overlay hint while the default pack loads -->
        <div
          v-if="!loadedRuntimes.has(DEFAULT_PACK_ID)"
          class="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm"
        >
          <LoadingSpinner />
        </div>
      </div>

      <!-- Inspector -->
      <CartographerInspectorPanel
        v-if="!viewMode"
        ref="inspectorPanelRef"
        :name="name"
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
        :note-options="noteOptions"
        :encounter-options="encounterOptions"
        :active-template-shape="activeTemplateShape"
        :template-shapes="TEMPLATE_SHAPES"
        :cave-radius="caveRadius"
        @update:name="name = $event"
        @update:current-pack-id="currentPackId = $event"
        @update:active-object-category="activeObjectCategory = $event as ObjectCategory"
        @update:stamp-rotation="stampRotation = $event"
        @update:annotation-text="annotationText = $event"
        @update:linked-note-id="linkedNoteId = $event"
        @update:linked-encounter-id="linkedEncounterId = $event"
        @update:active-template-shape="activeTemplateShape = $event as TemplateShape"
        @update:cave-radius="caveRadius = $event"
      />
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component } from "vue";
import { useRoute, useRouter, onBeforeRouteLeave } from "vue-router";

import {
  IconSave,
  IconGenerate,
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
} from "@/lib/icons";

import PageHeader from "@/components/common/PageHeader.vue";
import type { AppInputHandle } from "@/components/common/fieldVariants";
import AppButton from "@/components/common/AppButton.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import CartographerSaveAtlasModal from "@/components/cartographer/CartographerSaveAtlasModal.vue";
import CartographerAiStyleModal from "@/components/cartographer/CartographerAiStyleModal.vue";
import CartographerToolPalette from "@/components/cartographer/CartographerToolPalette.vue";
import CartographerInspectorPanel from "@/components/cartographer/CartographerInspectorPanel.vue";

import {
  useDungeonMap,
  useCreateDungeonMap,
  useUpdateDungeonMap,
  useDeleteDungeonMap,
} from "@/composables/cartographer/useDungeonMaps";
import { useConfirm } from "@/composables/useConfirm";
import { useNotes } from "@/composables/notes/useNotes";
import { useEncounters } from "@/composables/encounters/useEncounters";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { useImageGenerationLog } from "@/composables/ai/useImageGenerationLog";
import { loadUserPack, useTilePacks } from "@/composables/cartographer/useTilePacks";
import { useCampaignStore } from "@/stores/campaign";
import { useAllLocations, useUpdateLocationMapUrl, useUpdateLocationGridCalibration } from "@/composables/locations/useLocations";
import { bakeMap, bakeMapAsPng, bakeMapForAI, computeBakedDimensions } from "@/cartographer/bake";
import type { Tool } from "@/cartographer/tools";
import { CARTOGRAPHER_STYLE_PRESETS } from "@/cartographer/stylePresets";
import { uploadToBucket } from "@/lib/storage";
import { getCurrentUser, supabase } from "@/lib/supabase";
import {
  emptyLayers,
  cellKey,
  type CellKey,
  type DungeonMap,
  type DungeonMapLayers,
  type CellMetadata,
} from "@/types/dungeonMap.types";
import { BASE_TILE_SIZE, type PackCategory, OBJECT_CATEGORIES, type ObjectCategory } from "@/cartographer/packSchema";
import { loadPack, type TilePackRuntime } from "@/cartographer/packLoader";
import { renderMap } from "@/cartographer/renderMap";
import { pickVariant } from "@/cartographer/tileVariants";
import * as paintOps from "@/cartographer/paintOps";
import type { PaintContext } from "@/cartographer/paintOps";
import { canonicaliseEdge, type CellEdge } from "@/cartographer/edges";
import { detectHoveredEdge } from "@/cartographer/edgeHover";
import { floodFill, boundaryEdges } from "@/cartographer/floodFill";
import { CommandStack } from "@/cartographer/commandStack";
import { cellsForTemplate, caveBrushCells } from "@/cartographer/geometry";

const route = useRoute();
const router = useRouter();

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

const mapId = computed(() => {
  const p = route.params.id;
  return typeof p === "string" && p ? p : "";
});
const isNew = computed(() => !mapId.value);
// View vs edit mode — derived from the URL (matches the NPC/Location/Item convention).
// `/cartographer/:id`           → view mode
// `/cartographer/:id?edit=true` → edit mode
// `/cartographer/new`           → always edit mode
const viewMode = computed(() => !isNew.value && route.query.edit !== "true");

const { data: loadedMap } = useDungeonMap(mapId);
const createMutation = useCreateDungeonMap();
const updateMutation = useUpdateDungeonMap();
const deleteMutation = useDeleteDungeonMap();
const { confirm } = useConfirm();

const name = ref("Untitled Map");
const layers = ref<DungeonMapLayers>(emptyLayers());
const currentPackId = ref(DEFAULT_PACK_ID);
const packLoadError = ref<string | null>(null);
const loadedRuntimes = ref(new Map<string, TilePackRuntime>());
const packRuntime = computed(() => loadedRuntimes.value.get(currentPackId.value) ?? null);
const loadedPackIds = computed(() => new Set(loadedRuntimes.value.keys()));
const dirty = ref(false);
const saving = ref(false);
const deleting = ref(false);
const baking = ref(false);

// M5 — Save to Atlas
const showAtlasModal = ref(false);
const atlasLocationId = ref("");
const atlasError = ref<string | null>(null);
const { data: allLocationsData } = useAllLocations();
const locationOptions = computed(() =>
  (allLocationsData.value ?? []).map((l) => ({ id: l.id, name: l.name })),
);
const atlasTargetHasMap = computed(() =>
  !!atlasLocationId.value &&
  !!(allLocationsData.value ?? []).find((l) => l.id === atlasLocationId.value)?.map_url,
);
const updateLocationMapUrl = useUpdateLocationMapUrl();
const updateLocationGridCalibration = useUpdateLocationGridCalibration();

// M8 — AI Map Styler
// Map restyle renders square (1024×1024) via OpenAI → flat cost, no size scaling.
const { costOf: costOfCredits } = useAiCredits();
const { imageMultiplierFor: mapImageMultiplierFor } = useProviderConfig();
const styleByok = computed(() => !!mapStyleCampaign.decryptedOpenAiKey);
const { logImageGeneration } = useImageGenerationLog();
const styleCost = computed(
  () => Math.round(costOfCredits("map_style_generation") * mapImageMultiplierFor("openai") * 100) / 100,
);
const showStylePicker = ref(false);
const showStyleResult = ref(false);
const selectedPresetId = ref("playable");
const stylePromptSuffix = ref("");
const styleGenerating = ref(false);
const styleResultBlob = ref<Blob | null>(null);
const styleResultUrl = ref<string | null>(null);
const styleError = ref<string | null>(null);
const styleAtlasLocationId = ref("");
const styleAtlasError = ref<string | null>(null);
const styleAtlasSaving = ref(false);
const styleAtlasTargetHasMap = computed(() =>
  !!styleAtlasLocationId.value &&
  !!(allLocationsData.value ?? []).find((l) => l.id === styleAtlasLocationId.value)?.map_url,
);

const canvasEl = ref<HTMLCanvasElement | null>(null);

// Viewport state
const zoom = ref(1);
const viewportOffset = ref({ x: 0, y: 0 }); // world-pixels at top-left of viewport
const hoverCell = ref<[number, number] | null>(null);
const hoveredEdge = ref<CellEdge | null>(null);

// Pointer state
const isPanning = ref(false);
const isPainting = ref(false);
let lastPointer: { x: number; y: number } | null = null;
// Mutable per-stroke state (edge dedup + direction lock) — see StrokeState in
// src/cartographer/paintOps.ts for what each field replaces and why.
let strokeState = paintOps.createStrokeState();

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
  { id: "link",      label: "Link entity",    icon: IconEntityLink,   shortcut: "k" },
  { id: "template",  label: "Room template",  icon: IconRoomTemplate, shortcut: "m" },
  { id: "cave",      label: "Cave brush",     icon: IconCave,         shortcut: "v" },
  { id: "pan",       label: "Pan",            icon: IconHand,         displayBadge: "RMB" },
];

// Edge-hover threshold: how close the cursor must get to a cell edge for it
// to "snap" to wall placement. 0.25 = within the outer 25% of the cell.
const EDGE_HOVER_THRESHOLD = 0.25;

// Undo/redo
const cmdStack = new CommandStack(100);
const canUndo = ref(false);
const canRedo = ref(false);

// Drag state for rect / line tools
let dragStartCell: [number, number] | null = null;
const previewCells = ref(new Set<CellKey>());

// Snapshot of layers captured at stroke start — used to build the undo command.
let strokeSnapshot: string | null = null; // JSON string for cheap comparison on mouseup

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

// M6 — Cave brush state; seed increments each stroke for variety
const caveRadius = ref(5);
let caveSeed = 0;

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

// M4 — Entity options for the link picker
const { data: notesData } = useNotes();
const { data: encountersData } = useEncounters();
const noteOptions = computed(() =>
  (notesData.value ?? []).map((n) => ({ id: n.id, name: (n as { id: string; title: string }).title })),
);
const encounterOptions = computed(() =>
  (encountersData.value ?? []).map((e) => ({ id: e.id, name: e.name })),
);

// Writable computeds for the inspector's link pickers
const linkedNoteId = computed({
  get: () => (selectedCell.value ? (metadata.value[cellKey(...selectedCell.value)]?.note_id ?? "") : ""),
  set: (id: string) => {
    if (!selectedCell.value) return;
    const k = cellKey(...selectedCell.value);
    metadata.value[k] = { ...metadata.value[k], note_id: id || undefined };
    dirty.value = true;
  },
});
const linkedEncounterId = computed({
  get: () => (selectedCell.value ? (metadata.value[cellKey(...selectedCell.value)]?.encounter_id ?? "") : ""),
  set: (id: string) => {
    if (!selectedCell.value) return;
    const k = cellKey(...selectedCell.value);
    metadata.value[k] = { ...metadata.value[k], encounter_id: id || undefined };
    dirty.value = true;
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
    dirty.value = true;
  },
});


const cellsPainted = computed(() => Object.keys(layers.value.floor).length);
const floorVariantCount = computed(() =>
  packRuntime.value ? packRuntime.value.variantCount("floor") : 0,
);

const statusLine = computed(() => {
  if (isNew.value) return "New map — paint a floor, then save.";
  if (dirty.value) return "Unsaved changes.";
  return "Saved.";
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

// ── Map load ───────────────────────────────────────────────────────────────

function cloneLayers(src: DungeonMapLayers | null | undefined): DungeonMapLayers {
  if (!src) return emptyLayers();
  // JSON round-trip — layers are pure data, and this strips Vue's readonly proxy
  // wrapping that comes off TanStack Query's cached result so the editor owns a
  // writable copy.
  return JSON.parse(JSON.stringify(src)) as DungeonMapLayers;
}

watch(loadedMap, (m) => {
  if (m) {
    name.value = m.name;
    layers.value = cloneLayers(m.layers);
    metadata.value = JSON.parse(JSON.stringify(m.metadata ?? {})) as Record<CellKey, CellMetadata>;
    currentPackId.value = m.default_pack_id ?? DEFAULT_PACK_ID;
    dirty.value = false;
    cmdStack.clear();
    canUndo.value = false;
    canRedo.value = false;
  }
}, { immediate: true });

// ── Deterministic variant picking ──────────────────────────────────────────
// hash32/pickVariant live in src/cartographer/tileVariants.ts; see its
// colocated test for why these seed strings must never change.

const mapKey = computed(() => mapId.value || "new");

function pickFloorVariant(x: number, y: number): number {
  return pickVariant(mapKey.value, "floor", x, y, floorVariantCount.value);
}

function pickWallVariant(x: number, y: number, side: "N" | "W"): number {
  if (!packRuntime.value) return 0;
  const category = side === "N" ? "wallSegmentH" : "wallSegmentV";
  return pickVariant(mapKey.value, category, x, y, packRuntime.value.variantCount(category));
}

function pickSolidVariant(x: number, y: number): number {
  if (!packRuntime.value) return 0;
  return pickVariant(mapKey.value, "solid", x, y, packRuntime.value.variantCount("solidBlock"));
}

function pickDoorVariant(x: number, y: number, category: PackCategory): number {
  if (!packRuntime.value) return 0;
  return pickVariant(mapKey.value, category, x, y, packRuntime.value.variantCount(category));
}

function activePackVersion(): number {
  return packRuntime.value?.manifest.pack_version
    ?? selectablePacks.value.find((pack) => pack.pack_id === currentPackId.value)?.pack_version
    ?? 1;
}

// Mutation context handed to paintOps functions — `layers` is the same
// reactive object as layers.value, so writes through it stay reactive.
function paintContext(): PaintContext {
  return { layers: layers.value, packId: currentPackId.value, packVersion: activePackVersion() };
}

// ── Undo/redo helpers ──────────────────────────────────────────────────────

function snapshotStr(): string {
  return JSON.stringify({ layers: layers.value, metadata: metadata.value });
}

function pushCommand(beforeStr: string, afterStr: string): void {
  cmdStack.apply({
    apply() {
      const s = JSON.parse(afterStr) as { layers: DungeonMapLayers; metadata: Record<CellKey, CellMetadata> };
      layers.value = s.layers; metadata.value = s.metadata; dirty.value = true;
    },
    revert() {
      const s = JSON.parse(beforeStr) as { layers: DungeonMapLayers; metadata: Record<CellKey, CellMetadata> };
      layers.value = s.layers; metadata.value = s.metadata; dirty.value = true;
    },
  });
  canUndo.value = cmdStack.canUndo();
  canRedo.value = cmdStack.canRedo();
}

function undoEdit(): void {
  cmdStack.undo();
  canUndo.value = cmdStack.canUndo();
  canRedo.value = cmdStack.canRedo();
}

function redoEdit(): void {
  cmdStack.redo();
  canUndo.value = cmdStack.canUndo();
  canRedo.value = cmdStack.canRedo();
}

// ── Geometry helpers ───────────────────────────────────────────────────────

function cellsInRect(ax: number, ay: number, bx: number, by: number): Array<[number, number]> {
  const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx);
  const y0 = Math.min(ay, by), y1 = Math.max(ay, by);
  const out: Array<[number, number]> = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      out.push([x, y]);
  return out;
}

function cellsInLine(ax: number, ay: number, bx: number, by: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let x = ax, y = ay;
  const dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
  const sx = ax <= bx ? 1 : -1, sy = ay <= by ? 1 : -1;
  let err = dx - dy;
  while (true) {
    out.push([x, y]);
    if (x === bx && y === by) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return out;
}

// World pixel coords (canvas-pixel space) given an event on the canvas.
function pointerToWorld(local: { x: number; y: number }): { x: number; y: number } {
  const { dpr } = devicePixelDims();
  return {
    x: viewportOffset.value.x + local.x * dpr,
    y: viewportOffset.value.y + local.y * dpr,
  };
}

function tilePixelSize(): number {
  return BASE_TILE_SIZE * zoom.value * (window.devicePixelRatio || 1);
}

// Centre the viewport on the painted area (or on the origin if the map is empty).
function centerMap(): void {
  const canvas = canvasEl.value;
  if (!canvas) return;
  const tilePx = tilePixelSize();

  // Compute bbox over every cell that contains anything.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let any = false;
  for (const key of Object.keys(layers.value.floor)) {
    const [xs, ys] = key.split(",");
    const x = Number(xs);
    const y = Number(ys);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    any = true;
  }

  // No painted cells → just center on the origin tile.
  const cx = any ? (minX + maxX + 1) / 2 : 0.5;
  const cy = any ? (minY + maxY + 1) / 2 : 0.5;

  viewportOffset.value = {
    x: cx * tilePx - canvas.width / 2,
    y: cy * tilePx - canvas.height / 2,
  };
}

// ── Solid block tool ───────────────────────────────────────────────────────

function paintSolidAt(x: number, y: number): void {
  if (!packRuntime.value) return;
  const variant = pickSolidVariant(x, y);
  if (paintOps.paintSolidAt(paintContext(), x, y, variant)) dirty.value = true;
}

function eraseSolidAt(x: number, y: number): void {
  if (paintOps.eraseSolidAt(paintContext(), x, y)) dirty.value = true;
}

// ── Object stamp tool ─────────────────────────────────────────────────────

function pickObjectVariant(cat: ObjectCategory, x: number, y: number): number {
  if (!packRuntime.value) return 0;
  return pickVariant(mapKey.value, cat, x, y, packRuntime.value.variantCount(cat));
}

function paintObjectAt(x: number, y: number): void {
  const variant = pickObjectVariant(activeObjectCategory.value, x, y);
  const changed = paintOps.paintObjectAt(
    paintContext(), x, y, activeObjectCategory.value, variant, stampRotation.value,
  );
  if (changed) dirty.value = true;
}

function eraseObjectAt(x: number, y: number): void {
  if (paintOps.eraseObjectAt(paintContext(), x, y)) dirty.value = true;
}

// ── Wall placement (edge-based, NW ownership) ──────────────────────────────

function paintWallAtCellEdge(edge: CellEdge): void {
  const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
  const variant = pickWallVariant(canon.x, canon.y, canon.side);
  strokeState.active = isPainting.value;
  if (paintOps.paintWallAtCellEdge(paintContext(), edge, strokeState, variant)) dirty.value = true;
}

// Writes a wall edge directly, skipping stroke tracking. Used by wrap-walls,
// rectangle perimeter, and shift+click — operations that aren't "strokes".
function setWallEdgeIfEmpty(edge: CellEdge): void {
  const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
  const variant = pickWallVariant(canon.x, canon.y, canon.side);
  if (paintOps.setWallEdgeIfEmpty(paintContext(), edge, variant)) dirty.value = true;
}

// ── Door tool (edge-based) ─────────────────────────────────────────────────

function paintDoorAtEdge(edge: CellEdge): void {
  const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
  const cat: PackCategory = canon.side === "N" ? "doorClosedH" : "doorClosedV";
  const newDoorVariant = pickDoorVariant(canon.x, canon.y, cat);
  if (paintOps.paintDoorAtEdge(paintContext(), edge, strokeState, newDoorVariant)) dirty.value = true;
}

// Right-click on door edge: revert to plain wall (preserves the edge, removes door).
function removeDoorAtEdge(edge: CellEdge): void {
  const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
  const wallVariant = pickWallVariant(canon.x, canon.y, canon.side);
  if (paintOps.removeDoorAtEdge(paintContext(), edge, wallVariant)) dirty.value = true;
}

// ── One-shot actions ───────────────────────────────────────────────────────

// Fill bucket: flood-fill from (cx, cy) through all non-solidBlock cells,
// planting floor. Bounded by a 2 000-cell safety cap.
function applyFill(cx: number, cy: number): void {
  if (!packRuntime.value) return;
  const region = floodFill(cx, cy, (x, y) => !layers.value.solidBlock[cellKey(x, y)], { maxCells: 2000 });
  for (const key of region) {
    const [xs, ys] = key.split(",");
    paintCell(Number(xs), Number(ys));
  }
}

// Wrap walls: find the connected floor region and place walls on every boundary
// edge facing void that doesn't already have a wall/door.
function applyWrapWalls(cx: number, cy: number): void {
  if (!layers.value.floor[cellKey(cx, cy)]?.floor) return;
  const region = floodFill(cx, cy, (x, y) => !!layers.value.floor[cellKey(x, y)]?.floor);
  for (const edge of boundaryEdges(region)) setWallEdgeIfEmpty(edge);
}

// Rectangle fill: paint all cells in the bounding rect; optionally also wrap walls.
function applyRect(ax: number, ay: number, bx: number, by: number, withWalls: boolean): void {
  if (!packRuntime.value) return;
  const cells = cellsInRect(ax, ay, bx, by);
  for (const [x, y] of cells) paintCell(x, y);
  if (withWalls) {
    const region = new Set<CellKey>(cells.map(([x, y]) => cellKey(x, y)));
    for (const edge of boundaryEdges(region)) setWallEdgeIfEmpty(edge);
  }
}

// Line: Bresenham floor line between two cells.
function applyLine(ax: number, ay: number, bx: number, by: number): void {
  if (!packRuntime.value) return;
  for (const [x, y] of cellsInLine(ax, ay, bx, by)) paintCell(x, y);
}

// M6 — Room template: fill the chosen shape centered on (ax, ay) and wrap walls.
function applyTemplate(ax: number, ay: number, bx: number, by: number): void {
  if (!packRuntime.value) return;
  const r = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
  const keys = cellsForTemplate(ax, ay, r, activeTemplateShape.value);
  for (const key of keys) {
    const [xs, ys] = (key as string).split(",");
    paintCell(Number(xs), Number(ys));
  }
  const region = new Set(keys);
  for (const edge of boundaryEdges(region)) setWallEdgeIfEmpty(edge);
}

// M6 — Cave brush: paint an organic blob at (cx, cy) using value noise.
function paintCaveAt(cx: number, cy: number): void {
  if (!packRuntime.value) return;
  for (const key of caveBrushCells(cx, cy, caveRadius.value, caveSeed)) {
    const [xs, ys] = (key as string).split(",");
    paintCell(Number(xs), Number(ys));
  }
}

function eraseWallAtCellEdge(edge: CellEdge): void {
  strokeState.active = isPainting.value;
  if (paintOps.eraseWallAtCellEdge(paintContext(), edge, strokeState)) dirty.value = true;
}


// ── Canvas rendering ───────────────────────────────────────────────────────

function devicePixelDims(): { w: number; h: number; dpr: number } {
  const canvas = canvasEl.value!;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  return { w: rect.width, h: rect.height, dpr };
}

function resizeCanvasIfNeeded(): void {
  const canvas = canvasEl.value;
  if (!canvas) return;
  const { w, h, dpr } = devicePixelDims();
  const targetW = Math.round(w * dpr);
  const targetH = Math.round(h * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }
}

function viewportToCell(px: number, py: number): [number, number] {
  const { dpr } = devicePixelDims();
  const tileCSS = BASE_TILE_SIZE * zoom.value;
  const worldX = viewportOffset.value.x + px * dpr;
  const worldY = viewportOffset.value.y + py * dpr;
  const x = Math.floor(worldX / (tileCSS * dpr));
  const y = Math.floor(worldY / (tileCSS * dpr));
  return [x, y];
}

function visibleCellBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
  const { w, h, dpr } = devicePixelDims();
  const tileCSS = BASE_TILE_SIZE * zoom.value;
  const minX = Math.floor(viewportOffset.value.x / (tileCSS * dpr));
  const minY = Math.floor(viewportOffset.value.y / (tileCSS * dpr));
  const maxX = Math.ceil((viewportOffset.value.x + w * dpr) / (tileCSS * dpr));
  const maxY = Math.ceil((viewportOffset.value.y + h * dpr) / (tileCSS * dpr));
  return { minX, minY, maxX, maxY };
}

function render(): void {
  const canvas = canvasEl.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  resizeCanvasIfNeeded();
  const { dpr } = devicePixelDims();
  const tileCSS = BASE_TILE_SIZE * zoom.value;
  const tilePx = tileCSS * dpr;
  const bounds = visibleCellBounds();

  renderMap({
    ctx,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    tilePx,
    viewportOffset: viewportOffset.value,
    bounds,
    layers: layers.value,
    metadata: metadata.value,
    runtimes: loadedRuntimes.value,
    fallbackRuntime: packRuntime.value,
    currentPackId: currentPackId.value,
    activeTool: activeTool.value,
    viewMode: viewMode.value,
    hoveredEdge: hoveredEdge.value,
    hoverCell: hoverCell.value,
    selectedCell: selectedCell.value,
    previewCells: previewCells.value,
  });
}

let rafId = 0;
function scheduleRender(): void {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    render();
  });
}

watch([zoom, viewportOffset, layers, loadedRuntimes, currentPackId, hoverCell, hoveredEdge, activeTool, previewCells, metadata, selectedCell, viewMode], () => scheduleRender(), { deep: true });

// ── Pointer interaction ────────────────────────────────────────────────────

function getLocalPointer(ev: PointerEvent): { x: number; y: number } {
  const rect = canvasEl.value!.getBoundingClientRect();
  return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
}

function paintCell(x: number, y: number): void {
  if (!packRuntime.value) return;
  const variant = pickFloorVariant(x, y);
  if (paintOps.paintCell(paintContext(), x, y, variant)) dirty.value = true;
}

function eraseCell(x: number, y: number): void {
  if (paintOps.eraseCell(paintContext(), x, y)) dirty.value = true;
}

function onPointerDown(ev: PointerEvent): void {
  const local = getLocalPointer(ev);
  lastPointer = local;

  // View mode: pan only — skip all painting logic.
  if (viewMode.value) {
    isPanning.value = true;
    return;
  }

  const [cx, cy] = viewportToCell(local.x, local.y);

  // Stamp right-click: erase object at cell.
  if (activeTool.value === "stamp" && ev.button === 2) {
    ev.preventDefault();
    const before = snapshotStr();
    eraseObjectAt(cx, cy);
    const after = snapshotStr();
    if (before !== after) pushCommand(before, after);
    return;
  }

  // Link / annotate: LMB selects cell; RMB falls through to pan.
  if ((activeTool.value === "link" || activeTool.value === "annotate") && ev.button !== 2) {
    selectedCell.value = [cx, cy];
    if (activeTool.value === "annotate") {
      setTimeout(() => inspectorPanelRef.value?.annotationInputEl?.focus(), 0);
    }
    return;
  }

  // Door right-click: remove door → plain wall (before the generic pan check).
  if (activeTool.value === "door" && ev.button === 2 && hoveredEdge.value) {
    ev.preventDefault();
    const before = snapshotStr();
    removeDoorAtEdge(hoveredEdge.value);
    const after = snapshotStr();
    if (before !== after) pushCommand(before, after);
    return;
  }

  // Shift+click with the wall brush: wrap all 4 edges of the clicked cell.
  if (activeTool.value === "wall" && ev.shiftKey && ev.button === 0) {
    const before = snapshotStr();
    strokeState = paintOps.createStrokeState();
    for (const side of ["N", "E", "S", "W"] as const)
      paintWallAtCellEdge({ x: cx, y: cy, side });
    const after = snapshotStr();
    if (before !== after) pushCommand(before, after);
    return;
  }

  // RMB / middle / shift → pan (shift already consumed above for wall tool).
  const isPanTrigger = ev.button === 1 || ev.button === 2 || ev.shiftKey;
  if (activeTool.value === "pan" || isPanTrigger) {
    isPanning.value = true;
    canvasEl.value?.setPointerCapture(ev.pointerId);
    return;
  }

  // One-shot tools: apply immediately without entering stroke mode.
  if (activeTool.value === "fill") {
    const before = snapshotStr();
    applyFill(cx, cy);
    const after = snapshotStr();
    if (before !== after) pushCommand(before, after);
    return;
  }
  if (activeTool.value === "wrap") {
    const before = snapshotStr();
    applyWrapWalls(cx, cy);
    const after = snapshotStr();
    if (before !== after) pushCommand(before, after);
    return;
  }

  // Stroke-based tools.
  isPainting.value = true;
  canvasEl.value?.setPointerCapture(ev.pointerId);
  strokeState = paintOps.createStrokeState();
  strokeSnapshot = snapshotStr();

  // Rect / line / template tools: record drag start; first cell is the preview seed.
  if (activeTool.value === "rect" || activeTool.value === "line" || activeTool.value === "template") {
    dragStartCell = [cx, cy];
    previewCells.value = new Set([cellKey(cx, cy)]);
    return;
  }

  // Cave brush: new seed per stroke so consecutive passes vary.
  if (activeTool.value === "cave") {
    caveSeed++;
    paintCaveAt(cx, cy);
    return;
  }

  if (activeTool.value === "floor") paintCell(cx, cy);
  else if (activeTool.value === "solid") paintSolidAt(cx, cy);
  else if (activeTool.value === "stamp") paintObjectAt(cx, cy);
  else if (activeTool.value === "eraser") {
    if (hoveredEdge.value) eraseWallAtCellEdge(hoveredEdge.value);
    else if (layers.value.object[cellKey(cx, cy)]) eraseObjectAt(cx, cy);
    else if (layers.value.annotation[cellKey(cx, cy)]) {
      const next = { ...layers.value.annotation }; delete next[cellKey(cx, cy)]; layers.value.annotation = next; dirty.value = true;
    }
    else if (layers.value.solidBlock[cellKey(cx, cy)]) eraseSolidAt(cx, cy);
    else eraseCell(cx, cy);
  } else if (activeTool.value === "wall" && hoveredEdge.value) {
    paintWallAtCellEdge(hoveredEdge.value);
  } else if (activeTool.value === "door" && hoveredEdge.value) {
    paintDoorAtEdge(hoveredEdge.value);
  }
}

function onPointerMove(ev: PointerEvent): void {
  const local = getLocalPointer(ev);
  const [cx, cy] = viewportToCell(local.x, local.y);
  hoverCell.value = [cx, cy];

  // Update edge-hover state for tools that target edges (wall, door, edge-eraser).
  const tool = activeTool.value;
  if (tool === "wall" || tool === "door" || tool === "eraser") {
    const world = pointerToWorld(local);
    let edge = detectHoveredEdge(world.x, world.y, tilePixelSize(), EDGE_HOVER_THRESHOLD);
    // If a stroke has locked its direction, suppress highlights for the
    // perpendicular axis — visual feedback matches what will actually paint.
    if (edge && isPainting.value && strokeState.direction !== null && paintOps.edgeDirection(edge.side) !== strokeState.direction) {
      edge = null;
    }
    hoveredEdge.value = edge;
  } else {
    hoveredEdge.value = null;
  }

  if (isPanning.value && lastPointer) {
    const dx = local.x - lastPointer.x;
    const dy = local.y - lastPointer.y;
    const { dpr } = devicePixelDims();
    viewportOffset.value = {
      x: viewportOffset.value.x - dx * dpr,
      y: viewportOffset.value.y - dy * dpr,
    };
  } else if (isPainting.value) {
    if (tool === "rect" && dragStartCell) {
      previewCells.value = new Set(
        cellsInRect(dragStartCell[0], dragStartCell[1], cx, cy).map(([x, y]) => cellKey(x, y)),
      );
    } else if (tool === "line" && dragStartCell) {
      previewCells.value = new Set(
        cellsInLine(dragStartCell[0], dragStartCell[1], cx, cy).map(([x, y]) => cellKey(x, y)),
      );
    } else if (tool === "template" && dragStartCell) {
      const r = Math.max(Math.abs(cx - dragStartCell[0]), Math.abs(cy - dragStartCell[1]));
      previewCells.value = new Set(cellsForTemplate(dragStartCell[0], dragStartCell[1], r, activeTemplateShape.value));
    } else if (tool === "cave") {
      paintCaveAt(cx, cy);
    } else if (tool === "floor") paintCell(cx, cy);
    else if (tool === "solid") paintSolidAt(cx, cy);
    else if (tool === "stamp") paintObjectAt(cx, cy);
    else if (tool === "eraser") {
      if (hoveredEdge.value) eraseWallAtCellEdge(hoveredEdge.value);
      else if (layers.value.object[cellKey(cx, cy)]) eraseObjectAt(cx, cy);
      else if (layers.value.solidBlock[cellKey(cx, cy)]) eraseSolidAt(cx, cy);
      else eraseCell(cx, cy);
    } else if (tool === "wall" && hoveredEdge.value) {
      paintWallAtCellEdge(hoveredEdge.value);
    } else if (tool === "door" && hoveredEdge.value) {
      paintDoorAtEdge(hoveredEdge.value);
    }
  }

  lastPointer = local;
}

function onPointerUp(ev: PointerEvent): void {
  if (isPanning.value) {
    isPanning.value = false;
    canvasEl.value?.releasePointerCapture(ev.pointerId);
  }
  if (isPainting.value) {
    const tool = activeTool.value;

    // Commit rect / line / template on release.
    if ((tool === "rect" || tool === "line" || tool === "template") && dragStartCell) {
      const local = getLocalPointer(ev);
      const [cx, cy] = viewportToCell(local.x, local.y);
      const [ax, ay] = dragStartCell;
      const before = strokeSnapshot ?? snapshotStr();
      if (tool === "rect") applyRect(ax, ay, cx, cy, ev.shiftKey);
      else if (tool === "line") applyLine(ax, ay, cx, cy);
      else applyTemplate(ax, ay, cx, cy);
      const after = snapshotStr();
      if (before !== after) pushCommand(before, after);
      dragStartCell = null;
      previewCells.value = new Set();
    } else if (strokeSnapshot !== null) {
      // Stroke-based tools: push one undo command for the whole stroke.
      const after = snapshotStr();
      if (strokeSnapshot !== after) pushCommand(strokeSnapshot, after);
    }

    strokeSnapshot = null;
    isPainting.value = false;
    canvasEl.value?.releasePointerCapture(ev.pointerId);
  }
  lastPointer = null;
}

function onWheel(ev: WheelEvent): void {
  const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
  // 5%–400% zoom range: small enough to scan an 80×80 dungeon at a glance,
  // large enough to paint tile-by-tile.
  const next = Math.max(0.05, Math.min(4, zoom.value * factor));
  // Zoom around the cursor
  const rect = canvasEl.value!.getBoundingClientRect();
  const cx = ev.clientX - rect.left;
  const cy = ev.clientY - rect.top;
  const { dpr } = devicePixelDims();
  const worldX = viewportOffset.value.x + cx * dpr;
  const worldY = viewportOffset.value.y + cy * dpr;
  const scale = next / zoom.value;
  viewportOffset.value = {
    x: worldX - (worldX - viewportOffset.value.x) * scale - cx * dpr + cx * dpr,
    y: worldY - (worldY - viewportOffset.value.y) * scale - cy * dpr + cy * dpr,
  };
  // Simpler: keep cursor over same world point
  viewportOffset.value = {
    x: worldX * scale - cx * dpr,
    y: worldY * scale - cy * dpr,
  };
  zoom.value = next;
}

// ── Save / cancel ──────────────────────────────────────────────────────────

async function onSave(): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  try {
    const payload = {
      name: name.value.trim() || "Untitled Map",
      description: null,
      layers: layers.value,
      metadata: metadata.value,
      default_pack_id: currentPackId.value as string,
      tags: (loadedMap.value as DungeonMap | null)?.tags ?? [],
      notes: null as unknown,
    };
    if (isNew.value) {
      const result = await createMutation.mutateAsync(payload);
      dirty.value = false;
      // Navigate to the saved map URL (no ?edit=true → view mode).
      await router.replace(`/cartographer/${result.id}`);
    } else {
      await updateMutation.mutateAsync({ id: mapId.value, update: payload });
      dirty.value = false;
      // Drop ?edit=true → view mode.
      await router.replace({ query: {} });
    }
  } finally {
    saving.value = false;
  }
}

function onCancel(): void {
  if (mapId.value) {
    // Editing an existing map — restore saved state and return to view mode.
    if (loadedMap.value) {
      layers.value = cloneLayers(loadedMap.value.layers);
      metadata.value = JSON.parse(JSON.stringify(loadedMap.value.metadata ?? {})) as Record<CellKey, CellMetadata>;
    }
    dirty.value = false;
    cmdStack.clear();
    canUndo.value = false;
    canRedo.value = false;
    router.replace({ query: {} });
  } else {
    router.push("/cartographer");
  }
}

function onEdit(): void {
  router.push({ query: { edit: "true" } });
}

function onDone(): void {
  router.push("/cartographer");
}

async function onSaveToAtlas(): Promise<void> {
  if (baking.value || !atlasLocationId.value || !loadedMap.value) return;
  atlasError.value = null;
  baking.value = true;
  try {
    const map = { ...loadedMap.value, layers: layers.value, metadata: metadata.value };
    const blob = await bakeMap(map, loadedRuntimes.value);
    const user = getCurrentUser();
    if (!user) throw new Error("Not authenticated");
    const url = await uploadToBucket({
      bucket: "locationImages",
      blob,
      userId: user.id,
      contentType: "image/webp",
    });
    if (!url) throw new Error("Upload failed");
    await updateLocationMapUrl.mutateAsync({
      id: atlasLocationId.value,
      mapUrl: url,
      sourceMapId: loadedMap.value.id,
    });
    // Auto-populate VTT grid calibration: the bake produces an image where
    // every column is one 5-ft cell at BASE_TILE_SIZE px and cell (0,0) sits
    // at the image's top-left, so cells_per_image_width == cols.
    const dims = computeBakedDimensions(map);
    await updateLocationGridCalibration.mutateAsync({
      id: atlasLocationId.value,
      calibration: {
        cells_per_image_width: dims.cols,
        origin_x_pct: 0,
        origin_y_pct: 0,
      },
    });
    showAtlasModal.value = false;
    atlasLocationId.value = "";
  } catch (e) {
    atlasError.value = e instanceof Error ? e.message : "Something went wrong";
  } finally {
    baking.value = false;
  }
}

async function onDownloadPng(): Promise<void> {
  if (baking.value || !loadedMap.value) return;
  baking.value = true;
  try {
    const map = { ...loadedMap.value, layers: layers.value, metadata: metadata.value };
    const blob = await bakeMapAsPng(map, loadedRuntimes.value);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.value || "map"}.png`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    baking.value = false;
  }
}

async function onGenerateStyle(): Promise<void> {
  if (styleGenerating.value || !loadedMap.value) return;
  styleError.value = null;
  styleGenerating.value = true;
  try {
    const map = { ...loadedMap.value, layers: layers.value, metadata: metadata.value };
    const pngBlob = await bakeMapForAI(map, loadedRuntimes.value);
    // Convert PNG blob to base64
    const ab = await pngBlob.arrayBuffer();
    const bytes = new Uint8Array(ab);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const image_b64 = btoa(bin);

    const { data, error } = await supabase.functions.invoke("style-map", {
      body: {
        campaign_id: loadedMap.value.id, // placeholder — edge fn doesn't use it for map auth
        image_b64,
        preset_id: selectedPresetId.value,
        map_name: name.value,
        map_description: loadedMap.value.description,
        prompt_suffix: stylePromptSuffix.value.trim() || null,
      },
    });
    if (error || !data?.image_b64) throw new Error(error?.message ?? data?.error ?? "Generation failed");

    const resultBytes = Uint8Array.from(atob(data.image_b64 as string), (c) => c.charCodeAt(0));
    styleResultBlob.value = new Blob([resultBytes], { type: "image/webp" });
    if (styleResultUrl.value) URL.revokeObjectURL(styleResultUrl.value);
    styleResultUrl.value = URL.createObjectURL(styleResultBlob.value);
    showStylePicker.value = false;
    showStyleResult.value = true;
  } catch (e) {
    styleError.value = e instanceof Error ? e.message : "Something went wrong";
  } finally {
    styleGenerating.value = false;
  }
}

async function onRetryStyle(): Promise<void> {
  if (styleResultUrl.value) URL.revokeObjectURL(styleResultUrl.value);
  styleResultBlob.value = null;
  styleResultUrl.value = null;
  showStyleResult.value = false;
  await onGenerateStyle();
}

function onDownloadStyled(): void {
  if (!styleResultBlob.value) return;
  const url = URL.createObjectURL(styleResultBlob.value);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.value || "map"}-styled.webp`;
  a.click();
  URL.revokeObjectURL(url);
}

async function onSaveStyledToAtlas(): Promise<void> {
  if (styleAtlasSaving.value || !styleAtlasLocationId.value || !styleResultBlob.value || !loadedMap.value) return;
  styleAtlasError.value = null;
  styleAtlasSaving.value = true;
  try {
    const user = getCurrentUser();
    if (!user) throw new Error("Not authenticated");
    const url = await uploadToBucket({
      bucket: "locationImages",
      blob: styleResultBlob.value,
      userId: user.id,
      contentType: "image/webp",
    });
    if (!url) throw new Error("Upload failed");
    await updateLocationMapUrl.mutateAsync({
      id: styleAtlasLocationId.value,
      mapUrl: url,
      sourceMapId: loadedMap.value.id,
    });
    // Log the restyled map to the Gallery, linked back to the location.
    void logImageGeneration({
      kind: "map", imageUrl: url, prompt: `${name.value || "Map"} — ${selectedPresetId.value} style`,
      targetId: styleAtlasLocationId.value, targetColumn: "map_url",
    });
    showStyleResult.value = false;
    styleAtlasLocationId.value = "";
  } catch (e) {
    styleAtlasError.value = e instanceof Error ? e.message : "Something went wrong";
  } finally {
    styleAtlasSaving.value = false;
  }
}

async function onDelete(): Promise<void> {
  if (deleting.value || isNew.value || !mapId.value) return;
  const ok = await confirm(`Delete "${name.value || "this map"}"? This cannot be undone.`);
  if (!ok) return;
  deleting.value = true;
  try {
    await deleteMutation.mutateAsync(mapId.value);
    dirty.value = false;
    router.push("/cartographer");
  } finally {
    deleting.value = false;
  }
}

onBeforeRouteLeave((_to, _from, next) => {
  if (!dirty.value || saving.value || deleting.value || viewMode.value) return next();
  const ok = window.confirm("Unsaved changes will be lost. Leave anyway?");
  next(ok);
});

// ── Lifecycle ──────────────────────────────────────────────────────────────

const map = computed(() => loadedMap.value);

function onResize(): void {
  scheduleRender();
}

function onKeyDown(ev: KeyboardEvent): void {
  const target = ev.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
    return;
  }

  // Undo / redo — must check before the blanket Ctrl guard below.
  if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && ev.key.toLowerCase() === "z") {
    if (ev.shiftKey) redoEdit(); else undoEdit();
    ev.preventDefault();
    return;
  }

  // Leave all other OS shortcuts alone.
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

  const key = ev.key.toLowerCase();
  if (key === "c") {
    centerMap();
    ev.preventDefault();
    return;
  }

  // Q/E: rotate stamp by 90° CCW/CW. M6: [/] for ±1° fine rotation.
  if (activeTool.value === "stamp") {
    if (key === "q") {
      stampRotation.value = (stampRotation.value + 270) % 360;
      ev.preventDefault();
      return;
    }
    if (key === "e") {
      stampRotation.value = (stampRotation.value + 90) % 360;
      ev.preventDefault();
      return;
    }
    if (key === "[") {
      stampRotation.value = (stampRotation.value + 359) % 360;
      ev.preventDefault();
      return;
    }
    if (key === "]") {
      stampRotation.value = (stampRotation.value + 1) % 360;
      ev.preventDefault();
      return;
    }
  }
  const tool = TOOLS.find((t) => t.shortcut === key);
  if (tool && !tool.disabled) {
    activeTool.value = tool.id;
    ev.preventDefault();
  }
}

onMounted(async () => {
  await ensurePackLoaded();
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", onKeyDown);
  scheduleRender();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
  window.removeEventListener("keydown", onKeyDown);
  if (rafId) cancelAnimationFrame(rafId);
});
</script>

<style scoped>
.dialog-fade-enter-active,
.dialog-fade-leave-active { transition: opacity 0.15s ease; }
.dialog-fade-enter-active .relative,
.dialog-fade-leave-active .relative { transition: transform 0.15s ease, opacity 0.15s ease; }
.dialog-fade-enter-from,
.dialog-fade-leave-to { opacity: 0; }
.dialog-fade-enter-from .relative,
.dialog-fade-leave-to .relative { transform: scale(0.95); opacity: 0; }
</style>
