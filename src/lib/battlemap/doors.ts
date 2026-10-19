// Doors in play (epic #1073): the Cartographer draws each door shut or open, and during a fight the DM overrides that
// per door. The override list lives on the fight (`encounter_state.door_states`), a door it does not name keeps its
// drawn state, and it holds only doors that differ, so "everything as drawn" is the empty list. Pure and DOM-free.

import type { MapLiveDoor, MapLiveDoorState } from "@/types/mapLive.types";

/** The doors at the state they have in play: the drawn doors with the DM's overrides laid over them. */
export function effectiveDoors(drawn: readonly MapLiveDoor[], overrides: readonly MapLiveDoorState[]): MapLiveDoor[] {
  if (overrides.length === 0) return [...drawn];
  const byEdge = new Map(overrides.map((o) => [o.edge, o.open]));
  return drawn.map((d) => {
    const open = byEdge.get(d.edge);
    return open === undefined ? d : { ...d, open };
  });
}

/** Where an edge's midpoint sits, in image cells: an N edge is the top of its cell, a W edge its left. */
function edgeMidpoint(edge: string): [number, number] | null {
  const [cell, side] = edge.split(":");
  const [xs, ys] = cell.split(",");
  const x = Number(xs);
  const y = Number(ys);
  if (side === "N") return [x + 0.5, y];
  if (side === "W") return [x, y + 0.5];
  return null;
}

/** The door whose edge midpoint is nearest the point (fractional image cells) and within `reach` cells, else null. */
export function doorEdgeAt(doors: readonly MapLiveDoorState[], x: number, y: number, reach = 0.4): string | null {
  let best: string | null = null;
  let bestDist = reach;
  for (const door of doors) {
    const mid = edgeMidpoint(door.edge);
    if (!mid) continue;
    const dist = Math.hypot(mid[0] - x, mid[1] - y);
    if (dist <= bestDist) {
      best = door.edge;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * The override list after the DM flips one door: the door takes the opposite of its state in play. An override that
 * would only restate the drawn state is dropped, so the list stays the minimal set of differences. A new array.
 */
export function toggleDoor(
  drawn: readonly MapLiveDoor[],
  overrides: readonly MapLiveDoorState[],
  edge: string,
): MapLiveDoorState[] {
  const door = effectiveDoors(drawn, overrides).find((d) => d.edge === edge);
  if (!door) return [...overrides];
  const next = !door.open;
  const original = drawn.find((d) => d.edge === edge);
  const rest = overrides.filter((o) => o.edge !== edge);
  return original && original.open === next ? rest : [...rest, { edge, open: next }];
}

/**
 * Whether two override lists say the same thing. A re-read of the fight hands every viewer a fresh array of equal
 * content; views keep the previous one so the occluders and light grids memoised on its identity are not rebuilt.
 */
export function sameDoorStates(a: readonly MapLiveDoorState[], b: readonly MapLiveDoorState[]): boolean {
  return a.length === b.length && a.every((s, i) => s.edge === b[i].edge && s.open === b[i].open);
}
