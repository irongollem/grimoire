// Who is still in the fight. Pure and edge-importable (relative `.ts` imports only).
import type { RunCombatant } from "../../types/encounter.types.ts";

/** Still in the fight: above 0 hit points, or a player at 0 who is dying (monsters at 0 are dead). App convention. */
export function isStanding(c: Pick<RunCombatant, "hp" | "type">): boolean {
  return c.hp > 0 || c.type === "player";
}
