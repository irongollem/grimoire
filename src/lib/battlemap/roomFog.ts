import { regionCellToBattleCell } from "@/lib/battlemap/roomBridge";
import { cellKey } from "@/types/dungeonMap.types";
import type { GridCalibration } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

/**
 * The room under a point, as the battle cells to reveal (#1125 frame 11, Fog "Room": "reveals a whole traced room
 * with one click"). A room is a traced `space` region; a zone is terrain, never a room. Null when the point is on no
 * room. The cells are the region's own, so `roomsRevealedInCombat` finds the room revealed when the fight ends.
 */
export function roomCellsAt(
  regions: readonly LocationMapRegion[],
  calibration: GridCalibration,
  at: { x: number; y: number },
): Set<string> | null {
  const here = cellKey(Math.floor(at.x), Math.floor(at.y));
  for (const region of regions) {
    if (region.region_role !== "space") continue;
    const battle = region.cells.map((c) => regionCellToBattleCell(c, calibration));
    if (battle.includes(here)) return new Set(battle);
  }
  return null;
}
