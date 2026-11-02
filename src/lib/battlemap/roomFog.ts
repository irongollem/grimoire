import { battleCellToRegionCell, regionCellToBattleCell } from "@/lib/battlemap/roomBridge";
import { pointInRing } from "@/lib/locations/polygon";
import { usableRing } from "@/lib/locations/regionShape";
import { cellKey, parseCellKey } from "@/types/dungeonMap.types";
import type { GridCalibration } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

/**
 * The room under a point, as the battle cells to reveal (#1125 frame 11, Fog "Room": "reveals a whole traced room
 * with one click"). A room is a traced `space` region; a zone is terrain, never a room. Null when the point is on no
 * room. The cells are the region's own battle cells.
 * A room found from the walls holds the point by its outline, not by its squares: a point inside a round chapel's
 * curve is in the room even where the square under it has its middle outside the curve, and a point outside the
 * curve is not, even where a square of the room reaches past it.
 */
export function roomCellsAt(
  regions: readonly LocationMapRegion[],
  calibration: GridCalibration,
  at: { x: number; y: number },
): Set<string> | null {
  const here = cellKey(Math.floor(at.x), Math.floor(at.y));
  const [rx, ry] = parseCellKey(battleCellToRegionCell(here, calibration));
  const inRegionSpace: [number, number] = [rx + (at.x - Math.floor(at.x)), ry + (at.y - Math.floor(at.y))];
  for (const region of regions) {
    if (region.region_role !== "space") continue;
    const battle = region.cells.map((c) => regionCellToBattleCell(c, calibration));
    const ring = usableRing(region.vertices);
    const hit = ring ? pointInRing(inRegionSpace[0], inRegionSpace[1], ring) : battle.includes(here);
    if (hit) return new Set(battle);
  }
  return null;
}
