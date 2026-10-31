import { combatantFootprint } from "@/lib/battlemap/tokenFootprint";
import type { FactionDef, RunCombatant } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";

/** Combatants the map has no square for yet: the "Not on the map yet" tray lists exactly these. */
export function unplacedCombatants(combatants: readonly RunCombatant[]): RunCombatant[] {
  return combatants.filter((c) => !c.position);
}

/** Everyone with a square, in roster order: what the token layer draws. */
export function placedCombatants(combatants: readonly RunCombatant[]): RunCombatant[] {
  return combatants.filter((c) => c.position);
}

/** The square under a pointer, for a token dropped there: the whole cell the fractional position falls in. */
export function dropCell(at: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.floor(at.x), y: Math.floor(at.y) };
}

/** Whether a square lies on the picture: a portrait dropped past its edge would seat a token off the map. */
export function cellOnMap(cell: { x: number; y: number }, cellsAcross: number, cellsDown: number): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < cellsAcross && cell.y < cellsDown;
}

/** The cells per side of a token on the map: its size now (override, beast form, baked), else its monster's (hand-built combatants). */
export function footprintOf(c: RunCombatant, monsters: readonly Pick<Monster, "id" | "size">[]): number {
  const size = c.size ?? (c.monster_id ? monsters.find((m) => m.id === c.monster_id)?.size : undefined);
  return combatantFootprint({ ...c, size });
}

/** Whether two token boxes touch, corners included (5e adjacency: any square next to the creature's own space). */
function touching(a: { at: { x: number; y: number }; size: number }, b: { at: { x: number; y: number }; size: number }): boolean {
  return a.at.x <= b.at.x + b.size && b.at.x <= a.at.x + a.size && a.at.y <= b.at.y + b.size && b.at.y <= a.at.y + a.size;
}

/**
 * The standing foes whose space touches this combatant's, the turn card's
 * "next to Goblin 3". A foe is a combatant of a faction either side is hostile to; the fallen are left out.
 */
export function adjacentFoes(
  subject: RunCombatant,
  all: readonly RunCombatant[],
  factions: readonly Pick<FactionDef, "id" | "hostile_to">[],
  monsters: readonly Pick<Monster, "id" | "size">[],
): RunCombatant[] {
  if (!subject.position) return [];
  const hostile = (id: string) => factions.find((f) => f.id === id)?.hostile_to ?? [];
  const mine = { at: subject.position, size: footprintOf(subject, monsters) };
  return all.filter((other) => {
    if (other.instance_id === subject.instance_id || !other.position || other.hp <= 0) return false;
    const foes = hostile(subject.faction_id).includes(other.faction_id) || hostile(other.faction_id).includes(subject.faction_id);
    return foes && touching(mine, { at: other.position, size: footprintOf(other, monsters) });
  });
}

/** Feet a combatant has moved this turn; absent means none. */
export function movementUsedOf(c: RunCombatant | undefined): number {
  return c?.movement_used === undefined ? 0 : c.movement_used;
}
