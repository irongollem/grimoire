// Doors in play (epic #1073): the Cartographer draws each door shut or open, and during a fight the DM overrides that
// per door. The override list lives on the fight (`encounter_state.door_states`), a door it does not name keeps its
// drawn state, and it holds only doors that differ, so "everything as drawn" is the empty list. Pure and DOM-free.

import type { Point } from "@/lib/battlemap/walls";
import type { MapLiveDoor, MapLiveDoorState } from "@/types/mapLive.types";

/** The doors at the state they have in play: the drawn doors with the DM's overrides laid over them. */
export function effectiveDoors(drawn: readonly MapLiveDoor[], overrides: readonly MapLiveDoorState[]): MapLiveDoor[] {
  if (overrides.length === 0) return [...drawn];
  const byId = new Map(overrides.map((o) => [o.id, o.open]));
  return drawn.map((d) => {
    const open = byId.get(d.id);
    return open === undefined ? d : { ...d, open };
  });
}

/** How far a point is from a segment, in cells. */
function distanceToSegment(x: number, y: number, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / lenSq));
  return Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y);
}

/** The id of the door whose segment is nearest the point (fractional image cells) and within `reach` cells, else null. */
export function doorAt(doors: readonly MapLiveDoor[], x: number, y: number, reach = 0.4): string | null {
  let best: string | null = null;
  let bestDist = reach;
  for (const door of doors) {
    const dist = distanceToSegment(x, y, door.a, door.b);
    if (dist <= bestDist) {
      best = door.id;
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
  id: string,
): MapLiveDoorState[] {
  const door = effectiveDoors(drawn, overrides).find((d) => d.id === id);
  if (!door) return [...overrides];
  const next = !door.open;
  const original = drawn.find((d) => d.id === id);
  const rest = overrides.filter((o) => o.id !== id);
  return original && original.open === next ? rest : [...rest, { id, open: next }];
}

/**
 * Whether two override lists say the same thing. A re-read of the fight hands every viewer a fresh array of equal
 * content; views keep the previous one so the occluders and light grids memoised on its identity are not rebuilt.
 */
export function sameDoorStates(a: readonly MapLiveDoorState[], b: readonly MapLiveDoorState[]): boolean {
  return a.length === b.length && a.every((s, i) => s.id === b[i].id && s.open === b[i].open);
}
