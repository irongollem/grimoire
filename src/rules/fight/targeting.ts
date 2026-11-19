// Targeting facts a fight needs from a combatant: the AC it is attacked at, whether two are within 5 feet, the typed
// defenses of the stat block it came from. Pure and edge-importable (relative `.ts` imports only); the runner's UI and
// the server's fight resolution both read it.
import { combatantFootprint } from "../../lib/battlemap/tokenFootprint.ts";
import type { RunCombatant } from "../../types/encounter.types.ts";
import type { Companion } from "../../types/companion.types.ts";
import type { Monster, MonsterStatBlock } from "../../types/monster.types.ts";
import type { NpcListRow } from "../../types/npc.types.ts";
import { emptyDefenses, type Defenses, type SrdConditionName } from "../../types/statBlock.types.ts";
import { boxesWithinFiveFeet } from "./terrain/sight.ts";

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

/**
 * Whether two combatants are within 5 feet of each other, from their grid
 * placement (5 ft per cell, diagonals count the same as straight lines). True
 * when the gap between their footprints is less than one cell: they touch,
 * overlap, or stand in neighbouring squares. A Tiny creature's box is half a
 * cell, so a Tiny in the near half of a square is still next to the Medium
 * beside it. Null when either is not on the map, so the caller asks the DM
 * instead of guessing.
 */
export function withinFiveFeet(a: RunCombatant, b: RunCombatant): boolean | null {
  if (!a.position || !b.position) return null;
  return boxesWithinFiveFeet({ anchor: a.position, footprint: combatantFootprint(a) }, { anchor: b.position, footprint: combatantFootprint(b) });
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
