// The inputs `useMapCanvasEditor` takes, kept apart so the composables split out of it
// (render, pointer, touch, brush, painting) can name the slice of them they use.

import type { ComputedRef, Ref } from "vue";
import type { AppInputHandle } from "@/components/common/controls/fieldVariants";
import type { PlaceItem, Tool } from "@/cartographer/tools";
import type { EditorLayer } from "@/cartographer/keymap";
import type { CellKey, DungeonMapLayers, CellMetadata, DarknessLevel, BrushRegionMode, GroundRegion, GroundWallMode } from "@/types/dungeonMap.types";
import type { PackCategory, TileLight } from "@/cartographer/packSchema";
import type { WallKind } from "@/cartographer/wallKinds";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { DressingCatalog } from "@/cartographer/dressing";
import type { MapRenderReferenceImage } from "@/cartographer/renderMap";
import type { usePlanPalette } from "@/composables/cartographer/usePlanPalette";

export type TemplateShape = "circle" | "octagon" | "hex";

export interface MapCanvasEditorOptions {
  canvasEl: Ref<HTMLCanvasElement | null>;
  layers: Ref<DungeonMapLayers>;
  metadata: Ref<Record<CellKey, CellMetadata>>;
  dirty: Ref<boolean>;
  /** Bumped on every edit that sets `dirty` — not just the false→true
   *  transition `dirty` itself only reports once. The host's autosave
   *  (`useSiteDrawingEditor`) re-arms its debounce off this so a stroke made
   *  while a save is already in flight doesn't go unscheduled (#884 review
   *  finding 1: `dirty` staying `true` across a second edit fires no
   *  `update:dirty` event at all). */
  editRevision: Ref<number>;
  currentPackId: Ref<string>;
  /** The map's ambient light; the preview lays the DM's veil for it over the drawing. */
  darkness: Ref<DarknessLevel>;
  packRuntime: ComputedRef<TilePackRuntime | null>;
  selectablePacks: ComputedRef<ReadonlyArray<{ pack_id: string; pack_version: number }>>;
  loadedRuntimes: Ref<Map<string, TilePackRuntime>>;
  /** Dressing props by id (epic #1062); swapped for a new Map as art loads. */
  dressing: Ref<DressingCatalog>;
  /** The Place tool's state MapWorkbench owns so its drawer and slip can show it: what is
   *  armed (an object, a prop, or null for nothing), and the placed prop that is selected
   *  (epic #1062). */
  placeItem: Ref<PlaceItem | null>;
  selectedDressingId: Ref<string | null>;
  cellGlyphs: ComputedRef<Record<CellKey, PackCategory>>;
  activeTool: Ref<Tool>;
  /** Enough of the palette for hotkey resolution — MapWorkbench owns the full `TOOLS` array. */
  tools: ReadonlyArray<{ id: Tool; shortcut?: string; disabled?: boolean }>;
  /** Degrees an object or prop is put down at, shared by both (Q/E turn it). */
  placeRotation: Ref<number>;
  /** What the wall tool paints (or, for "decal", sets on an existing wall) and the decal variant it sets. */
  activeWallKind: Ref<WallKind>;
  activeWallDecal: Ref<number>;
  wallVisible?: Ref<boolean>;
  /** What the Light tool puts down next: colour, reach and flicker, edited in the slip. */
  lightDraft: Ref<TileLight>;
  activeTemplateShape: Ref<TemplateShape>;
  /** Round brush radius in cells (fractional); `[` / `]` change it, the tool options show it. */
  brushRadius: Ref<number>;
  brushRegionMode?: Ref<BrushRegionMode>;
  brushWallMode?: Ref<GroundWallMode>;
  brushCategory?: Ref<GroundRegion["category"]>;
  /** Rectangle: whether the perimeter is also wrapped in walls (the tool's "Walls" option). */
  rectWalls: Ref<boolean>;
  selectedCell: Ref<[number, number] | null>;
  toolOptionsRef: Ref<{ annotationInputEl: AppInputHandle | null } | null>;
  /** Deterministic-variant seed string — "new" for an unsaved map, else the map id. */
  mapKey: ComputedRef<string>;
  /** The site reference layer (#884 S6), positioned by the caller against
   *  this frame's own `tilePx`/`viewportOffset` — see MapWorkbench's
   *  `buildReferenceImage`. Null when there's no site (the standalone route). */
  getReferenceImage: (tilePx: number, viewportOffset: { x: number; y: number }) => MapRenderReferenceImage | null;
  /** Extra reactive values that should trigger a re-render when they change
   *  (the reference-layer toggle + its loaded image) — kept as an opaque
   *  list so this module doesn't need to know what they mean. */
  extraRenderDeps: unknown[];
  /** The Plan layer (#884 S7b) — absent entirely when there's no `site`, the
   *  same "the whole feature doesn't exist without a site" rule the
   *  reference layer already follows. When present, `activeLayer` decides
   *  whether a pointer gesture on this canvas means the Drawing (every tool
   *  above) or the Plan (`planTools`, built from this composable's own
   *  `plan`) — see `handleActiveLayerPointerDown` below for the split. */
  plan?: ReturnType<typeof usePlanPalette>;
  activeLayer?: Ref<EditorLayer>;
  /** The map has the Base image / Drawing / Zoning tabs, so 1, 2 and 3 switch them. */
  hasLayerTabs?: boolean;
  /** Opacity of the square grid, or null while it is switched off. */
  gridAlpha: Ref<number | null>;
  /** G: show or hide the grid. */
  toggleGrid: () => void;
  /** Whether Space and the zoom keys are this canvas's to take. The editor listens on the
   *  window, and the workbench also sits inside whole pages (the Atlas) whose other
   *  controls need Space and the browser's own zoom, so the host answers true only while
   *  the pointer is over the map or focus is inside it. Omitted: always. */
  keysActive?: () => boolean;
  /** X: trade the active and second tile sets. */
  swapTileSets?: () => void;
  /**
   * The ground half of the map while motion plays (#1125 frames 16-17): a canvas under this one that holds the
   * background and the ground, so the live water can lie between it and what stands. Null or absent: one canvas.
   */
  groundCanvasEl?: Ref<HTMLCanvasElement | null>;
  /**
   * The editing aids while motion plays: a transparent canvas above the animated darkness veil, so a label, a
   * selection outline or a wall node is never dimmed by it. Absent or null: the aids are drawn on the main canvas.
   */
  aidsCanvasEl?: Ref<HTMLCanvasElement | null>;
  /** Motion is playing over the map, so both canvases leave out what the live layer draws itself. */
  motionPlaying?: () => boolean;
}
