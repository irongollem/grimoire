// Who fights beside whom (#1021). Pure and edge-importable (relative `.ts` imports only). The other half of `sides.ts`:
// that file says who is an opponent, this one says who is a friend, so a heal or a buff never lands on a creature that
// is merely not an enemy.

import { areHostile, type FactionSides } from "./sides.ts";

/**
 * Whether `other` fights on `mover`'s side. APP CONVENTION (the books have no factions):
 * - a creature of the mover's own faction is an ally;
 * - otherwise a creature is an ally when its faction is not hostile to the mover's AND the two factions share at least
 *   one declared enemy (the Players and the Ally faction both oppose Enemy, so they fight side by side);
 * - a faction hostile to nobody, like Neutral, shares no enemy with anyone, so it is neither ally nor foe.
 * With no faction table at all nothing is declared, so only the mover's own faction is an ally (as `areHostile` reads a
 * different faction there as an opponent).
 */
export function isAllyOf(mover: { faction_id: string }, other: { faction_id: string }, factions: FactionSides): boolean {
  const a = mover.faction_id;
  const b = other.faction_id;
  if (a === b) return true;
  if (areHostile(factions, a, b)) return false;
  return factions.some((f) => f.id !== a && f.id !== b && areHostile(factions, a, f.id) && areHostile(factions, b, f.id));
}
