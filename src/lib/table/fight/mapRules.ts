import type { FactionDef, RunCombatant } from "@/types/encounter.types";
import { areHostile } from "@/lib/table/fight/foeView";

/**
 * The rules of the played character's map at the AI table (#1021, Solo Table canvas, frames 12 and 13). They are
 * plain functions so the guards can be tested without mounting a map.
 */

export type MoveVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Whether the played character may walk `feet` more now. Nobody is in the Dungeon Master's chair to wave a long
 * move through, so the table refuses one that would take the turn past the character's speed.
 */
export function moveAllowed(input: { canMove: boolean; speedFeet: number; movedFeet: number; feet: number }): MoveVerdict {
  const { canMove, speedFeet, movedFeet, feet } = input;
  if (!canMove) return { ok: false, reason: "It is not your turn." };
  if (movedFeet + feet > speedFeet) {
    const left = Math.max(0, speedFeet - movedFeet);
    return { ok: false, reason: `Too far: you have ${left} ft of movement left.` };
  }
  return { ok: true };
}

type Targetable = Pick<RunCombatant, "instance_id" | "faction_id" | "hp" | "reveal_state">;

/** Whether the played character can point at this creature: seen, standing, and a foe of theirs. */
export function isFoeOf(
  played: Pick<RunCombatant, "instance_id" | "faction_id">,
  other: Targetable,
  factions: readonly Pick<FactionDef, "id" | "hostile_to">[],
): boolean {
  if (other.instance_id === played.instance_id) return false;
  if (other.hp <= 0) return false;
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
