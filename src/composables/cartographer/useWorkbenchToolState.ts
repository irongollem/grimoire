// The Drawing tools' own state: what is armed, how it is put down, and what the options slip edits. Plain refs
// the workbench hands to the canvas editor and the slip; split out of MapWorkbench.vue (#1135).

import { ref } from "vue";
import type { AppInputHandle } from "@/components/common/controls/fieldVariants";
import type { PlaceItem, Tool } from "@/cartographer/tools";
import { pushRecent } from "@/cartographer/placeItem";
import { STAMP_CATEGORIES } from "@/cartographer/stampCategories";
import type { WallKind } from "@/cartographer/wallKinds";
import type { TileLight } from "@/cartographer/packSchema";
import type { BrushRegionMode, GroundWallMode } from "@/types/dungeonMap.types";
import type { TemplateShape } from "@/composables/cartographer/mapCanvasEditor.types";

export function useWorkbenchToolState() {
  // The default tool on open: a DM's first tap must never paint. Select sits first in its family with Pan.
  const activeTool = ref<Tool>("select");
  // The placed prop that is selected (epic #1062).
  const selectedDressingId = ref<string | null>(null);

  // Place tool state (#1073 story 11): what is armed, the rotation it goes down at, and the
  // last few picks. The default is the set's first object type, mixing its variants.
  const placeItem = ref<PlaceItem | null>({ kind: "object", category: STAMP_CATEGORIES[0], variant: "any" });
  const placeRotation = ref(0); // degrees; free rotation (any integer 0–359)
  const recentPlaced = ref<PlaceItem[]>([]);
  function pickPlaceItem(item: PlaceItem): void {
    placeItem.value = item;
    // What was selected on the map no longer is: Q/E and Delete now mean the item in hand.
    selectedDressingId.value = null;
    recentPlaced.value = pushRecent(recentPlaced.value, item);
  }

  // Wall tool state (tile packs v4): which kind of edge it paints, and which
  // `wallDecal` variant the Decal kind sets on an existing wall.
  const activeWallKind = ref<WallKind>("wall");
  const activeWallDecal = ref(0);

  // Light tool state (#1125 story 5): what the next light placed is made of. A torch's reach by the rules
  // (20 ft bright and 20 ft dim); the slip edits it, and edits the selected light instead when one is picked.
  const lightDraft = ref<TileLight>({ color: "#ffb347", bright: 20, dim: 20 });


  const activeTemplateShape = ref<TemplateShape>("circle");

  // Round brush radius in cells (fractional)
  const brushRadius = ref(1.5);
  const brushRegionMode = ref<BrushRegionMode>("new");
  const brushCategory = ref<"floor" | "terrainWater">("floor");
  const brushWallMode = ref<GroundWallMode>("none");
  const wallVisible = ref(true);
  // Whether the Rectangle tool also wraps its perimeter in walls (on by default)
  const rectWalls = ref(true);

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


  return {
    activeTool, selectedDressingId, placeItem, placeRotation, recentPlaced, pickPlaceItem, activeWallKind, activeWallDecal,
    lightDraft, activeTemplateShape, brushRadius, brushRegionMode, brushCategory, brushWallMode, wallVisible, rectWalls,
    selectedCell, toolOptionsRef,
  };
}
