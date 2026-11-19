import { cellKey, parseCellKey, type CellKey } from "@/types/dungeonMap.types";
import type { RunCombatant } from "@/types/encounter.types";
import type { MapGrid } from "@/lib/battlemap/imageGrid";
import { seedTokenPositions } from "@/lib/battlemap/roomBridge";
import { scatterInRoom } from "@/lib/battlemap/scatter";
import { createOccupancy, startOffsets } from "@/lib/battlemap/occupancy";
import { combatantFootprint } from "@/lib/battlemap/tokenFootprint";

/**
 * Where everyone stands when a fight at the AI table opens (#1021): a solo player has no Dungeon Master to drag
 * tokens out of the tray, so the map is set before they look at it.
 *
 * In a traced room the party is seated in it and the foes are spread through the rest of it, as far from the party
 * as the room allows (the same two rules a DM's own fight uses: `seedTokenPositions`, `scatterInRoom`).
 *
 * On a map with no room to go by (a picture with a grid and nothing traced) the rules know no wall and no floor.
 * What the picture itself shows is used instead (`floor`, from `pictureFloor.ts`): the party stands on the ground
 * nearest the middle of the picture, and the foes about 30 feet away from it, counted in steps over ground, so both
 * sides are in the same space and nobody is in the black around the rooms. When the picture could not be read the
 * two sides face each other across its middle.
 *
 * Whoever already has a square keeps it; whoever cannot be fitted stays in the tray.
 */
export function soloSeating(
  combatants: RunCombatant[],
  ground: { focusCells: readonly CellKey[]; grid: MapGrid | null; floor?: ReadonlySet<CellKey> | null },
  opts: { footprintOf?: (c: RunCombatant) => number } = {},
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  // The party's side: the played characters and whoever shares a faction with one (an ally, a helper).
  const partyFactions = new Set(combatants.filter((c) => c.type === "player").map((c) => c.faction_id));
  const onPartySide = (c: RunCombatant): boolean => c.type === "player" || partyFactions.has(c.faction_id);
  if (ground.focusCells.length > 0) {
    // Whoever is on the party's side stands with the party, not with the foes: the room seating only knows "player"
    // and "everyone else", so for seating alone they count as players (the result is keyed by id, nothing else changes).
    const withParty = combatants.map((c) => (onPartySide(c) ? { ...c, type: "player" as const } : c));
    const seated = seedTokenPositions(withParty, [...ground.focusCells], opts);
    seated.forEach((c, i) => {
      if (c.position && !combatants[i].position) out.set(c.instance_id, c.position);
    });
    // The foes are spread with the party already standing, so they keep their distance from it.
    for (const [id, position] of scatterInRoom(seated, ground.focusCells, opts)) out.set(id, position);
    return out;
  }

  const sides = openGround(ground.grid, ground.floor ?? null);
  if (sides === null) return out;
  const footprintOf = opts.footprintOf ?? combatantFootprint;
  const { fits, claim } = createOccupancy(sides.standable);
  for (const c of combatants) if (c.position) claim(c.position.x, c.position.y, footprintOf(c));
  // Each takes the first spot in its side's order that is free: the order is what puts the sides where they belong.
  for (const c of combatants) {
    if (c.position) continue;
    const size = footprintOf(c);
    const spot = (onPartySide(c) ? sides.party : sides.foes)
      .flatMap(([x, y]) => startOffsets(size).map(([ox, oy]) => ({ x: x + ox, y: y + oy })))
      .find((p) => fits(p.x, p.y, size));
    if (!spot) continue;
    claim(spot.x, spot.y, size);
    out.set(c.instance_id, spot);
  }
  return out;
}

/** Steps over ground between the sides when a fight opens: six squares is 30 feet, a round's walk. */
const OPENING_STEPS = 6;

type Cell = [number, number];
const near = (to: Cell) => (a: Cell, b: Cell) => Math.hypot(a[0] - to[0], a[1] - to[1]) - Math.hypot(b[0] - to[0], b[1] - to[1]);

/** The squares each side fills, in the order it fills them, and every square anyone may stand on. */
function openGround(grid: MapGrid | null, floor: ReadonlySet<CellKey> | null): { party: Cell[]; foes: Cell[]; standable: Set<CellKey> } | null {
  if (grid === null || grid.cols < 1 || grid.rows < 1) return null;
  const middle: Cell = [Math.floor(grid.cols / 2), Math.floor(grid.rows / 2)];

  if (floor !== null && floor.size > 0) {
    const cells = [...floor].map((k) => parseCellKey(k) as Cell);
    const start = [...cells].sort(near(middle))[0];
    // Steps over ground from where the party stands, so the foes are somewhere the party can walk to.
    const steps = new Map<CellKey, number>([[cellKey(start[0], start[1]), 0]]);
    const queue: Cell[] = [start];
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      const here = steps.get(cellKey(x, y))!;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as Cell[]) {
        const key = cellKey(nx, ny);
        if (!floor.has(key) || steps.has(key)) continue;
        steps.set(key, here + 1);
        queue.push([nx, ny]);
      }
    }
    const reached = queue;
    const stepsOf = (c: Cell) => steps.get(cellKey(c[0], c[1]))!;
    const farthest = Math.max(...reached.map(stepsOf));
    const wanted = Math.min(OPENING_STEPS, farthest);
    return {
      party: [...reached].sort((a, b) => stepsOf(a) - stepsOf(b)),
      foes: [...reached].sort((a, b) => Math.abs(stepsOf(a) - wanted) - Math.abs(stepsOf(b) - wanted)),
      standable: new Set(reached.map(([x, y]) => cellKey(x, y))),
    };
  }

  const all: Cell[] = [];
  for (let y = 0; y < grid.rows; y++) for (let x = 0; x < grid.cols; x++) all.push([x, y]);
  // Three squares either side of the middle row, clamped onto the picture.
  const row = (dy: number) => Math.min(grid.rows - 1, Math.max(0, middle[1] + dy));
  return {
    party: [...all].sort(near([middle[0], row(OPENING_STEPS / 2)])),
    foes: [...all].sort(near([middle[0], row(-OPENING_STEPS / 2)])),
    standable: new Set(all.map(([x, y]) => cellKey(x, y))),
  };
}
