// What the options slips say: the Drawing slip's title and caption, what Place holds, the selected prop, the
// Zoning slip's title and the "regions changed since last publish" caution. Split out of MapWorkbench.vue (#1135).

import { computed, type ComputedRef, type Ref } from "vue";
import { useAllLibraryDressing } from "@/composables/cartographer/useLibraryDressing";
import { PLAN_TOOLS, TRACE_TOOL_OPTIONS, type usePlanPalette } from "@/composables/cartographer/usePlanPalette";
import { INVERTIBLE_TOOLS, RAIL_FAMILIES, TOOL_FAMILIES } from "@/composables/cartographer/workbenchTools";
import { placeItemLabel } from "@/cartographer/placeItem";
import type { PlaceItem, Tool } from "@/cartographer/tools";
import type { DressingCatalog } from "@/cartographer/dressing";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { DungeonMapLayers } from "@/types/dungeonMap.types";

export function useWorkbenchSlip(inputs: {
  layers: Ref<DungeonMapLayers>;
  activeTool: Ref<Tool>;
  placeItem: Ref<PlaceItem | null>;
  selectedDressingId: Ref<string | null>;
  dressingCatalog: Ref<DressingCatalog>;
  packRuntime: ComputedRef<TilePackRuntime | null>;
  plan: ReturnType<typeof usePlanPalette>;
  /** Alt is held (the canvas editor tracks it, and is built after this). */
  altHeld: () => boolean;
  changedSinceLastPublish: Ref<{ total: number } | null>;
  publishedSiteCount: () => number;
}) {
  const { layers, activeTool, placeItem, selectedDressingId, dressingCatalog, packRuntime, plan, altHeld, changedSinceLastPublish, publishedSiteCount } = inputs;
  const activeFamily = computed(() => RAIL_FAMILIES.find((f) => f.tools.some((t) => t.id === activeTool.value)));
  // What Place holds, as the options slip shows it: its name and, for a prop, its picture and
  // footprint. Resolved against every library prop, so a prop whose book was switched off still has a name.
  const { data: everyLibraryProp } = useAllLibraryDressing();
  const placeItemInfo = computed(() => {
    const item = placeItem.value;
    const prop = item?.kind === "prop" ? everyLibraryProp.value?.find((p) => p.id === item.propId) : undefined;
    return {
      label: item ? placeItemLabel(item, packRuntime.value?.manifest ?? null, (id) => everyLibraryProp.value?.find((p) => p.id === id)?.name) : "",
      imageUrl: prop ? prop.image_url : null,
      footprint: prop ? { w: prop.footprint_w, h: prop.footprint_h } : null,
    };
  });

  // The selected placed prop as the options slip shows it. A prop whose book was
  // switched off still resolves (the catalog holds every library prop), so
  // "Unknown prop" means the row is gone from the library altogether.
  const selectedDressingInfo = computed(() => {
    const id = selectedDressingId.value;
    const placement = id ? layers.value.dressing[id] : undefined;
    if (!placement) return null;
    return { name: dressingCatalog.value.get(placement.prop_id)?.name ?? "Unknown prop", rotation: placement.rotation };
  });

  /** The Drawing slip's title: the active tool's family, and under it what the family is
   *  for, or that the tool in hand is erasing while Alt is held over one with an inverse. */
  const slipTitle = computed(() => activeFamily.value?.label ?? "");
  const slipCaption = computed(() => {
    if (altHeld() && INVERTIBLE_TOOLS.has(activeTool.value)) return "erasing while Alt is held";
    const family = TOOL_FAMILIES.find((f) => f.id === activeFamily.value?.id);
    return family?.caption;
  });

  /** The Zoning slip's title: the tool and, for the Zone tool, how it is being traced ("Zone · Pen"). */
  const planToolLabel = computed(() => {
    const tool = plan.planTool.value;
    const toolLabel = PLAN_TOOLS.find((t) => t.id === tool)?.label ?? tool;
    if (tool !== "zone") return toolLabel;
    const trace = TRACE_TOOL_OPTIONS.find((o) => o.value === plan.traceTool.value)?.label;
    return trace ? `${toolLabel} · ${trace}` : toolLabel;
  });

  // "N regions changed since last publish" — only meaningful once the map has
  // been published at least once (a brand-new drawing has nothing to compare
  // against, and `changedSinceLastPublish` is null until then anyway).
  const changedRegionsCaution = computed(() => {
    const delta = changedSinceLastPublish.value;
    if (!delta || delta.total === 0 || publishedSiteCount() === 0) return null;
    return `${delta.total} region${delta.total === 1 ? "" : "s"} changed since last publish`;
  });

  return { activeFamily, placeItemInfo, selectedDressingInfo, slipTitle, slipCaption, planToolLabel, changedRegionsCaution };
}
