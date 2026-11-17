import type { FactionDef, RunCombatant } from "@/types/encounter.types";
import { areHostile } from "@/lib/table/fight/foeView";

/**
 * The rules of the played character's map at the AI table (#1021, Solo Table canvas, frames 12 and 13). They are
 * plain functions so the guards can be tested without mounting a map.
 */

export type MoveVerdict = { ok: true } | { ok: false; reason: string };

type Targetable = Pick<RunCombatant, "instance_id" | "faction_id" | "hp" | "reveal_state" | "bystander">;

/** Whether the played character can point at this creature: seen, standing, and a foe of theirs. */
export function isFoeOf(
  played: Pick<RunCombatant, "instance_id" | "faction_id">,
  other: Targetable,
  factions: readonly Pick<FactionDef, "id" | "hostile_to">[],
): boolean {
  if (other.instance_id === played.instance_id) return false;
  if (other.hp <= 0) return false;
  // A bystander is in the room, not in the fight, whatever faction a custom encounter would put it in.
  if (other.bystander === true) return false;
  // Hidden and unseen creatures are not on the player's map as themselves, so they cannot be picked.
  if (other.reveal_state !== undefined && other.reveal_state !== "revealed") return false;
  return areHostile(factions, played.faction_id, other.faction_id);
}

/** The instance id an armed map hands back for a click, or null when nothing is to be picked. */
export function targetOf(input: {
  arming: boolean;
  clicked: Targetable | null;
  played: Pick<RunCombatant, "instance_id" | "faction_id"> | null;
  factions: readonly Pick<FactionDef, "id" | "hostile_to">[];
}): string | null {
  const { arming, clicked, played, factions } = input;
  if (!arming || !clicked || !played) return null;
  return isFoeOf(played, clicked, factions) ? clicked.instance_id : null;
}

/** The creature whose space holds a point of the map (in cells); the later one in the list wins an overlap, as it is drawn on top. */
export function combatantAt<T extends { position?: { x: number; y: number } | null }>(
  point: { x: number; y: number },
  combatants: readonly T[],
  footprintOf: (c: T) => number,
): T | null {
  let found: T | null = null;
  for (const c of combatants) {
    const at = c.position;
    if (!at) continue;
    const size = footprintOf(c);
    if (point.x >= at.x && point.x < at.x + size && point.y >= at.y && point.y < at.y + size) found = c;
  }
  return found;
}

/** Where a square lies for the mover: within what the turn can still walk, or only with the Dash action added. */
export type ReachZone = "walk" | "dash";

/**
 * The squares the played character can end in this turn, each marked by what it takes to get there (the maintainer's
 * ask: green where you can walk, orange where a Dash would take you). `leftFeet` is what the turn can still walk
 * as it stands; a square that costs more is one the search reached only on the feet a Dash would add. The square
 * the character stands on is not drawn.
 */
export function reachZones(cells: Iterable<{ cell: { x: number; y: number }; feet: number }>, leftFeet: number): Array<{ x: number; y: number; zone: ReachZone }> {
  const zones: Array<{ x: number; y: number; zone: ReachZone }> = [];
  for (const { cell, feet } of cells) {
    if (feet <= 0) continue;
    zones.push({ x: cell.x, y: cell.y, zone: feet <= leftFeet ? "walk" : "dash" });
  }
  return zones;
}

/**
 * Whether the played character may walk to a square the search found, and what it says when not. `feet` is the
 * cheapest way there round walls and creatures, or null when there is none within even a Dash.
 */
export function walkVerdict(input: { canMove: boolean; leftFeet: number; feet: number | null }): MoveVerdict {
  if (!input.canMove) return { ok: false, reason: "It is not your turn." };
  if (input.feet === null) return { ok: false, reason: "You cannot get there this turn." };
  if (input.feet > input.leftFeet) return { ok: false, reason: `Too far: that is ${input.feet} ft and you have ${Math.max(0, input.leftFeet)} ft left. Dash first.` };
  return { ok: true };
}
