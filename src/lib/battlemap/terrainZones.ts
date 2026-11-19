// The difficult-ground zones a fight crosses. Pure and edge-importable: the Play screen and the server read the
// same zones the same way.

import { regionCellToBattleCell, type BattleSurface, type PlanRegion } from "./roomBridge.ts";

/**
 * The difficult-ground zones a fight on this surface crosses, with their cells in battle-map space. A room fight
 * keeps the zones that touch the room (a zone binds to nothing by rule, so this is a spatial filter, not a lookup
 * by room id); a whole-map fight has no room to focus, so every zone on the map counts (#1125).
 */
export function terrainZonesOf<R extends PlanRegion>(
  regions: readonly R[],
  surface: Pick<BattleSurface, "focusCells" | "calibration"> | null,
): { region: R; battleCells: string[] }[] {
  if (!surface) return [];
  const focusSet = surface.focusCells.length > 0 ? new Set(surface.focusCells) : null;
  const zones: { region: R; battleCells: string[] }[] = [];
  for (const region of regions) {
    if (region.region_role !== "zone") continue;
    if ((region.zone_payload.movement_cost ?? 1) <= 1) continue;
    const battleCells = region.cells.map((c) => regionCellToBattleCell(c, surface.calibration));
    if (focusSet === null || battleCells.some((c) => focusSet.has(c))) zones.push({ region, battleCells });
  }
  return zones;
}
