import { sortCombatantsByInitiative } from "@/rules/combatantSort";
import type { RunCombatant } from "@/types/encounter.types";
import type { Companion } from "@/types/companion.types";
import type { Monster, MonsterStatBlock } from "@/types/monster.types";
import type { NpcListRow } from "@/types/npc.types";
import { emptyDefenses, type Defenses, type SrdConditionName } from "@/types/statBlock.types";

/** The number in a printed AC ("15", "15 (natural armor)", "13 (hide armor), 15 with shield"), or null when there is none. */
export function parseArmorClass(ac: string): number | null {
  const m = ac.match(/\d+/);
  return m ? Number(m[0]) : null;
}

/**
 * The AC a combatant is attacked at, as the runner shows it: a party member's
 * live sheet AC (the combatant's own copy goes stale the moment the player dons
 * a shield), the beast's AC in Wild Shape, else the combatant's printed AC.
 * `sheet` is the party member's row, when the combatant is one.
 */
export function effectiveArmorClass(c: RunCombatant, sheet?: { ac: number; beastAc: string | null }): string {
  if (c.type === "player" && sheet) return sheet.beastAc ?? String(sheet.ac);
  return c.wildshape?.beast_ac ?? c.ac;
}

/** Cells per side of a combatant's footprint (Medium is 1). */
function sideCells(c: RunCombatant): number {
  return c.footprint ?? 1;
}

/**
 * Whether two combatants are within 5 feet of each other, from their grid
 * placement (5 ft per cell, diagonals count the same as straight lines). True
 * when the gap between their footprints is zero cells, i.e. they touch or
 * overlap. Null when either is not on the map, so the caller asks the DM
 * instead of guessing.
 */
export function withinFiveFeet(a: RunCombatant, b: RunCombatant): boolean | null {
  if (!a.position || !b.position) return null;
  const gap = (p: number, pSide: number, q: number, qSide: number) => Math.max(p - (q + qSide), q - (p + pSide), 0);
  const gx = gap(a.position.x, sideCells(a), b.position.x, sideCells(b));
  const gy = gap(a.position.y, sideCells(a), b.position.y, sideCells(b));
  // `gap` counts the empty cells between the footprints; adjacency is a gap of 0 cells.
  return Math.max(gx, gy) === 0;
}

/** Standing, or a player at 0 who is still dying (monsters at 0 are dead). */
function isStanding(c: RunCombatant): boolean {
  return c.hp > 0 || c.type === "player";
}

/**
 * Who an attacker can pick: everyone else, the living before the dead,
 * opponents (another faction) before allies, then in initiative order.
 */
export function targetCandidates(attacker: RunCombatant, all: RunCombatant[]): RunCombatant[] {
  const order = new Map(sortCombatantsByInitiative(all).map((c, i) => [c.instance_id, i]));
  const rank = (c: RunCombatant) => (isStanding(c) ? 0 : 2) + (c.faction_id !== attacker.faction_id ? 0 : 1);
  const position = (c: RunCombatant) => order.get(c.instance_id) ?? 0;
  return all
    .filter((c) => c.instance_id !== attacker.instance_id)
    .sort((a, b) => rank(a) - rank(b) || position(a) - position(b));
}

export interface DefenseLookup {
  monsters: Monster[];
  npcs: NpcListRow[];
  companions: Companion[];
}

function blockDefenses(block: MonsterStatBlock | null | undefined): Defenses {
  return block ? block.defenses : emptyDefenses();
}

/**
 * A combatant's typed defenses, from the stat block it was spawned from. Party
 * members (and anything whose source is gone) have none to read, so they take
 * damage as it comes.
 */
export function combatantDefenses(c: RunCombatant, lookup: DefenseLookup): Defenses {
  if (c.monster_id) return blockDefenses(lookup.monsters.find((m) => m.id === c.monster_id)?.stat_block);
  if (c.npc_id) return blockDefenses(lookup.npcs.find((n) => n.id === c.npc_id)?.stat_block);
  if (c.companion_id) return blockDefenses(lookup.companions.find((x) => x.id === c.companion_id)?.stat_block);
  return emptyDefenses();
}

/** Splits conditions an action would impose into the ones that land and the ones the target is immune to. */
export function filterImmuneConditions(
  conditions: SrdConditionName[],
  defenses: Defenses,
): { apply: SrdConditionName[]; immune: SrdConditionName[] } {
  const immune = conditions.filter((name) => defenses.condition_immunities.includes(name));
  return { apply: conditions.filter((name) => !immune.includes(name)), immune };
}
