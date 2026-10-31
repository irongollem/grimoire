import type { RunCombatant } from "@/types/encounter.types";

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
