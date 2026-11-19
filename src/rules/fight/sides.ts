// Who fights whom in a fight (#1021). Pure and edge-importable (relative `.ts` imports only), because the browser's
// table and the server's turns must give the same answer: a creature the page shows as an ally cannot be one the
// server's own turn attacks.
//
// APP CONVENTION, from how an encounter is built: every combatant stands in a faction, and a faction declares whom
// it attacks (`FactionDef.hostile_to`; the defaults are Players, Enemy, Ally, Neutral). Two creatures are opponents
// when their factions differ and either declares the other. So an Ally fights beside the Players and a Neutral is
// nobody's foe. "A different faction" alone is not enough: that made an Ally creature attack the party when the app
// played its turn.

import type { FactionDef } from "../../types/encounter.types.ts";

/** The part of a fight's factions that says who fights whom. */
export type FactionSides = readonly Pick<FactionDef, "id" | "hostile_to">[];

/**
 * Whether two factions fight each other, read in either direction (hostility is not always declared on both).
 *
 * A fight that says nothing about either faction (no faction of that id in `factions`, as when a fight carries no
 * faction table at all) has only the faction ids to go by, so there a different faction is an opponent. Once either
 * faction is declared, only what is declared counts.
 */
export function areHostile(factions: FactionSides, a: string, b: string): boolean {
  if (a === b) return false;
  const of = (id: string) => factions.find((f) => f.id === id);
  const fa = of(a);
  const fb = of(b);
  if (fa === undefined && fb === undefined) return true;
  return fa?.hostile_to.includes(b) === true || fb?.hostile_to.includes(a) === true;
}

/** Whether `mover` would fight `other`. */
export function isHostileTo(mover: { faction_id: string }, other: { faction_id: string }, factions: FactionSides): boolean {
  return areHostile(factions, mover.faction_id, other.faction_id);
}
