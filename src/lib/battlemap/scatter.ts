import { parseCellKey, type CellKey } from "@/types/dungeonMap.types";
import type { RunCombatant } from "@/types/encounter.types";
import { combatantFootprint } from "@/lib/battlemap/tokenFootprint";
import { createOccupancy, startOffsets } from "@/lib/battlemap/occupancy";

/**
 * Scatters every unplaced non-player combatant across a room (#1125 decision 11, "Scatter in a room").
 *
 * Spread rule: each creature, largest first, takes the free spot farthest from every token already on the map (the
 * party and anyone placed included) and from the creatures scattered before it; ties go to reading order. With nothing
 * on the map yet the first creature takes the spot nearest the room's middle. Deterministic, so a test can pin it.
 * A creature the room has no space left for is not in the result, so it stays in the tray.
 */
export function scatterInRoom(
  combatants: readonly RunCombatant[],
  roomCells: readonly CellKey[],
  opts: { footprintOf?: (c: RunCombatant) => number } = {},
): Map<string, { x: number; y: number }> {
  const footprintOf = opts.footprintOf ?? combatantFootprint;
  const placements = new Map<string, { x: number; y: number }>();
  if (roomCells.length === 0) return placements;

  const cells = roomCells.map((k) => parseCellKey(k)).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const { fits, claim } = createOccupancy(new Set(roomCells));
  const anchors: { x: number; y: number }[] = [];

  for (const c of combatants) {
    if (!c.position) continue;
    const size = footprintOf(c);
    claim(c.position.x, c.position.y, size);
    anchors.push({ x: c.position.x + size / 2, y: c.position.y + size / 2 });
  }
  const middle = {
    x: cells.reduce((sum, [x]) => sum + x + 0.5, 0) / cells.length,
    y: cells.reduce((sum, [, y]) => sum + y + 0.5, 0) / cells.length,
  };

  const waiting = combatants
    .filter((c) => c.type !== "player" && !c.position)
    .map((c) => ({ c, size: footprintOf(c) }))
    // Big creatures first: they are the ones that need a clear block. The sort is stable, so equals keep roster order.
    .sort((a, b) => b.size - a.size);

  for (const { c, size } of waiting) {
    let best: { x: number; y: number; score: number } | null = null;
    for (const [cx, cy] of cells) {
      for (const [ox, oy] of startOffsets(size)) {
        const x = cx + ox;
        const y = cy + oy;
        if (!fits(x, y, size)) continue;
        const centre = { x: x + size / 2, y: y + size / 2 };
        const score = anchors.length > 0
          ? Math.min(...anchors.map((a) => Math.hypot(a.x - centre.x, a.y - centre.y)))
          : -Math.hypot(middle.x - centre.x, middle.y - centre.y);
        if (best === null || score > best.score) best = { x, y, score };
      }
    }
    if (best === null) continue;
    claim(best.x, best.y, size);
    anchors.push({ x: best.x + size / 2, y: best.y + size / 2 });
    placements.set(c.instance_id, { x: best.x, y: best.y });
  }
  return placements;
}
