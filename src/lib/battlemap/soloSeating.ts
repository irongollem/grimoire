import { cellKey, type CellKey } from "@/types/dungeonMap.types";
import type { RunCombatant } from "@/types/encounter.types";
import type { MapGrid } from "@/lib/battlemap/imageGrid";
import { seedTokenPositions } from "@/lib/battlemap/roomBridge";
import { scatterInRoom } from "@/lib/battlemap/scatter";

/**
 * Where everyone stands when a fight at the AI table opens (#1021): a solo player has no Dungeon Master to drag
 * tokens out of the tray, so the map is set before they look at it.
 *
 * In a traced room the party is seated in it and the foes are spread through the rest of it, as far from the party
 * as the room allows (the same two rules a DM's own fight uses: `seedTokenPositions`, `scatterInRoom`). On a map
 * with no room to go by (a picture with a grid and nothing traced) the rules know no wall and no floor, so the two
 * sides face each other across the middle of the picture, about 30 feet apart, where the player can see and move
 * them. Whoever already has a square keeps it; whoever cannot be fitted stays in the tray.
 */
export function soloSeating(
  combatants: RunCombatant[],
  ground: { focusCells: readonly CellKey[]; grid: MapGrid | null },
  opts: { footprintOf?: (c: RunCombatant) => number } = {},
): Map<string, { x: number; y: number }> {
  const sides = ground.focusCells.length > 0 ? { party: [...ground.focusCells], foes: [...ground.focusCells] } : openGround(ground.grid);
  const out = new Map<string, { x: number; y: number }>();
  if (sides === null) return out;

  const seated = seedTokenPositions(combatants, sides.party, opts);
  seated.forEach((c, i) => {
    if (c.position && !combatants[i].position) out.set(c.instance_id, c.position);
  });
  // The foes are spread with the party already standing, so they keep their distance from it.
  for (const [id, position] of scatterInRoom(seated, sides.foes, opts)) out.set(id, position);
  return out;
}

/** Two blocks of squares either side of the picture's middle: the party below it, the foes above. */
function openGround(grid: MapGrid | null): { party: CellKey[]; foes: CellKey[] } | null {
  if (grid === null || grid.cols < 1 || grid.rows < 1) return null;
  const cx = Math.floor(grid.cols / 2);
  const cy = Math.floor(grid.rows / 2);
  const block = (x0: number, x1: number, y0: number, y1: number): CellKey[] => {
    const cells: CellKey[] = [];
    for (let y = Math.max(0, y0); y <= Math.min(grid.rows - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(grid.cols - 1, x1); x++) cells.push(cellKey(x, y));
    }
    return cells;
  };
  // Six squares between the nearest of each side is 30 feet: a round's walk, so the first turn is a choice.
  const party = block(cx - 2, cx + 2, cy + 2, cy + 3);
  const foes = block(cx - 4, cx + 4, cy - 6, cy - 4);
  const all = block(0, grid.cols - 1, 0, grid.rows - 1);
  // A picture too small for two blocks: everyone shares what there is.
  return { party: party.length > 0 ? party : all, foes: foes.length > 0 ? foes : all };
}
