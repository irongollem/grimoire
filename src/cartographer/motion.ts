// Whether a Drawing has anything that moves (#1125 frames 16-17): flowing water, swaying props, a flickering or
// pulsing light. The Motion button shows only then. Built from the same predicates the live snapshot uses
// (`objectSway`, `dressingSway`, `gatherLightSources`, a pack's `motion` overlays), so the button never offers
// motion the snapshot would not animate. No vue, no DOM.

import type { DressingCatalog } from "@/cartographer/dressing";
import { dressingSway, objectSway } from "@/cartographer/sway";
import { gatherLightSources } from "@/cartographer/drawLights";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { DungeonMapLayers } from "@/types/dungeonMap.types";

/** How often the motion snapshot is rebuilt while a drag is still under way (`createSnapshotScheduler`). */
export const MOTION_REBUILD_INTERVAL_MS = 250;

function packsWithOverlays(
  cells: Record<string, { pack_id: string }>,
  runtimes: ReadonlyMap<string, TilePackRuntime>,
  key: "terrainWater" | "solidBlock",
): boolean {
  const seen = new Set<string>();
  for (const cell of Object.values(cells)) {
    if (seen.has(cell.pack_id)) continue;
    seen.add(cell.pack_id);
    if ((runtimes.get(cell.pack_id)?.manifest.motion?.[key]?.length ?? 0) > 0) return true;
  }
  return false;
}

export function mapHasMotion(
  layers: DungeonMapLayers,
  runtimes: ReadonlyMap<string, TilePackRuntime>,
  dressing: DressingCatalog,
): boolean {
  if (packsWithOverlays(layers.terrain, runtimes, "terrainWater")) return true;
  if (packsWithOverlays(layers.solidBlock, runtimes, "solidBlock")) return true;
  for (const obj of Object.values(layers.object)) if (objectSway(obj, runtimes.get(obj.pack_id) ?? null)) return true;
  for (const placement of Object.values(layers.dressing)) {
    if (dressingSway(dressing.get(placement.prop_id))) return true;
  }
  const lights = gatherLightSources(layers, (id) => runtimes.get(id) ?? null, dressing, null);
  return lights.some(({ light }) => light.flicker !== undefined || light.pulse !== undefined);
}
